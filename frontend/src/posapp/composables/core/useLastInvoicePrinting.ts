import { useUIStore } from "../../stores/uiStore";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "../../plugins/print";
import { printDocumentViaQz } from "../../services/qzTray";

declare const frappe: any;

export function useLastInvoicePrinting() {
	const uiStore = useUIStore();

	function parseBooleanSetting(value: unknown) {
		if (value === undefined || value === null) return false;
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			return ["1", "true", "yes", "on"].includes(normalized);
		}
		if (typeof value === "number") return value === 1;
		return Boolean(value);
	}

	async function printLastInvoice() {
		const lastInvoiceId = uiStore.lastInvoiceId;
		const posProfile = uiStore.posProfile;

		if (!lastInvoiceId) {
			console.warn("No last invoice ID to print");
			return;
		}

		if (!posProfile) {
			console.warn("No POS Profile loaded");
			return;
		}

		const pf =
			posProfile.print_format_for_online || posProfile.print_format;
		const letter_head = posProfile.letter_head || 0;
		const doctype = posProfile.create_pos_invoice_instead_of_sales_invoice
			? "POS Invoice"
			: "Sales Invoice";
		const debugPrint = isDebugPrintEnabled();
		const openInNewTab = parseBooleanSetting(
			posProfile.posa_open_print_in_new_tab,
		);
		const useSilentPrint = parseBooleanSetting(posProfile.posa_silent_print);
		console.log("useSilentPrint:-----------------", useSilentPrint);
		const basePrintUrl = frappe.urllib.get_base_url() + "/printview";

		let url =
			basePrintUrl +
			"?doctype=" +
			encodeURIComponent(doctype) +
			"&name=" +
			encodeURIComponent(lastInvoiceId) +
			"&trigger_print=1" +
			"&format=" +
			encodeURIComponent(pf || "Standard") +
			"&no_letterhead=" +
			(letter_head ? "0" : "1");

		if (letter_head) {
			url += "&letterhead=" + encodeURIComponent(letter_head);
		}

		url = appendDebugPrintParam(url, debugPrint);

		if (debugPrint) {
			console.log("[POSA][Print] Opening URL:", url);
		}

		const printOptions = {
			triggerPrint: "1",
			debugPrint,
			debugInfo: {
				printFormat: pf || "Standard",
				templatePath: "online-printview",
			},
		};

		if (openInNewTab) {
			let newTabUrl =
				basePrintUrl +
				"?doctype=" +
				encodeURIComponent(doctype) +
				"&name=" +
				encodeURIComponent(lastInvoiceId) +
				"&trigger_print=0" +
				"&format=" +
				encodeURIComponent(pf || "Standard") +
				"&no_letterhead=" +
				(letter_head ? "0" : "1");

			if (letter_head) {
				newTabUrl += "&letterhead=" + encodeURIComponent(letter_head);
			}

			newTabUrl = appendDebugPrintParam(newTabUrl, debugPrint);
			const printWindow = window.open(newTabUrl, "_blank");
			if (printWindow) {
				watchPrintWindow(printWindow, {
					...printOptions,
					triggerPrint: "0",
					shouldPrint: false,
					showSessionMessage: false,
				});
				return;
			}
			console.warn(
				"Popup blocked while opening print preview tab, falling back to browser print",
			);
			frappe?.show_alert?.(
				{
					message:
						"Popup blocked while opening print preview. Continuing with browser print.",
					indicator: "orange",
				},
				5,
			);
			const fallbackPrintWindow = window.open(url, "Print");
			if (fallbackPrintWindow) {
				watchPrintWindow(fallbackPrintWindow, printOptions);
				return;
			}
			silentPrint(url, printOptions);
			return;
		}

		if (useSilentPrint) {
			try {
				await printDocumentViaQz({
					doctype,
					name: lastInvoiceId,
					printFormat: pf || "Standard",
					letterhead: letter_head || null,
					noLetterhead: letter_head ? "0" : "1",
					printerName: posProfile.custom_pos_printer || null,
				});
				return;
			} catch (error) {
				console.warn("QZ Tray print failed, falling back to browser print", error);
			}
			silentPrint(url, printOptions);
			return;
		}

		const printWindow = window.open(url, "Print");
		if (printWindow) {
			watchPrintWindow(printWindow, printOptions);
			return;
		}

		console.warn("Popup blocked or failed to open print window");
	}

	return {
		printLastInvoice,
	};
}
