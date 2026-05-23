import api from "./api";
import { unwrapApiResult, type ApiEnvelope } from "./api";
import type { InvoiceDoc, POSProfile } from "../types/models";
import { resolvePosDocumentDoctype } from "../utils/posDocumentMode";

function getSubmitInvoiceCall(
	data: any,
	invoiceDoc: InvoiceDoc | string,
	invoiceType: string,
	posProfile: POSProfile,
) {
	const doctype = resolvePosDocumentDoctype({
		invoiceType,
		posProfile,
	});
	const method =
		doctype === "Sales Order"
			? "posawesome.posawesome.api.sales_orders.submit_sales_order"
			: doctype === "Quotation"
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

	async submitInvoiceData(
		data: any,
		invoiceDoc: InvoiceDoc | string,
		invoiceType: string,
		posProfile: POSProfile,
	): Promise<any> {
		return unwrapApiResult(
			await this.submitInvoice(data, invoiceDoc, invoiceType, posProfile),
		);
	},
};

export default invoiceService;
