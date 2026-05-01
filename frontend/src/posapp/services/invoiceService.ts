import api from "./api";
import type { ApiEnvelope } from "./api";
import type { InvoiceDoc, POSProfile } from "../types/models";

function getSubmitInvoiceCall(
	data: any,
	invoiceDoc: InvoiceDoc | string,
	invoiceType: string,
	posProfile: POSProfile,
) {
	const method =
		invoiceType === "Order" && posProfile.posa_create_only_sales_order
			? "posawesome.posawesome.api.sales_orders.submit_sales_order"
			: invoiceType === "Quotation"
				? "posawesome.posawesome.api.quotations.submit_quotation"
				: "posawesome.posawesome.api.invoices.submit_invoice";

	const args = {
		data,
		invoice: invoiceDoc,
		order: invoiceDoc,
		submit_in_background:
			posProfile.posa_allow_submissions_in_background_job,
	};

	return { method, args };
}

const invoiceService = {
	submitInvoiceEnvelope(
		data: any,
		invoiceDoc: InvoiceDoc | string,
		invoiceType: string,
		posProfile: POSProfile,
	): Promise<ApiEnvelope<any>> {
		const { method, args } = getSubmitInvoiceCall(
			data,
			invoiceDoc,
			invoiceType,
			posProfile,
		);
		return api.callEnvelope(method, args);
	},

	submitInvoice(
		data: any,
		invoiceDoc: InvoiceDoc | string,
		invoiceType: string,
		posProfile: POSProfile,
	): Promise<ApiEnvelope<any>> {
		const { method, args } = getSubmitInvoiceCall(
			data,
			invoiceDoc,
			invoiceType,
			posProfile,
		);
		return api.callEnvelope(method, args);
	},
};

export default invoiceService;
