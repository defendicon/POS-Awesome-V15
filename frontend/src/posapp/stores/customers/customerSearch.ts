import type { CustomerSummary } from "../../types/models";

export function normalizeCustomerSearchTerm(
	term: string | null | undefined,
): string {
	if (typeof term !== "string") {
		return "";
	}
	return term.trim();
}

export function customerMatchesSearchTerm(
	customer: CustomerSummary | null | undefined,
	term: string | null | undefined,
): boolean {
	const searchParts = normalizeCustomerSearchTerm(term)
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);

	if (!searchParts.length) {
		return true;
	}

	if (!customer) {
		return false;
	}

	const values = [
		customer.customer_name,
		customer.name,
		customer.mobile_no,
		customer.email_id,
		(customer as CustomerSummary & { tax_id?: unknown }).tax_id,
	]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => String(value).toLowerCase());

	return searchParts.every((part) =>
		values.some((value) => value.includes(part)),
	);
}
