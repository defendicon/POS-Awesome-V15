import type { CustomerSummary } from "../../types/models";

const SEARCH_FIELDS = [
	"customer_name",
	"name",
	"mobile_no",
	"email_id",
	"tax_id",
] as const;

export function normalizeCustomerSearchTerm(
	term: string | null | undefined,
): string {
	if (typeof term !== "string") {
		return "";
	}
	return term.trim();
}

function getSearchValues(customer: CustomerSummary | null | undefined) {
	if (!customer) {
		return [];
	}

	return SEARCH_FIELDS.map((field) => customer[field as keyof CustomerSummary])
		.filter((value) => value !== null && value !== undefined)
		.map((value) => String(value).toLowerCase());
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

	const values = getSearchValues(customer);

	return searchParts.every((part) =>
		values.some((value) => value.includes(part)),
	);
}

export function scoreCustomerSearchMatch(
	customer: CustomerSummary | null | undefined,
	term: string | null | undefined,
): number {
	const normalized = normalizeCustomerSearchTerm(term).toLowerCase();
	if (!normalized || !customer) {
		return normalized ? 0 : 1;
	}

	const values = getSearchValues(customer);
	if (!values.length) {
		return 0;
	}

	const customerName = String(customer.customer_name || "").toLowerCase();
	const id = String(customer.name || "").toLowerCase();
	const mobile = String(customer.mobile_no || "").toLowerCase();
	const email = String(customer.email_id || "").toLowerCase();
	const parts = normalized.split(/\s+/).filter(Boolean);

	if (!parts.every((part) => values.some((value) => value.includes(part)))) {
		return 0;
	}

	if (customerName === normalized) return 300;
	if (id === normalized) return 290;
	if (mobile === normalized) return 280;
	if (email === normalized) return 260;
	if (customerName.startsWith(normalized)) return 240;
	if (mobile.startsWith(normalized)) return 220;
	if (email.startsWith(normalized)) return 200;
	if (id.startsWith(normalized)) return 180;
	if (customerName.includes(normalized)) return 140;
	if (mobile.includes(normalized)) return 120;
	if (email.includes(normalized)) return 100;
	if (id.includes(normalized)) return 90;

	return 50;
}
