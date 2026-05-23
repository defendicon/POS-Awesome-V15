import { resolvePosDocumentDoctype } from "./posDocumentMode";

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

	return resolvePosDocumentDoctype({
		invoiceType,
		posProfile: profile,
	});
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
