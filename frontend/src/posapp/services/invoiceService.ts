import api from "./api";
import type { InvoiceDoc, POSProfile } from "../types/models";

const invoiceService = {
	submitInvoice(data: any, invoiceDoc: InvoiceDoc | string, invoiceType: string, posProfile: POSProfile) {
		const method =
			invoiceType === "Order" && posProfile.posa_create_only_sales_order
				? "posawesome.posawesome.api.sales_orders.submit_sales_order"
				: invoiceType === "Quotation"
					? "posawesome.posawesome.api.quotations.submit_quotation"
					: "posawesome.posawesome.api.invoices.submit_invoice";

		const args = {
			data: data,
			invoice: invoiceDoc,
			order: invoiceDoc,
			submit_in_background: posProfile.posa_allow_submissions_in_background_job,
		};

		return api.call(method, args);
	},
};

export default invoiceService;
