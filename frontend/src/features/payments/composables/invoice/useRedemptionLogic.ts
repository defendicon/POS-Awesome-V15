import { ref, watch, computed, unref, type Ref } from "vue";
import {
	isOffline,
	getCachedStoredValueSnapshot,
	saveStoredValueSnapshot,
} from "../../../../offline/index";

declare const frappe: any;

export interface RedemptionLogicOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	customerInfo?: Ref<any>;
	currencyPrecision: Ref<number>;
	formatFloat: (_val: any, _prec?: number) => number;
	stores?: {
		toastStore?: any;
	};
	onClearAmounts?: () => void;
}

export function useRedemptionLogic(options: RedemptionLogicOptions) {
	const { invoiceDoc, posProfile, customerInfo, currencyPrecision, formatFloat, stores } =
		options;

	// State
	const loyalty_amount = ref(0);
	const redeemed_customer_credit = ref(0);
	const customer_credit_dict = ref<any[]>([]);
	const available_customer_credit = computed(() => {
		return customer_credit_dict.value.reduce(
			(total, row) => total + normalizeFloat(row?.total_credit || 0),
			0,
		);
	});

	const available_points_amount = computed(() => {
		const info = unref(customerInfo) || {};
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);

		if (!doc || !info?.loyalty_points) {
			return 0;
		}

		let amount =
			normalizeFloat(info.loyalty_points) *
			normalizeFloat(info.conversion_factor || 1);

		if (doc.currency && profile?.currency && doc.currency !== profile.currency) {
			amount = normalizeFloat(amount / normalizeFloat(doc.conversion_rate || 1));
		}

		return amount;
	});

	const getMaxRedeemableCustomerCredit = () => {
		const doc = unref(invoiceDoc);
		if (!doc) {
			return 0;
		}

		const invoiceTotal = normalizeFloat(doc.rounded_total || doc.grand_total || 0);
		const loyaltyCovered = normalizeFloat(unref(loyalty_amount) || 0);
		return Math.max(normalizeFloat(invoiceTotal - loyaltyCovered), 0);
	};

	// Get available customer credit
	const get_available_credit = (use_credit: boolean) => {
		if (options.onClearAmounts) {
			options.onClearAmounts();
		}

		if (use_credit) {
			const customer = unref(invoiceDoc)?.customer;
			const company = unref(posProfile)?.company;

			if (!customer || !company) return;

			if (isOffline()) {
				const cachedSnapshot = getCachedStoredValueSnapshot(customer, company);
				const data = Array.isArray(cachedSnapshot?.sources)
					? JSON.parse(JSON.stringify(cachedSnapshot.sources))
					: [];
				if (data.length) {
					const doc = unref(invoiceDoc);
					const amount = doc.rounded_total || doc.grand_total;
					let remainAmount = amount;
					data.forEach((row: any) => {
						if (remainAmount > 0) {
							if (remainAmount >= row.total_credit) {
								row.credit_to_redeem = row.total_credit;
								remainAmount -= row.total_credit;
							} else {
								row.credit_to_redeem = remainAmount;
								remainAmount = 0;
							}
						} else {
							row.credit_to_redeem = 0;
						}
					});
					customer_credit_dict.value = data;
				} else {
					customer_credit_dict.value = [];
				}
				return;
			}

			frappe
				.call(
					"posawesome.posawesome.api.payments.get_available_credit",
					{
						customer,
						company,
					},
				)
				.then((r: any) => {
					const data = r.message;
					if (data && data.length) {
						saveStoredValueSnapshot(customer, company, data);
						const doc = unref(invoiceDoc);
						const amount = doc.rounded_total || doc.grand_total;
						let remainAmount = amount;
						data.forEach((row: any) => {
							if (remainAmount > 0) {
								if (remainAmount >= row.total_credit) {
									row.credit_to_redeem = row.total_credit;
									remainAmount -= row.total_credit;
								} else {
									row.credit_to_redeem = remainAmount;
									remainAmount = 0;
								}
							} else {
								row.credit_to_redeem = 0;
							}
						});
						customer_credit_dict.value = data;
					} else {
						customer_credit_dict.value = [];
					}
				});
		} else {
			customer_credit_dict.value = [];
		}
	};

	// Watchers
	const normalizeFloat = (value: any, precision?: number) => {
		const parser =
			formatFloat || ((v: any) => parseFloat(String(v)) || 0);
		const prec = precision ?? unref(currencyPrecision) ?? 2;
		return parser(value, prec);
	};

	const normalizeCustomerCreditAllocations = () => {
		const rows = Array.isArray(customer_credit_dict.value) ? customer_credit_dict.value : [];
		let remainingAllowed = getMaxRedeemableCustomerCredit();

		rows.forEach((row: any) => {
			const available = Math.max(normalizeFloat(row?.total_credit || 0), 0);
			const requested = Math.max(normalizeFloat(row?.credit_to_redeem || 0), 0);
			const allowed = Math.min(requested, available, Math.max(remainingAllowed, 0));
			row.credit_to_redeem = normalizeFloat(allowed);
			remainingAllowed = normalizeFloat(Math.max(remainingAllowed - row.credit_to_redeem, 0));
		});

		const total = rows.reduce(
			(sum, row) => sum + normalizeFloat(row?.credit_to_redeem || 0),
			0,
		);
		redeemed_customer_credit.value = normalizeFloat(total);
	};

	watch(redeemed_customer_credit, (newVal) => {
		const limit = Math.min(
			unref(available_customer_credit),
			getMaxRedeemableCustomerCredit(),
		);
		if (normalizeFloat(newVal) > normalizeFloat(limit)) {
			redeemed_customer_credit.value = limit;
			if (stores?.toastStore) {
				stores.toastStore.show({
					title: `You can redeem customer credit up to ${limit}`,
					color: "error",
				});
			}
		}
	});

	watch(
		customer_credit_dict,
		() => {
			normalizeCustomerCreditAllocations();
		},
		{ deep: true },
	);

	watch(loyalty_amount, () => {
		normalizeCustomerCreditAllocations();
	});

	// Kept for backward compatibility with previous interface.
	const get_loyalty_points = () => {
		return unref(available_points_amount);
	};

	return {
		loyalty_amount,
		redeemed_customer_credit,
		customer_credit_dict,
		available_customer_credit,
		available_points_amount,
		get_available_credit,
		get_loyalty_points,
	};
}
