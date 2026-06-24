import { unref, type Ref, type ComputedRef } from "vue";
import invoiceService from "../../../services/invoiceService";
import { isApiEnvelopeError, unwrapApiResult } from "../../../services/api";
import {
	saveOfflineInvoice,
	isOffline,
	updateLocalStock,
} from "../../../../offline/index";
import { ensureInvoiceClientRequestId } from "../../../../offline/idempotency";
import stockCoordinator from "../../../utils/stockCoordinator";
import { parseBooleanSetting } from "../../../utils/stock";
import { resolvePosDocumentDoctype } from "../../../utils/posDocumentMode";
import { toCompanyCurrency } from "../../../utils/erpnextCurrency";
import { shouldApplyReturnRefundCap } from "../../../utils/paymentInitialization";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface PaymentSubmissionOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	stockSettings: Ref<any>;
	invoiceType: Ref<string>;
	is_write_off_change?: Ref<boolean>;
	formatFloat: (_val: any, _prec?: number) => number;
	currencyPrecision?: Ref<number>;
	isCashback?: Ref<boolean>;
	paidChange?: Ref<number>;
	creditChange?: Ref<number>;
	redeemedCustomerCredit?: Ref<number>;
	customerCreditDict?: Ref<any[]>;
	giftCardRedemptions?: Ref<any[]>;
	diff_payment?: ComputedRef<number>;
	is_credit_sale?: Ref<boolean>;
	loyaltyAmount?: Ref<number>;
	customerInfo?: Ref<any>;
	stores?: {
		toastStore?: any;
		syncStore?: any;
		customersStore?: any;
		uiStore?: any;
		invoiceStore?: any;
	};
}

export interface SubmissionCallbacks {
	onSuccess?: (_message: any) => void;
	onPrint?: (
		_doc: any,
		_options?: {
			name?: string;
			doctype?: string;
			waitForPostSubmitPayments?: boolean;
			waitForInvoiceProcessing?: boolean;
		},
	) => void;
	onFinishNavigation?: (_success: boolean) => void;
	onScheduleBackgroundCheck?: (_payload: {
		name?: string;
		doctype?: string;
		print?: boolean;
		waitForPostSubmitPayments?: boolean;
		waitForInvoiceProcessing?: boolean;
	}) => void;
}

