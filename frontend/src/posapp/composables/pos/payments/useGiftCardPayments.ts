import { computed, ref } from "vue";

import { getCachedGiftCardSnapshot, isOffline, saveGiftCardSnapshot } from "../../../../offline/index";
import { resolvePreferredPaymentLine } from "../../../utils/paymentInitialization";

declare const window: Window & { __: typeof Function.prototype; frappe: any };

export function useGiftCardPayments({
	invoiceDoc,
	posProfile,
	currentCashier,
	currencyPrecision,
	flt,
	isCashLikePayment,
	netInvoiceSettlementAmount,
	rebalancePreferredPaymentCoverage,
}) {
	const __ = window.__;
	const frappe = window.frappe;

	const giftCardDialogOpen = ref(false);
	const giftCardInlineExpanded = ref(false);
	const activeGiftCardPayment = ref<any>(null);
	const giftCardCode = ref("");
	const giftCardAmount = ref(0);
	const giftCardBalance = ref(0);
	const giftCardStatus = ref("");
	const giftCardLoading = ref(false);
	const giftCardMode = ref("redeem");
	const giftCardError = ref("");
	const giftCardRedemptions = ref<any[]>([]);

	const isGiftCardPayment = (payment) => {
		if (!posProfile.value?.posa_use_gift_cards) {
			return false;
		}
		return String(payment?.mode_of_payment || "")
			.trim()
			.toLowerCase()
			.includes("gift");
	};

	const visiblePaymentMethods = computed(() =>
		(Array.isArray(invoiceDoc.value?.payments) ? invoiceDoc.value.payments : []).filter(
			(payment) => !isGiftCardPayment(payment),
		),
	);

	const giftCardAppliedAmount = computed(() =>
		(Array.isArray(giftCardRedemptions.value) ? giftCardRedemptions.value : []).reduce(
			(sum, row) => sum + flt(row?.amount || 0, currencyPrecision.value),
			0,
		),
	);

	const resetGiftCardState = ({ clearPayment = false } = {}) => {
		giftCardDialogOpen.value = false;
		giftCardInlineExpanded.value = false;
		giftCardCode.value = "";
		giftCardAmount.value = 0;
		giftCardBalance.value = 0;
		giftCardStatus.value = "";
		giftCardLoading.value = false;
		giftCardMode.value = "redeem";
		giftCardError.value = "";
		giftCardRedemptions.value = [];
		if (clearPayment && activeGiftCardPayment.value) {
			activeGiftCardPayment.value.amount = 0;
			if (activeGiftCardPayment.value.base_amount !== undefined) {
				activeGiftCardPayment.value.base_amount = 0;
			}
		}
		activeGiftCardPayment.value = null;
	};

	const setGiftCardMode = (mode) => {
		giftCardMode.value = mode || "redeem";
		giftCardError.value = "";
	};

	const getGiftCardRemainingAmount = () => {
		const flexiblePayment =
			activeGiftCardPayment.value || resolvePreferredPaymentLine(invoiceDoc.value, isCashLikePayment);
		const payments = Array.isArray(invoiceDoc.value?.payments) ? invoiceDoc.value.payments : [];
		const otherPaymentsTotal = payments.reduce((sum, payment) => {
			if (!payment || payment === flexiblePayment) {
				return sum;
			}
			return sum + flt(payment.amount || 0, currencyPrecision.value);
		}, 0);
		return Math.max(flt(netInvoiceSettlementAmount.value - otherPaymentsTotal, currencyPrecision.value), 0);
	};

	const clearGiftCardRedemption = () => {
		if (activeGiftCardPayment.value) {
			activeGiftCardPayment.value.amount = 0;
			if (activeGiftCardPayment.value.base_amount !== undefined) {
				activeGiftCardPayment.value.base_amount = 0;
			}
		}
		giftCardRedemptions.value = [];
		giftCardCode.value = "";
		giftCardAmount.value = 0;
		giftCardBalance.value = 0;
		giftCardStatus.value = "";
		giftCardError.value = "";
		giftCardInlineExpanded.value = false;
		rebalancePreferredPaymentCoverage(0);
	};

	const toggleGiftCardInline = () => {
		giftCardInlineExpanded.value = !giftCardInlineExpanded.value;
		activeGiftCardPayment.value = null;
		if (giftCardInlineExpanded.value) {
			giftCardCode.value = giftCardRedemptions.value[0]?.gift_card_code || giftCardCode.value || "";
			giftCardAmount.value = flt(
				giftCardRedemptions.value[0]?.amount || giftCardAmount.value || 0,
				currencyPrecision.value,
			);
		} else {
			giftCardError.value = "";
		}
	};

	const openGiftCardDialog = (payment: any = null) => {
		activeGiftCardPayment.value = payment;
		giftCardDialogOpen.value = true;
		giftCardCode.value = giftCardRedemptions.value[0]?.gift_card_code || "";
		giftCardAmount.value = flt(
			giftCardRedemptions.value[0]?.amount || payment?.amount || 0,
			currencyPrecision.value,
		);
		giftCardBalance.value = flt(giftCardBalance.value || 0, currencyPrecision.value);
		giftCardStatus.value = giftCardStatus.value || "";
		giftCardMode.value = "redeem";
		giftCardError.value = "";
	};

	const checkGiftCardBalance = async () => {
		if (!giftCardCode.value || !posProfile.value?.company) {
			giftCardError.value = __("Gift card code is required.");
			return;
		}

		if (isOffline()) {
			const cached = getCachedGiftCardSnapshot(giftCardCode.value);
			if (!cached) {
				giftCardError.value = __("No cached gift card balance is available offline.");
				return;
			}
			giftCardBalance.value = flt(cached.current_balance || 0, currencyPrecision.value);
			giftCardStatus.value = cached.status || "";
			return;
		}

		giftCardLoading.value = true;
		giftCardError.value = "";
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.gift_cards.check_gift_card_balance",
				args: {
					gift_card_code: giftCardCode.value,
					company: posProfile.value.company,
				},
			});
			const card = response?.message || {};
			giftCardBalance.value = flt(card.current_balance || 0, currencyPrecision.value);
			giftCardStatus.value = card.status || "";
			saveGiftCardSnapshot(giftCardCode.value, card);
			if (!giftCardAmount.value && giftCardMode.value === "redeem") {
				giftCardAmount.value = Math.min(giftCardBalance.value, getGiftCardRemainingAmount());
			}
		} catch (error: any) {
			giftCardError.value = error?.message || __("Unable to load gift card balance.");
		}
		giftCardLoading.value = false;
	};

	const applyGiftCardRedemption = async () => {
		if (!giftCardBalance.value || !giftCardStatus.value) {
			await checkGiftCardBalance();
			if (!giftCardBalance.value || giftCardError.value) {
				return;
			}
		}

		const nextAmount = Math.min(
			flt(giftCardAmount.value || 0, currencyPrecision.value),
			giftCardBalance.value,
			getGiftCardRemainingAmount(),
		);

		if (nextAmount <= 0) {
			giftCardError.value = __("Gift card amount must be greater than zero.");
			return;
		}

		if (activeGiftCardPayment.value) {
			activeGiftCardPayment.value.amount = 0;
			if (activeGiftCardPayment.value.base_amount !== undefined) {
				activeGiftCardPayment.value.base_amount = 0;
			}
		}
		giftCardRedemptions.value = [
			{
				gift_card_code: giftCardCode.value,
				amount: nextAmount,
				cashier: currentCashier.value?.user || null,
			},
		];
		rebalancePreferredPaymentCoverage(nextAmount);
		giftCardInlineExpanded.value = false;
		giftCardDialogOpen.value = false;
	};

	const issueGiftCard = async () => {
		if (!currentCashier.value?.is_supervisor) {
			giftCardError.value = __("A POS supervisor is required for this action.");
			return;
		}
		giftCardLoading.value = true;
		giftCardError.value = "";
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.gift_cards.issue_gift_card",
				args: {
					pos_profile: posProfile.value?.name,
					cashier: currentCashier.value?.user,
					company: posProfile.value?.company,
					initial_amount: flt(giftCardAmount.value || 0, currencyPrecision.value),
					gift_card_code: giftCardCode.value || null,
					currency: invoiceDoc.value?.currency || posProfile.value?.currency,
				},
			});
			const card = response?.message || {};
			giftCardCode.value = card.gift_card_code || giftCardCode.value;
			giftCardBalance.value = flt(card.current_balance || 0, currencyPrecision.value);
			giftCardStatus.value = card.status || "Active";
			giftCardMode.value = "redeem";
		} catch (error: any) {
			giftCardError.value = error?.message || __("Unable to issue gift card.");
		}
		giftCardLoading.value = false;
	};

	const topUpGiftCard = async () => {
		if (!currentCashier.value?.is_supervisor) {
			giftCardError.value = __("A POS supervisor is required for this action.");
			return;
		}
		giftCardLoading.value = true;
		giftCardError.value = "";
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.gift_cards.top_up_gift_card",
				args: {
					pos_profile: posProfile.value?.name,
					cashier: currentCashier.value?.user,
					gift_card_code: giftCardCode.value,
					amount: flt(giftCardAmount.value || 0, currencyPrecision.value),
				},
			});
			const card = response?.message || {};
			giftCardBalance.value = flt(card.current_balance || 0, currencyPrecision.value);
			giftCardStatus.value = card.status || "Active";
			giftCardMode.value = "redeem";
		} catch (error: any) {
			giftCardError.value = error?.message || __("Unable to top up gift card.");
		}
		giftCardLoading.value = false;
	};

	return {
		giftCardDialogOpen,
		giftCardInlineExpanded,
		giftCardCode,
		giftCardAmount,
		giftCardBalance,
		giftCardStatus,
		giftCardLoading,
		giftCardMode,
		giftCardError,
		giftCardRedemptions,
		giftCardAppliedAmount,
		visiblePaymentMethods,
		isGiftCardPayment,
		resetGiftCardState,
		setGiftCardMode,
		openGiftCardDialog,
		toggleGiftCardInline,
		checkGiftCardBalance,
		applyGiftCardRedemption,
		clearGiftCardRedemption,
		issueGiftCard,
		topUpGiftCard,
	};
}
