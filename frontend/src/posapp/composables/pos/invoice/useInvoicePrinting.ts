import { useToastStore } from "../../../stores/toastStore";

declare const __: (_text: string, _args?: any[]) => string;

export function useInvoicePrinting(
	pos_profile: any,
	load_print_page: (_name: string) => void,
	save_and_clear_invoice: () => Promise<any>,
	invoice_doc: any,
) {
	const toastStore = useToastStore();

	const print_draft_invoice = async () => {
		if (!pos_profile.value.posa_allow_print_draft_invoices) {
			toastStore.show({
				title: __("You are not allowed to print draft invoices"),
				color: "error",
			});
			return;
		}

		let invoice_name = invoice_doc.value?.name || null;
		try {
			const saved_doc = await save_and_clear_invoice();
			if (saved_doc?.name) {
				invoice_name = saved_doc.name;
			}

			if (!invoice_name) {
				throw new Error("Invoice could not be saved before printing");
			}

			load_print_page(invoice_name);
		} catch (error) {
			console.error("Failed to print draft invoice:", error);
			toastStore.show({
				title: __("Unable to print draft invoice"),
				color: "error",
			});
		}
	};

	return {
		print_draft_invoice,
	};
}