export function usePaymentSubmission(options: PaymentSubmissionOptions) {
	const {
		invoiceDoc,
		posProfile,
		stockSettings,
		invoiceType,
		formatFloat,
		stores,
	} = options;

	const currencyContext = (doc = unref(invoiceDoc)) => ({
		...(doc || {}),
		pos_profile: unref(posProfile),
	});

	const formatStockErrors = (errors: any[]) => {
		const settings = unref(stockSettings) || {};
		const profile = unref(posProfile) || {};
		const type = unref(invoiceType);

		// Logic for blocking sale
		let blockSaleBeyondAvailableQty = false;
		if (!["Order", "Quotation"].includes(type)) {
			const val = profile.posa_block_sale_beyond_available_qty;
			blockSaleBeyondAvailableQty =
				val === true ||
				val === "true" ||
				val === 1 ||
				val === "1" ||
				val === "Yes";
		}

		const msg = errors
			.map(
				(e) =>
					`${e.item_code} (${e.warehouse}) - ${formatFloat(e.available_qty)}`,
			)
			.join("\n");

		const blocking =
			!settings.allow_negative_stock || blockSaleBeyondAvailableQty;

		return blocking
			? __("Insufficient stock:\n{0}", [msg])
			: __("Stock is lower than requested:\n{0}", [msg]);
	};

	const formatStockIssueLines = (issues: any[]) =>
		issues
			.map(
				(issue) =>
					`${issue.item_code} (${issue.warehouse || __("Unknown Warehouse")}) - ${formatFloat(issue.available_qty)} / ${formatFloat(issue.requested_qty)} requested`,
			)
			.join("\n");

	const shouldValidateStockForSubmission = (doc: any, type: string) => {
		if (!doc || doc.is_return) {
			return false;
		}

		const doctype = String(doc.doctype || "").trim();
		if (
			["Order", "Quotation"].includes(type) ||
			["Sales Order", "Quotation", "Purchase Order"].includes(doctype)
		) {
			return false;
		}

		if (doctype === "Sales Invoice") {
			return parseBooleanSetting(doc.update_stock);
		}

		return true;
	};

	const validateStockBeforeOnlineSubmission = async (doc: any, profile: any, type: string) => {
		if (!shouldValidateStockForSubmission(doc, type)) {
			return;
		}

		const response = await frappe.call({
			method: "posawesome.posawesome.api.invoices.validate_cart_items",
			args: {
				items: JSON.stringify(doc.items || []),
				pos_profile: profile?.name,
			},
		});
		const payload = response?.message;
		const blockingErrors = Array.isArray(payload)
			? payload
			: Array.isArray(payload?.errors)
				? payload.errors
				: [];
		const warnings = Array.isArray(payload?.warnings)
			? payload.warnings
			: [];

		if (blockingErrors.length) {
			throw new Error(formatStockErrors(blockingErrors));
		}

		if (warnings.length) {
			stores?.toastStore?.show({
				title: __("Stock is lower than requested"),
				detail: formatStockIssueLines(warnings),
				color: "warning",
			});
		}
	};

	const extractSubmissionErrorMessage = (exc: any): string => {
		if (!exc) {
			return __("Unknown error");
		}
		if (isApiEnvelopeError(exc)) {
			return exc.envelope.ok
				? __("Unknown error")
				: exc.envelope.error.message || __("Unknown error");
		}
		if (exc?._server_messages) {
			try {
				const parsed = JSON.parse(exc._server_messages);
				if (Array.isArray(parsed) && parsed.length) {
					const first = parsed[0];
					// Check if message is a JSON string containing errors (stock validation)
					try {
						const msgObj = JSON.parse(first);
						if (msgObj.errors && Array.isArray(msgObj.errors)) {
							return formatStockErrors(msgObj.errors);
						}
					} catch {
						/* Not a JSON string */
					}

					if (typeof first === "string") {
						return frappe?.utils?.strip_html
							? frappe.utils.strip_html(first)
							: first;
					}
				}
			} catch {
				/* ignore parse issues */
			}
		}
		if (exc?.message) {
			try {
				const parsed = JSON.parse(exc.message);
				if (parsed.errors && Array.isArray(parsed.errors)) {
					return formatStockErrors(parsed.errors);
				}
			} catch {
				/* Not a JSON string */
			}
			return exc.message;
		}
		return exc.toString ? exc.toString() : __("Unknown error");
	};

	const getSubmissionErrorCode = (exc: any): string | null => {
		if (!isApiEnvelopeError(exc) || exc.envelope.ok) {
			return null;
		}
		return exc.envelope.error.code || null;
	};

	const buildSubmissionFailureToast = (exc: any, message: string) => {
		const code = getSubmissionErrorCode(exc);
		const requestId = isApiEnvelopeError(exc) ? exc.requestId : null;
		const detail = requestId
			? __("Request ID: {0}", [requestId])
			: undefined;

		if (
			code === "TIMEOUT" ||
			code === "HTTP_ERROR" ||
			code === "TRANSPORT_ERROR"
		) {
			return {
				title: __("Connection problem while submitting invoice"),
				detail: detail ? `${message}\n${detail}` : message,
				color: "error",
			};
		}

		if (code === "VALIDATION_ERROR" || code === "BUSINESS_RULE") {
			return {
				title: __("Unable to submit invoice"),
				detail: detail ? `${message}\n${detail}` : message,
				color: "error",
			};
		}

		return {
			title: __("Error submitting invoice: ") + message,
			detail,
			color: "error",
		};
	};

	const fetchSubmittedDocstatus = async (
		doc: any,
	): Promise<number | null> => {
		const doctype =
			doc?.doctype ||
			(unref(posProfile)?.create_pos_invoice_instead_of_sales_invoice
				? "POS Invoice"
				: "Sales Invoice");
		const name = doc?.name;
		if (!doctype || !name) {
			return null;
		}

		try {
			const result = await frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype,
					filters: { name },
					fieldname: ["docstatus"],
				},
			});
			const status = result?.message?.docstatus;
			return Number.isFinite(Number(status)) ? Number(status) : null;
		} catch (error) {
			console.warn(
				"Unable to verify submitted docstatus after conflict",
				error,
			);
			return null;
		}
	};

	const getWriteOffLimit = (profile: any): number | null => {
		if (!profile) return null;
		const possibleLimitFields = [
			"write_off_limit",
			"posa_max_write_off_amount",
			"max_write_off_amount",
			"write_off_amount",
			"posa_write_off_limit",
		];

		for (const field of possibleLimitFields) {
			const rawValue = profile?.[field];
			if (
				rawValue === undefined ||
				rawValue === null ||
				rawValue === ""
			) {
				continue;
			}
			const parsed = formatFloat(rawValue);
			if (parsed > 0) {
				return parsed;
			}
		}

		return null;
	};

	const getEffectiveWriteOffAmount = (
		doc: any,
		profile: any,
		diffAmount: number,
	): number => {
		if (!doc || doc.is_return || !unref(options.is_write_off_change)) {
			return 0;
		}

		const outstanding = Math.max(formatFloat(diffAmount), 0);
		if (outstanding <= 0) {
			return 0;
		}

		const requestedWriteOff = Math.max(
			formatFloat(doc?.write_off_amount || 0),
			0,
		);

		const writeOffLimit = getWriteOffLimit(profile);
		if (writeOffLimit === null) {
			return formatFloat(
				requestedWriteOff > 0
					? Math.min(requestedWriteOff, outstanding)
					: outstanding,
			);
		}

		const cappedByLimit = Math.min(outstanding, writeOffLimit);
		if (requestedWriteOff > 0) {
			return formatFloat(Math.min(requestedWriteOff, cappedByLimit));
		}

		return formatFloat(cappedByLimit);
	};

	const validateDueDate = () => {
		const doc = unref(invoiceDoc);
		if (!doc || !doc.due_date) return;

		const today = frappe?.datetime?.now_date?.();
		if (!today) return;

		const new_date = Date.parse(doc.due_date);
		const parse_today = Date.parse(today);
		if (new_date < parse_today) {
			doc.due_date = today;
		}
	};

	const getLoyaltyRedemptionForSubmission = (doc: any) => {
		const prec = unref(options.currencyPrecision) || 2;
		const requestedAmount = formatFloat(unref(options.loyaltyAmount) || 0, prec);
		const docAmount = formatFloat(doc?.loyalty_amount || 0, prec);
		const loyaltyAmount = requestedAmount > 0 ? requestedAmount : docAmount;
		if (loyaltyAmount <= 0) {
			return { amount: 0, points: 0 };
		}

		const existingPoints = Math.trunc(formatFloat(doc?.loyalty_points || 0, prec));
		if (existingPoints > 0) {
			return { amount: loyaltyAmount, points: existingPoints };
		}

		const info = unref(options.customerInfo) || {};
		const conversionFactor = Number(info.conversion_factor || 0);
		if (conversionFactor <= 0) {
			return { amount: 0, points: 0 };
		}

		const baseAmount = toCompanyCurrency(currencyContext(doc), loyaltyAmount);
		const loyaltyPoints = Math.trunc(baseAmount / conversionFactor);
		if (loyaltyPoints <= 0) {
			return { amount: 0, points: 0 };
		}

		return { amount: loyaltyAmount, points: loyaltyPoints };
	};

	const validateSubmission = async (payment_received = false) => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		const prec = unref(options.currencyPrecision) || 2;
		const {
			isCashback,
			paidChange,
			creditChange,
			redeemedCustomerCredit,
			customerCreditDict,
			diff_payment,
		} = options;
		const diff = unref(diff_payment) || 0;
		const writeOffAmount = getEffectiveWriteOffAmount(doc, profile, diff);

		// 1. Ensure return payments are negative
		if (doc.is_return) {
			ensureReturnPaymentsAreNegative();

			// Never refund more cash than was actually paid on the original
			// invoice. Mirrors the backend guard, but blocks here so the cashier
			// gets one clean message instead of a failed submit round-trip
			// (which the API layer would surface as a "connection problem").
			if (shouldApplyReturnRefundCap(doc)) {
				let refund = 0;
				(doc.payments || []).forEach((p: any) => {
					refund += Math.abs(formatFloat(p.amount, prec));
				});
				const refundable = formatFloat(doc.posa_refundable_amount, prec);
				if (refund > refundable + 0.001) {
					throw new Error(
						__(
							'Cannot refund {0} for this return: only {1} was paid on the original invoice. Turn on "Store as Credit?" to record it as a credit note that reduces the customer\'s balance.',
							[refund, refundable],
						),
					);
				}
			}
		}

		let current_total_payments = 0;
		if (doc.payments) {
			doc.payments.forEach((p: any) => {
				current_total_payments += formatFloat(p.amount, prec);
			});
		}
		// Add loyalty and credit
		const loyaltyRedemption = getLoyaltyRedemptionForSubmission(doc);
		if (loyaltyRedemption.amount > 0)
			current_total_payments += loyaltyRedemption.amount;
		if (
			options.redeemedCustomerCredit &&
			unref(options.redeemedCustomerCredit)
		)
			current_total_payments += unref(options.redeemedCustomerCredit)!;
		if (
			options.giftCardRedemptions &&
			Array.isArray(unref(options.giftCardRedemptions))
		) {
			current_total_payments += unref(options.giftCardRedemptions).reduce(
				(sum: number, row: any) =>
					sum + formatFloat(row?.amount || 0, prec),
				0,
			);
		}

		const invoice_total = formatFloat(
			doc.rounded_total || doc.grand_total,
			prec,
		);
		const effective_total_payments = formatFloat(
			current_total_payments + writeOffAmount,
			prec,
		);
		const writeOffLimit = getWriteOffLimit(profile);
		const writeOffCappedByLimit =
			Boolean(unref(options.is_write_off_change)) &&
			writeOffLimit !== null &&
			diff > writeOffLimit + 0.001;
		const hasAnySettlement =
			effective_total_payments > 0 ||
			(Array.isArray(doc.payments)
				? doc.payments.some(
						(payment: any) =>
							formatFloat(payment?.amount || 0, prec) > 0,
					)
				: false);

		// 2. Validate total payments
		if (
			writeOffCappedByLimit &&
			!profile.posa_allow_partial_payment &&
			effective_total_payments < invoice_total - 0.001
		) {
			throw new Error(
				__(
					"Write off amount exceeds the allowed limit ({0}). Please add payment for the remaining amount.",
					[writeOffLimit],
				),
			);
		}

		if (
			!unref(options.is_credit_sale) &&
			!doc.is_return &&
			!hasAnySettlement &&
			invoice_total > 0
		) {
			throw new Error(__("Please enter payment amount"));
		}

		// 3. Validate partial payments / cash payments
		if (!unref(options.is_credit_sale) && !doc.is_return) {
			let has_cash_payment = false;
			let cash_amount = 0;
			if (doc.payments) {
				doc.payments.forEach((payment: any) => {
					if (
						payment.mode_of_payment.toLowerCase().includes("cash")
					) {
						has_cash_payment = true;
						cash_amount = formatFloat(payment.amount, prec);
					}
				});
			}

			if (has_cash_payment && cash_amount > 0) {
				if (
					!profile.posa_allow_partial_payment &&
					formatFloat(cash_amount + writeOffAmount, prec) <
						invoice_total &&
					invoice_total > 0
				) {
					throw new Error(
						__(
							"Cash payment cannot be less than invoice total when partial payment is not allowed",
						),
					);
				}
			}

			if (
				!profile.posa_allow_partial_payment &&
				effective_total_payments < invoice_total &&
				invoice_total > 0
			) {
				throw new Error(__("The amount paid is not complete"));
			}
		}

		// 4. Validate phone payment
		if (!payment_received && doc.payments) {
			let phone_payment_is_valid = true;
			doc.payments.forEach((payment: any) => {
				if (
					payment.type === "Phone" &&
					![0, "0", "", null, undefined].includes(payment.amount)
				) {
					phone_payment_is_valid = false;
				}
			});
			if (!phone_payment_is_valid) {
				throw new Error(
					__(
						"Please request phone payment or use another payment method",
					),
				);
			}
		}

		// 5. Validate paid_change
		const changeLimit = Math.max(-diff, 0);
		const pChange = unref(paidChange) || 0;
		if (pChange > changeLimit + 0.001) {
			throw new Error(
				__("Paid change cannot be greater than total change!"),
			);
		}

		// 6. Validate cashback
		const cChange = unref(creditChange) || 0;
		let total_change_calc = formatFloat(pChange + Math.abs(cChange), prec);
		if (
			unref(isCashback) &&
			Math.abs(total_change_calc - changeLimit) > 0.01
		) {
			throw new Error(__("Error in change calculations!"));
		}

		// 7. Validate customer credit redemption
		if (customerCreditDict?.value?.length) {
			let credit_calc_check = customerCreditDict.value.filter(
				(row: any) => {
					return (
						formatFloat(row.credit_to_redeem, prec) >
						formatFloat(row.total_credit, prec)
					);
				},
			);
			if (credit_calc_check.length > 0) {
				throw new Error(
					__("Redeemed credit cannot be greater than its total."),
				);
			}
		}

		if (
			!doc.is_return &&
			unref(redeemedCustomerCredit) !== undefined &&
			unref(redeemedCustomerCredit)! > invoice_total
		) {
			throw new Error(
				__("Cannot redeem customer credit more than invoice total"),
			);
		}

		const giftCardRows = Array.isArray(options.giftCardRedemptions?.value)
			? options.giftCardRedemptions?.value || []
			: [];
		const totalGiftCardRedemption = giftCardRows.reduce(
			(sum: number, row: any) =>
				sum + formatFloat(row?.amount || 0, prec),
			0,
		);
		const invalidGiftCardRow = giftCardRows.find(
			(row: any) =>
				formatFloat(row?.amount || 0, prec) > 0 &&
				!String(row?.gift_card_code || "").trim(),
		);
		if (invalidGiftCardRow) {
			throw new Error(__("Gift card code is required for redemption"));
		}
		if (!doc.is_return && totalGiftCardRedemption > invoice_total + 0.001) {
			throw new Error(
				__("Cannot redeem gift cards more than invoice total"),
			);
		}

		return true;
	};

	const normalizeLoyaltyRedemptionForSubmission = (doc: any) => {
		if (!doc) {
			return doc;
		}

		const clearLoyaltyRedemption = () => {
			doc.loyalty_amount = 0;
			doc.redeem_loyalty_points = 0;
			doc.loyalty_points = 0;
			return doc;
		};

		const loyaltyRedemption = getLoyaltyRedemptionForSubmission(doc);
		if (loyaltyRedemption.amount <= 0 || loyaltyRedemption.points <= 0) {
			return clearLoyaltyRedemption();
		}

		const info = unref(options.customerInfo) || {};
		if (!doc.loyalty_program && info.loyalty_program) {
			doc.loyalty_program = info.loyalty_program;
		}

		doc.loyalty_amount = loyaltyRedemption.amount;
		doc.redeem_loyalty_points = 1;
		doc.loyalty_points = loyaltyRedemption.points;
		return doc;
	};

	const buildSubmissionInvoiceDoc = (doc: any) => {
		const submissionDoc = JSON.parse(JSON.stringify(doc || {}));
		ensureInvoiceClientRequestId(submissionDoc);
		normalizeLoyaltyRedemptionForSubmission(submissionDoc);
		return submissionDoc;
	};

	function ensureReturnPaymentsAreNegative() {
		const doc = unref(invoiceDoc);
		if (!doc || !doc.is_return) {
			return;
		}
		// Check if any payment amount is set
		let hasPaymentSet = false;
		if (doc.payments) {
			doc.payments.forEach((payment: any) => {
				if (Math.abs(payment.amount) > 0) {
					hasPaymentSet = true;
				}
			});
		}

		// Credit returns intentionally keep payment rows at 0. If a non-zero row
		// exists, it still must be negative for ERPNext return validation.
		if (!hasPaymentSet && unref(options.isCashback) === false) {
			return;
		}

		// If no payment set, set the default one
		if (!hasPaymentSet && doc.payments) {
			const default_payment = doc.payments.find(
				(payment: any) => payment.default === 1,
			);
			if (default_payment) {
				const amount = doc.rounded_total || doc.grand_total;
				default_payment.amount = -Math.abs(amount);
				if (default_payment.base_amount !== undefined) {
					default_payment.base_amount = -Math.abs(
						toCompanyCurrency(currencyContext(doc), amount),
					);
				}
			}
		}
		// Ensure all set payments are negative
		if (doc.payments) {
			doc.payments.forEach((payment: any) => {
				if (payment.amount > 0) {
					payment.amount = -Math.abs(payment.amount);
				}
				if (
					payment.base_amount !== undefined &&
					payment.base_amount > 0
				) {
					payment.base_amount = -Math.abs(payment.base_amount);
				}
			});
		}
	}

	function restoreReturnPayments() {
		const doc = unref(invoiceDoc);
		if (!doc?.payments) {
			return;
		}

		doc.payments.forEach((payment: any) => {
			if (payment.amount < 0) {
				payment.amount = Math.abs(payment.amount);
			}
			if (payment.base_amount !== undefined && payment.base_amount < 0) {
				payment.base_amount = Math.abs(payment.base_amount);
			}
		});
	}

	const submitInvoice = async (
		print: boolean,
		callbacks: SubmissionCallbacks = {},
	): Promise<any> => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		const type = unref(invoiceType);
		const prec = unref(options.currencyPrecision) || 2;
		const {
			isCashback,
			paidChange,
			creditChange,
			redeemedCustomerCredit,
			customerCreditDict,
			diff_payment,
		} = options;

		const {
			onSuccess,
			onPrint,
			onFinishNavigation,
			onScheduleBackgroundCheck,
		} = callbacks;

		if (doc.is_return) {
			ensureReturnPaymentsAreNegative();
		}

		let totalPayedAmount = 0;
		if (doc.payments) {
			doc.payments.forEach((payment: any) => {
				payment.amount = formatFloat(payment.amount, prec);
				totalPayedAmount += payment.amount;
			});
		}

		if (doc.is_return && totalPayedAmount === 0) {
			doc.is_pos = 0;
		}

		if (customerCreditDict?.value?.length) {
			customerCreditDict.value.forEach((row: any) => {
				row.credit_to_redeem = formatFloat(row.credit_to_redeem, prec);
			});
		}

		const diff = unref(diff_payment) || 0;
		const writeOffAmount = getEffectiveWriteOffAmount(doc, profile, diff);
		const changeLimit = !doc.is_return ? Math.max(-diff, 0) : 0;
		let pChange = !doc.is_return
			? formatFloat(Math.min(unref(paidChange) || 0, changeLimit), prec)
			: 0;
		let cChange = !doc.is_return
			? formatFloat(Math.max(changeLimit - pChange, 0), prec)
			: 0;

		if (
			!doc.is_return &&
			changeLimit > 0 &&
			pChange <= 0 &&
			Array.isArray(doc.payments)
		) {
			const configuredCashMop = String(
				profile?.posa_cash_mode_of_payment || "",
			).toLowerCase();
			const paidRows = doc.payments.filter(
				(payment: any) => formatFloat(payment?.amount || 0, prec) > 0,
			);
			const hasCashPaid = paidRows.some((payment: any) => {
				const mode = String(
					payment?.mode_of_payment || "",
				).toLowerCase();
				const type = String(payment?.type || "").toLowerCase();
				if (type === "cash") return true;
				if (configuredCashMop && mode === configuredCashMop)
					return true;
				return mode.includes("cash");
			});
			const hasNonCashPaid = paidRows.some((payment: any) => {
				const mode = String(
					payment?.mode_of_payment || "",
				).toLowerCase();
				const type = String(payment?.type || "").toLowerCase();
				if (type === "cash") return false;
				if (configuredCashMop && mode === configuredCashMop)
					return false;
				return !mode.includes("cash");
			});

			if (hasNonCashPaid && !hasCashPaid) {
				pChange = formatFloat(changeLimit, prec);
				cChange = 0;
			}
		}

		if (doc) {
			ensureInvoiceClientRequestId(doc);
			doc.write_off_amount = writeOffAmount;
			doc.base_write_off_amount = formatFloat(
				toCompanyCurrency(currencyContext(doc), writeOffAmount),
				prec,
			);
			doc.paid_change = pChange;
			doc.credit_change = cChange;
		}

		if (!doc.is_return) {
			if (creditChange) creditChange.value = cChange;
			if (paidChange) paidChange.value = pChange;
		}

		const submissionDoc = buildSubmissionInvoiceDoc(doc);

		const data = {
			total_change: changeLimit,
			paid_change: pChange,
			credit_change: cChange,
			is_credit_sale: unref(options.is_credit_sale) ? 1 : 0,
			is_write_off_change: unref(options.is_write_off_change) ? 1 : 0,
			write_off_amount: writeOffAmount,
			redeemed_customer_credit: unref(redeemedCustomerCredit),
			customer_credit_dict: unref(customerCreditDict),
			gift_card_redemptions: unref(options.giftCardRedemptions) || [],
			is_cashback: unref(isCashback),
		};
		const hasGiftCardRedemption =
			Array.isArray(data.gift_card_redemptions) &&
			data.gift_card_redemptions.some(
				(row: any) => formatFloat(row?.amount || 0, prec) > 0,
			);
		const hasPostSubmitPaymentWork =
			Boolean(profile?.posa_allow_submissions_in_background_job) &&
			(formatFloat(unref(redeemedCustomerCredit) || 0, prec) > 0 ||
				hasGiftCardRedemption ||
				pChange > 0 ||
				cChange > 0);

		if (isOffline()) {
			if (hasGiftCardRedemption) {
				throw new Error(
					__("Gift card redemption requires an online connection"),
				);
			}
			try {
				await saveOfflineInvoice({ data, invoice: submissionDoc });
				stores?.syncStore?.updatePendingCount();
				stores?.toastStore?.show({
					title: __("Invoice saved offline"),
					color: "warning",
				});

				if (print && onPrint) {
					onPrint(doc);
				}

				if (stores?.customersStore?.setSelectedCustomer) {
					stores.customersStore.setSelectedCustomer(
						profile?.customer || null,
					);
				}

				if (onFinishNavigation) onFinishNavigation(true);

				return { offline: true };
			} catch (error: any) {
				const errorMsg = error.message || __("Unknown error");
				stores?.toastStore?.show({
					title: __("Cannot Save Offline Invoice: ") + errorMsg,
					color: "error",
				});
				throw error;
			}
		}

		// Online Submission
		try {
			await validateStockBeforeOnlineSubmission(doc, profile, type);
			const message = unwrapApiResult(
				await invoiceService.submitInvoice(
					data,
					submissionDoc,
					type,
					profile,
				),
			);

			const r = { message };

			if (!r.message) {
				const reason = __("No response from server");
				const failedInfo = {
					invoice: doc?.name,
					reason,
				};

				stores?.toastStore?.show({
					title: __(
						"Error submitting invoice: No response from server",
					),
					color: "error",
				});
				const err: any = new Error(reason);
				err.failedInfo = failedInfo;
				throw err;
			}

			const docstatus = r.message?.docstatus;
			const status = r.message?.status;
			const responseInvoiceName = r.message?.name || doc?.name;
			const backgroundReason =
				r.message?.error ||
				r.message?.exc ||
				r.message?.exception ||
				r.message?.message;

			const wasSubmitted =
				docstatus === 1 ||
				status === 1 ||
				(docstatus === undefined && status === undefined);
			const waitForInvoiceProcessing =
				Boolean(profile?.posa_allow_submissions_in_background_job) &&
				!wasSubmitted;
			const submittedDoctype =
				r.message?.doctype ||
				doc?.doctype ||
				(profile?.create_pos_invoice_instead_of_sales_invoice
					? "POS Invoice"
					: "Sales Invoice");

			if (!wasSubmitted && backgroundReason) {
				const failedInfo = {
					invoice: responseInvoiceName,
					reason: backgroundReason,
				};

				stores?.toastStore?.show({
					title: __("Error submitting invoice: {0}", [
						responseInvoiceName || "",
					]),
					color: "error",
					detail: backgroundReason,
				});

				// Background job specific logic
				if (profile?.posa_allow_submissions_in_background_job) {
					if (onFinishNavigation) onFinishNavigation(true);
					if (onScheduleBackgroundCheck) {
						onScheduleBackgroundCheck({
							name: responseInvoiceName,
							doctype: r.message?.doctype,
							print,
							waitForPostSubmitPayments: false,
							waitForInvoiceProcessing: true,
						});
					}
					// Return special status indicating background failure handled
					return {
						backgroundFailure: true,
						reason: backgroundReason,
					};
				}

				const err: any = new Error(backgroundReason);
				err.failedInfo = failedInfo;
				throw err;
			}

			// Success
			if (
				print &&
				onPrint &&
				!waitForInvoiceProcessing &&
				!hasPostSubmitPaymentWork
			) {
				onPrint(doc, {
					name: responseInvoiceName,
					doctype: submittedDoctype,
					waitForPostSubmitPayments: hasPostSubmitPaymentWork,
					waitForInvoiceProcessing,
				});
			}

			// Reset local state vars
			if (customerCreditDict) customerCreditDict.value = [];

			if (stores?.invoiceStore?.invoiceDoc) {
				stores.invoiceStore.invoiceDoc.docstatus = 1;
			}

			if (stores?.uiStore) {
				stores.uiStore.setLastInvoice(doc.name);
			}

			if (!waitForInvoiceProcessing) {
				const submittedDocumentType = resolvePosDocumentDoctype({
					invoiceType: type,
					posProfile: profile,
				});
				const submittedTitle =
					submittedDocumentType === "Sales Order"
						? __("Sales Order {0} is Submitted", [r.message.name])
						: submittedDocumentType === "Quotation"
							? __("Quotation {0} is Submitted", [r.message.name])
							: __("Invoice {0} is Submitted", [r.message.name]);
				stores?.toastStore?.show(
					hasPostSubmitPaymentWork
						? {
								key: `invoice-processing::${responseInvoiceName}`,
								title: __("Invoice Submitted"),
								summary: submittedTitle,
								detail: __(
									"Processing payment entries for Invoice {0}",
									[responseInvoiceName],
								),
								color: "info",
								timeout: -1,
								loading: true,
							}
						: {
								key: `invoice-processing::${responseInvoiceName}`,
								title: submittedTitle,
								color: "success",
							},
				);
			}

			if (frappe?.utils?.play_sound) {
				frappe.utils.play_sound("submit");
			}

			const submittedItems = Array.isArray(doc.items) ? doc.items : [];
			updateLocalStock(submittedItems);
			stockCoordinator.applyInvoiceConsumption(submittedItems, {
				source: "invoice",
			});
			const submittedCodes = submittedItems
				.map((item) => (item ? item.item_code : null))
				.filter((code) => code !== undefined && code !== null);

			if (stores?.uiStore) {
				stores.uiStore.setLastStockAdjustment({
					items: submittedItems,
					item_codes: submittedCodes,
					timestamp: Date.now(),
				});
			}

			if (onFinishNavigation) onFinishNavigation(true);

			if (stores?.customersStore?.setSelectedCustomer) {
				stores.customersStore.setSelectedCustomer(
					profile?.customer || null,
				);
			}

			if (
				onScheduleBackgroundCheck &&
				(waitForInvoiceProcessing || hasPostSubmitPaymentWork)
			) {
				onScheduleBackgroundCheck({
					name: responseInvoiceName,
					doctype: submittedDoctype,
					print,
					waitForPostSubmitPayments: hasPostSubmitPaymentWork,
					waitForInvoiceProcessing,
				});
			}

			if (onSuccess) {
				onSuccess(r.message);
			}

			return { success: true, message: r.message };
		} catch (exc: any) {
			const errorCode = getSubmissionErrorCode(exc);
			const requestId = isApiEnvelopeError(exc)
				? exc.requestId
				: undefined;
			console.error("Error submitting invoice:", {
				code: errorCode,
				requestId,
				error: exc,
			});
			const errorMsg = extractSubmissionErrorMessage(exc);

			if (errorCode === "TIMESTAMP_MISMATCH") {
				const submittedStatus = await fetchSubmittedDocstatus(doc);
				if (submittedStatus === 1) {
					stores?.toastStore?.show({
						title: __("Invoice {0} was already submitted", [
							doc?.name || "",
						]),
						color: "warning",
					});

					if (stores?.uiStore && doc?.name) {
						stores.uiStore.setLastInvoice(doc.name);
					}

					if (onFinishNavigation) {
						onFinishNavigation(true);
					}

					if (stores?.customersStore?.setSelectedCustomer) {
						stores.customersStore.setSelectedCustomer(
							profile?.customer || null,
						);
					}

					if (onSuccess) {
						onSuccess({
							name: doc?.name,
							doctype: doc?.doctype,
							docstatus: 1,
							recovered: true,
						});
					}

					return {
						recoveredDuplicateSubmission: true,
						message: {
							name: doc?.name,
							doctype: doc?.doctype,
							docstatus: 1,
						},
					};
				}
			}

			if (errorCode === "RETURN_PAYMENT_AMOUNT_SIGN") {
				stores?.toastStore?.show({
					title: __("Fixing payment amounts for return invoice..."),
					color: "warning",
				});

				if (doc.payments) {
					doc.payments.forEach((payment: any) => {
						if (payment.amount > 0)
							payment.amount = -Math.abs(payment.amount);
						if (payment.base_amount > 0)
							payment.base_amount = -Math.abs(
								payment.base_amount,
							);
					});
				}
				// Retry
				console.log("Retrying submission with fixed payment amounts");
				return new Promise((resolve) =>
					setTimeout(
						() => resolve(submitInvoice(print, callbacks)),
						500,
					),
				);
			}

			stores?.toastStore?.show(
				buildSubmissionFailureToast(exc, errorMsg),
			);

			if (profile?.posa_allow_submissions_in_background_job) {
				if (onFinishNavigation) onFinishNavigation(true);
				if (onScheduleBackgroundCheck) {
					onScheduleBackgroundCheck({
						name: doc?.name,
						doctype: doc?.doctype,
						print,
						waitForPostSubmitPayments: false,
						waitForInvoiceProcessing: true,
					});
				}
			}

			throw exc;
		}
	};

	return {
		validateDueDate,
		ensureReturnPaymentsAreNegative,
		restoreReturnPayments,
		validateSubmission,
		submitInvoice,
		extractSubmissionErrorMessage,
	};
}
