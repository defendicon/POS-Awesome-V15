import { defineStore } from "pinia";
import { useToastStore } from "./toastStore";
import { useUIStore } from "./uiStore";

export const useSocketStore = defineStore("socket", () => {
	const toastStore = useToastStore();
	const uiStore = useUIStore();

	function init() {
		if (typeof frappe === "undefined" || !frappe.realtime) return;

		console.log("Initializing Socket Listeners");

		// Global listener for background submission errors
		frappe.realtime.on("pos_invoice_submit_error", (data) => {
			const message = data.message || "Unknown error";
			const invoice = data.invoice || "";
			console.error(`Background Invoice Error [${invoice}]:`, message);

			frappe.msgprint({
				title: __("Invoice Submission Failed"),
				message: __("Background processing failed for Invoice {0}: {1}", [invoice, message]),
				indicator: "red",
			});

			toastStore.show({
				title: __("Background Submission Failed"),
				text: message,
				color: "error",
				timeout: 8000,
			});
		});

		// Global listener for successful background submission
		frappe.realtime.on("pos_invoice_processed", (data) => {
			const invoice = data.invoice || data.name;
			console.log(`Background Invoice Processed: ${invoice}`);

			toastStore.show({
				title: __("Invoice Submitted"),
				text: __("Invoice {0} processed successfully", [invoice]),
				color: "success",
			});

			// If we need to update UI (like clear pending status), we can emit an event or update a store
			// For now, sticking to notifications
		});
		
		// Additional listeners can be added here
	}

	return {
		init,
	};
});
