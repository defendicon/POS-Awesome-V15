type PosProfileLike = {
	create_pos_invoice_instead_of_sales_invoice?: unknown;
} | null | undefined;

type PdfUrlOptions = {
	doctype: string;
	name: string;
	format: string;
	noLetterhead?: 0 | 1;
};

export function resolveInvoiceDoctype(posProfile: PosProfileLike): "POS Invoice" | "Sales Invoice" {
	return posProfile?.create_pos_invoice_instead_of_sales_invoice ? "POS Invoice" : "Sales Invoice";
}

export function buildInvoicePdfUrl({
	doctype,
	name,
	format,
	noLetterhead = 0,
}: PdfUrlOptions): string {
	return `/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&no_letterhead=${noLetterhead}`;
}

export function shouldDownloadPdfForShareError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === "AbortError"
		: (error as { name?: string } | null)?.name === "AbortError";
}
