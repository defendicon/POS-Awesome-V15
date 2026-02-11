import { ref } from "vue";

declare const frappe: any;

export function useClosingShift(eventBus: any) {
	const closingDialog = ref(false);
	const dialog_data = ref<any>({});
	const overview = ref<any>(null);
	const overviewLoading = ref(false);
	const pos_profile = ref("");

	const closeDialog = () => {
		closingDialog.value = false;
		overview.value = null;
		overviewLoading.value = false;
	};

	const fetchOverview = (
		openingShift: string,
		posProfileCurrency: string,
	) => {
		overviewLoading.value = true;
		overview.value = null;
		if (!openingShift) {
			overviewLoading.value = false;
			return;
		}

		const toNumber = (value: unknown) => {
			const number = Number(value);
			return Number.isFinite(number) ? number : 0;
		};

		const normalizeRates = (rates: unknown) => {
			if (Array.isArray(rates)) {
				return rates
					.map((rate) => Number(rate))
					.filter((rate) => Number.isFinite(rate) && rate > 0);
			}
			if (rates === null || rates === undefined || rates === "") {
				return [];
			}
			const numeric = Number(rates);
			return Number.isFinite(numeric) && numeric > 0 ? [numeric] : [];
		};

		const normalizeCurrencyRows = (value: unknown, options: any = {}) => {
			if (!Array.isArray(value)) {
				return [];
			}

			const { includeCount = false, includeExchangeRates = false } =
				options;

			return value.map((row: any) => {
				const record: any = {
					currency: row?.currency || "",
					total: toNumber(row?.total),
					company_currency_total: toNumber(
						row?.company_currency_total,
					),
					exchange_rates: includeExchangeRates
						? normalizeRates(row?.exchange_rates)
						: [],
				};

				if (includeCount) {
					record.invoice_count = toNumber(row?.invoice_count);
				}

				return record;
			});
		};

		const normalizePayments = (value: unknown) => {
			if (!Array.isArray(value)) {
				return [];
			}

			return value.map((row: any) => ({
				mode_of_payment: row?.mode_of_payment || "",
				currency: row?.currency || "",
				total: toNumber(row?.total),
				company_currency_total: toNumber(row?.company_currency_total),
				exchange_rates: normalizeRates(row?.exchange_rates),
			}));
		};

		const normalizeCredit = (credit: any = {}) => ({
			count: toNumber(credit?.count),
			company_currency_total: toNumber(credit?.company_currency_total),
			by_currency: normalizeCurrencyRows(credit?.by_currency, {
				includeCount: true,
				includeExchangeRates: true,
			}),
		});

		const normalizeChangeReturned = (change: any = {}) => {
			const normalizeBranch = (branch: any = {}) => ({
				company_currency_total: toNumber(
					branch?.company_currency_total,
				),
				by_currency: normalizeCurrencyRows(branch?.by_currency, {
					includeExchangeRates: true,
				}),
			});

			const invoiceChange = normalizeBranch(
				change?.invoice_change || change || {},
			);
			const overpaymentChange = normalizeBranch(
				change?.overpayment_change || {},
			);

			const primaryByCurrency = normalizeCurrencyRows(
				change?.by_currency,
				{
					includeExchangeRates: true,
				},
			);

			const totalCompanyCurrencyValue = change?.company_currency_total;
			const totalCompanyCurrency = toNumber(totalCompanyCurrencyValue);
			const derivedTotalCompanyCurrency =
				invoiceChange.company_currency_total +
				overpaymentChange.company_currency_total;
			const hasTotalCompanyCurrency =
				totalCompanyCurrencyValue !== undefined &&
				totalCompanyCurrencyValue !== null &&
				totalCompanyCurrencyValue !== "";

			return {
				company_currency_total: hasTotalCompanyCurrency
					? totalCompanyCurrency
					: derivedTotalCompanyCurrency,
				by_currency: primaryByCurrency.length
					? primaryByCurrency
					: invoiceChange.by_currency,
				invoice_change: invoiceChange,
				overpayment_change: overpaymentChange,
			};
		};

		const normalizeCashMovements = (movements: any = {}) => ({
			count: toNumber(movements?.count),
			company_currency_total: toNumber(movements?.company_currency_total),
			by_currency: normalizeCurrencyRows(movements?.by_currency, {
				includeExchangeRates: true,
			}),
			by_type: Array.isArray(movements?.by_type)
				? movements.by_type.map((row: any) => ({
						movement_type: row?.movement_type || "",
						total: toNumber(row?.total),
					}))
				: [],
		});

		const normalize = (payload: any = {}) => ({
			total_invoices: toNumber(payload.total_invoices),
			company_currency:
				payload.company_currency || posProfileCurrency || "",
			company_currency_total: toNumber(payload.company_currency_total),
			multi_currency_totals: normalizeCurrencyRows(
				payload.multi_currency_totals,
				{
					includeCount: true,
					includeExchangeRates: true,
				},
			),
			payments_by_mode: normalizePayments(payload.payments_by_mode),
			credit_invoices: normalizeCredit(payload.credit_invoices),
			sales_summary: {
				gross_company_currency_total: toNumber(
					payload.sales_summary?.gross_company_currency_total,
				),
				net_company_currency_total: toNumber(
					payload.sales_summary?.net_company_currency_total ??
						payload.company_currency_total,
				),
				average_invoice_value: toNumber(
					payload.sales_summary?.average_invoice_value,
				),
				sale_invoices_count: toNumber(
					payload.sales_summary?.sale_invoices_count,
				),
			},
			returns: {
				count: toNumber(payload.returns?.count),
				company_currency_total: toNumber(
					payload.returns?.company_currency_total,
				),
				by_currency: normalizeCurrencyRows(
					payload.returns?.by_currency,
					{
						includeCount: true,
						includeExchangeRates: true,
					},
				),
			},
			change_returned: normalizeChangeReturned(payload.change_returned),
			cash_expected: {
				mode_of_payment: payload.cash_expected?.mode_of_payment || "",
				company_currency_total: toNumber(
					payload.cash_expected?.company_currency_total,
				),
				by_currency: normalizeCurrencyRows(
					payload.cash_expected?.by_currency,
					{
						includeExchangeRates: true,
					},
				),
			},
			cash_movements: normalizeCashMovements(payload.cash_movements),
		});

		const request = frappe.call(
			"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.get_closing_shift_overview",
			{
				pos_opening_shift: openingShift,
			},
		);

		const finalize = () => {
			overviewLoading.value = false;
		};

		const onSuccess = (r: any) => {
			overview.value = normalize(r && r.message ? r.message : {});
		};

		const onError = (err: unknown) => {
			console.error("Failed to load shift overview", err);
			overview.value = normalize();
		};

		if (request && typeof request.then === "function") {
			request.then(onSuccess, onError);

			if (typeof request.always === "function") {
				request.always(finalize);
			} else if (typeof request.finally === "function") {
				request.finally(finalize);
			} else {
				request.then(finalize, finalize);
			}
		} else {
			finalize();
		}
	};

	const submitDialog = () => {
		const payments =
			dialog_data.value.payment_reconciliation ||
			dialog_data.value.payments ||
			[];
		const invalid = payments.some((p: any) =>
			isNaN(parseFloat(p.closing_amount)),
		);
		if (invalid) {
			return false;
		}
		if (eventBus) {
			eventBus.emit("submit_closing_pos", dialog_data.value);
		}
		closingDialog.value = false;
		return true;
	};

	return {
		closingDialog,
		dialog_data,
		overview,
		overviewLoading,
		pos_profile,
		closeDialog,
		fetchOverview,
		submitDialog,
	};
}
