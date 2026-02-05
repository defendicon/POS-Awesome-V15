import { useUIStore } from "../stores/uiStore";

declare const frappe: any;

export function useInvoicePrinting() {
    const uiStore = useUIStore();

    function isDebugPrintEnabled() {
        try {
            if (typeof window === "undefined" || !window.location) {
                return false;
            }
            const params = new URLSearchParams(window.location.search || "");
            return params.get("debug_print") === "1";
        } catch {
            return false;
        }
    }

    function printLastInvoice() {
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

        const pf = posProfile.print_format_for_online || posProfile.print_format;
        const letter_head = posProfile.letter_head || 0;
        const doctype = posProfile.create_pos_invoice_instead_of_sales_invoice
            ? "POS Invoice"
            : "Sales Invoice";
        const debugPrint = isDebugPrintEnabled();

        let url =
            frappe.urllib.get_base_url() +
            "/printview?doctype=" +
            encodeURIComponent(doctype) +
            "&name=" +
            encodeURIComponent(lastInvoiceId) +
            "&trigger_print=1" +
            "&format=" +
            encodeURIComponent(pf || "Standard") +
            "&no_letterhead=" +
            (letter_head ? "0" : "1") +
            "&letterhead=" +
            encodeURIComponent(letter_head || "No Letterhead");

        if (debugPrint) {
            console.log("[POSA][Print] Opening URL:", url);
        }

        const printWindow = window.open(url, "Print Invoice", "height=600,width=800");
        if (!printWindow) {
            console.warn("Popup blocked or failed to open print window");
        }
    }

    return {
        printLastInvoice
    };
}
