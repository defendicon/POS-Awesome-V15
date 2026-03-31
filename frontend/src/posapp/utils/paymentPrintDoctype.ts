import { parseBooleanSetting } from "./stock";

interface ResolvePaymentPrintDoctypeOptions {
	profile?: Record<string, any> | null;
	invoiceType?: string | null;
	explicitDoctype?: string | null;
}

export function resolvePaymentPrintDoctype({
	profile,
	invoiceType,
	explicitDoctype,
}: ResolvePaymentPrintDoctypeOptions) {
	if (explicitDoctype) {
		return explicitDoctype;
	}

	if (invoiceType === "Quotation") {
		return "Quotation";
	}

	if (
		invoiceType === "Order" &&
		parseBooleanSetting(profile?.posa_create_only_sales_order)
	) {
		return "Sales Order";
	}

	if (
		parseBooleanSetting(profile?.create_pos_invoice_instead_of_sales_invoice)
	) {
		return "POS Invoice";
	}

	return "Sales Invoice";
}

export function resolvePaymentPrintFormatDoctypes(
	options: ResolvePaymentPrintDoctypeOptions,
) {
	const { invoiceType } = options;

	if (invoiceType === "Invoice" || invoiceType === "Return") {
		return ["Sales Invoice", "POS Invoice"];
	}

	return [resolvePaymentPrintDoctype(options)];
}
