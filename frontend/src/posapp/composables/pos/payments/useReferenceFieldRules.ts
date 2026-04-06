import { computed, unref, type Ref } from "vue";
import { normalizeDateForBackend } from "../../../format";

declare const __: (_text: string, _args?: any[]) => string;
declare const flt: (_value: unknown, _precision?: number) => number;

type PaymentMethodLike = {
	mode_of_payment?: string;
	amount?: unknown;
};

type MaybeRef<T> = T | Ref<T>;

const OPTIONAL_REFERENCE_KEYWORDS = [
	"cash",
	"gift",
	"credit note",
	"write off",
	"write-off",
	"loyalty",
	"change",
];

const REQUIRED_REFERENCE_KEYWORDS = [
	"bank",
	"cheque",
	"check",
	"transfer",
	"online",
	"card",
	"debit",
	"credit card",
	"wallet",
	"mobile",
	"easypaisa",
	"jazzcash",
	"mpesa",
];

function normalizeModeLabel(mode: unknown): string {
	return String(mode || "").trim().toLowerCase();
}

export function modeRequiresReference(mode: unknown): boolean {
	const normalizedMode = normalizeModeLabel(mode);
	if (!normalizedMode) return false;

	if (OPTIONAL_REFERENCE_KEYWORDS.some((keyword) => normalizedMode.includes(keyword))) {
		return false;
	}

	if (REQUIRED_REFERENCE_KEYWORDS.some((keyword) => normalizedMode.includes(keyword))) {
		return true;
	}

	return false;
}

function getActivePaymentMethods(paymentMethods: PaymentMethodLike[] = []): PaymentMethodLike[] {
	return paymentMethods.filter((payment) => flt(payment?.amount || 0) > 0);
}

export function getReferenceFieldRequirement(paymentMethods: PaymentMethodLike[] = []) {
	const activePaymentMethods = getActivePaymentMethods(paymentMethods);
	const requiredModes = activePaymentMethods
		.filter((payment) => modeRequiresReference(payment?.mode_of_payment))
		.map((payment) => String(payment?.mode_of_payment || "").trim())
		.filter(Boolean);

	const isRequired = requiredModes.length > 0;
	const helperText = isRequired
		? __(
				"Reference number and date are required for: {0}",
				[requiredModes.join(", ")],
		  )
		: __(
				"Reference number and date are optional for cash-style payments and existing allocations.",
		  );

	return {
		isRequired,
		requiredModes,
		helperText,
	};
}

type NormalizeReferenceFieldArgs = {
	paymentMethods?: PaymentMethodLike[];
	referenceNo?: string | null;
	referenceDate?: string | null;
	postingDate?: string | null;
	fallbackReferenceNo?: string | null;
};

export function normalizeAndValidateReferenceFields({
	paymentMethods = [],
	referenceNo,
	referenceDate,
	postingDate,
	fallbackReferenceNo,
}: NormalizeReferenceFieldArgs) {
	const requirement = getReferenceFieldRequirement(paymentMethods);
	const normalizedReferenceNo = String(referenceNo || "").trim();
	const normalizedReferenceDate = normalizeDateForBackend(referenceDate);
	const normalizedPostingDate = normalizeDateForBackend(postingDate);
	const normalizedFallbackReferenceNo = String(fallbackReferenceNo || "").trim() || null;
	const errors: string[] = [];

	if (referenceDate && !normalizedReferenceDate) {
		errors.push(__("Please enter a valid reference date."));
	}

	if (requirement.isRequired) {
		if (!normalizedReferenceNo) {
			errors.push(__("Please enter a reference number for the selected payment method."));
		}

		if (!normalizedReferenceDate) {
			errors.push(__("Please enter a reference date for the selected payment method."));
		}
	}

	return {
		...requirement,
		errors,
		resolvedReferenceNo:
			normalizedReferenceNo || (!requirement.isRequired ? normalizedFallbackReferenceNo : null),
		resolvedReferenceDate: requirement.isRequired
			? normalizedReferenceDate
			: normalizedReferenceDate || normalizedPostingDate,
	};
}

export function useReferenceFieldRules(paymentMethods: MaybeRef<PaymentMethodLike[]>) {
	return computed(() => getReferenceFieldRequirement(unref(paymentMethods) || []));
}
