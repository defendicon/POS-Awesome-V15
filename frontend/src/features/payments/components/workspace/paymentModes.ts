export type PaymentEntryType = "Receive" | "Pay";
export type PaymentPartyType = "Customer" | "Supplier" | "Employee";

const PAY_PARTY_TYPES: PaymentPartyType[] = [
	"Customer",
	"Supplier",
	"Employee",
];
const RECEIVE_PARTY_TYPES: PaymentPartyType[] = ["Customer"];

export function getAllowedPartyTypes(
	paymentType: string | null | undefined,
): PaymentPartyType[] {
	return paymentType === "Pay" ? PAY_PARTY_TYPES : RECEIVE_PARTY_TYPES;
}

export function normalizePartyTypeForPaymentType(
	paymentType: string | null | undefined,
	partyType: string | null | undefined,
): PaymentPartyType {
	const allowed = getAllowedPartyTypes(paymentType);
	return allowed.includes(partyType as PaymentPartyType)
		? (partyType as PaymentPartyType)
		: (allowed[0] as PaymentPartyType);
}

export function shouldShowReconciliationSections(
	paymentType: string | null | undefined,
	partyType: string | null | undefined,
): boolean {
	return paymentType === "Pay"
		? partyType !== "Employee"
		: normalizePartyTypeForPaymentType(paymentType, partyType) === "Customer";
}
