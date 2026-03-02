import { defineStore } from "pinia";
import { useToastStore } from "./toastStore";
import { useUIStore } from "./uiStore";
import { dispatchRealtimeStockPayload } from "../utils/realtimeStock";

export const useSocketStore = defineStore("socket", () => {
  const toastStore = useToastStore();
  const uiStore = useUIStore();

  function init() {
    if (typeof frappe === "undefined" || !frappe.realtime) return;

    // Global listener for background submission errors
    frappe.realtime.on("pos_invoice_submit_error", (data: { message?: string; invoice?: string }) => {
      const message = data.message || "Unknown error";
      const invoice = data.invoice || "";

      if (typeof frappe.msgprint === "function") {
        frappe.msgprint({
          title: __("Invoice Submission Failed"),
          message: __("Background processing failed for Invoice {0}: {1}", [invoice, message]),
          indicator: "red",
        });
      }

      toastStore.show({
        title: __("Background Submission Failed"),
        detail: message,
        color: "error",
        timeout: 8000,
      });
    });

    // Global listener for successful background submission
    frappe.realtime.on("pos_invoice_processed", (data: { invoice?: string; name?: string }) => {
      const invoice = data.invoice || data.name;

      toastStore.show({
        title: __("Invoice Submitted"),
        detail: __("Invoice {0} processed successfully", [invoice]),
        color: "success",
      });
    });

    frappe.realtime.on("posa_stock_changed", (data: unknown) => {
      dispatchRealtimeStockPayload(data, {
        setLastStockAdjustment: uiStore.setLastStockAdjustment,
      });
    });
  }

  return {
    init,
  };
});
