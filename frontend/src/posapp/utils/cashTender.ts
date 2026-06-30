// @ts-ignore
import { getSmartTenderSuggestions } from "../../utils/smartTender";
import {
	resolvePreferredPaymentLine,
	type PaymentLine,
} from "./paymentInitialization";

type PosProfileLike = {
	currency?: string;
	posa_cash_mode_of_payment?: string | null;
	payments?: PaymentLine[];
};

type QuickCashTenderOptions = {
	amount: number;
	currency?: string;
	posProfile?: PosProfileLike | null;
	payments?: PaymentLine[] | null;
};

export const isCashLikePaymentLine = (
	payment: PaymentLine | null | undefined,
	posProfile?: PosProfileLike | null,
): boolean => {
	if (!payment) return false;

	const configuredCashMOP = String(
		posProfile?.posa_cash_mode_of_payment || "",
	).toLowerCase();
	const type = String(payment.type || "").toLowerCase();

	if (type === "cash") return true;

	const mode = String(payment.mode_of_payment || "").toLowerCase();
	if (configuredCashMOP && mode === configuredCashMOP) return true;

	return mode.includes("cash");
};

export const normalizeProfilePaymentLines = (
	payments: PaymentLine[] | null | undefined,
): PaymentLine[] => {
	if (!Array.isArray(payments)) return [];

	const paymentRows = payments.filter(
		(payment) => !!payment?.mode_of_payment,
	);
	const hasExplicitDefault = paymentRows.some(
		(payment) => payment.default === 1 || payment.default === true,
	);

	return paymentRows.map((payment, index) => ({
		mode_of_payment: payment.mode_of_payment,
		amount: payment.amount || 0,
		account: payment.account,
		type: payment.type,
		default:
			payment.default === 1 ||
			payment.default === true ||
			(!hasExplicitDefault && index === 0)
				? 1
				: 0,
		base_amount: payment.base_amount || 0,
	}));
};

export const getQuickCashTenderSuggestions = ({
	amount,
	currency,
	posProfile,
	payments,
}: QuickCashTenderOptions): number[] => {
	const paymentLines = normalizeProfilePaymentLines(
		payments || posProfile?.payments,
	);
	if (!paymentLines.length) return [];

	const preferredPayment = resolvePreferredPaymentLine(
		{ payments: paymentLines },
		(payment) => isCashLikePaymentLine(payment, posProfile),
	);
	if (!isCashLikePaymentLine(preferredPayment, posProfile)) {
		return [];
	}

	const normalizedAmount = Math.abs(Number(amount) || 0);
	if (normalizedAmount <= 0) return [];

	return getSmartTenderSuggestions(
		normalizedAmount,
		currency || posProfile?.currency || "",
	);
};
