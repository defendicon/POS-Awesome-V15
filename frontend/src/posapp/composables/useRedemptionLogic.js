import { ref, watch, computed, unref } from "vue";

export function useRedemptionLogic(options) {
	const {
		invoiceDoc,
		posProfile,
		currencyPrecision,
		formatFloat,
		stores, // { toastStore }
	} = options;

	// State
	const loyalty_amount = ref(0);
	const redeemed_customer_credit = ref(0);
	const customer_credit_dict = ref([]);
	const available_customer_credit = ref(0);
	const available_points_amount = ref(0);

	// Get available customer credit
	const get_available_credit = (use_credit) => {
		// Clear amounts logic should be handled by caller or via callback?
		// In original code, it calls `this.clear_all_amounts()`.
		// We can emit an event or call a callback.
		if (options.onClearAmounts) {
			options.onClearAmounts();
		}

		if (use_credit) {
			const customer = unref(invoiceDoc)?.customer;
			const company = unref(posProfile)?.company;

			if (!customer || !company) return;

			frappe
				.call("posawesome.posawesome.api.payments.get_available_credit", {
					customer,
					company,
				})
				.then((r) => {
					const data = r.message;
					if (data && data.length) {
						const doc = unref(invoiceDoc);
						const amount = doc.rounded_total || doc.grand_total;
						let remainAmount = amount;
						data.forEach((row) => {
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
	watch(redeemed_customer_credit, (newVal) => {
		const func = unref(formatFloat) || ((v) => parseFloat(v));
		const limit = unref(available_customer_credit);
		if (func(newVal) > func(limit)) {
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
		(newVal) => {
			const func = unref(formatFloat) || ((v) => parseFloat(v));
			const prec = unref(currencyPrecision) || 2;
			const total = newVal.reduce((sum, row) => sum + func(row.credit_to_redeem || 0), 0);
			redeemed_customer_credit.value = func(total, prec);
		},
		{ deep: true }
	);

	// Fetch Loyalty Points (Stub for now, need to find implementation if exists in Payments.vue)
	// It wasn't visible in previous code blocks, but needed for completeness.
	// I'll leave it as a placeholder or check if I can find it.
	
	// Assuming logic similar to credit:
	const get_loyalty_points = () => {
		// TODO: Implement loyalty fetching
	};

	return {
		loyalty_amount,
		redeemed_customer_credit,
		customer_credit_dict,
		available_customer_credit,
		available_points_amount,
		get_available_credit,
	};
}
