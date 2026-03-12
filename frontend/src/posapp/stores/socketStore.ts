import { defineStore } from "pinia";
import { useToastStore } from "./toastStore";
import { useUIStore } from "./uiStore";
import { dispatchRealtimeStockPayload } from "../utils/realtimeStock";

export const useSocketStore = defineStore("socket", () => {
  const toastStore = useToastStore();
  const uiStore = useUIStore();
  let initialized = false;
  const listeners = new Map<string, (data: any) => void>();

  function init() {
    if (initialized || typeof frappe === "undefined" || !frappe.realtime) return;

    // Global listener for background submission errors
    const submitErrorListener = (data: { message?: string; invoice?: string }) => {
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
    };

    // Global listener for successful background submission
    const processedListener = (data: { invoice?: string; name?: string }) => {
      const invoice = data.invoice || data.name;

      toastStore.show({
        title: __("Invoice Submitted"),
        detail: __("Invoice {0} processed successfully", [invoice]),
        color: "success",
      });
    };

    const stockChangedListener = (data: unknown) => {
      dispatchRealtimeStockPayload(data, {
        setLastStockAdjustment: uiStore.setLastStockAdjustment,
      });
    };

    listeners.set("pos_invoice_submit_error", submitErrorListener);
    listeners.set("pos_invoice_processed", processedListener);
    listeners.set("posa_stock_changed", stockChangedListener);

    frappe.realtime.on("pos_invoice_submit_error", submitErrorListener);
    frappe.realtime.on("pos_invoice_processed", processedListener);
    frappe.realtime.on("posa_stock_changed", stockChangedListener);
    initialized = true;
  }

  function dispose() {
    if (!initialized || typeof frappe === "undefined" || !frappe.realtime) {
      listeners.clear();
      initialized = false;
      return;
    }

    for (const [eventName, handler] of listeners.entries()) {
      if (typeof frappe.realtime.off === "function") {
        frappe.realtime.off(eventName, handler);
      }
    }

    listeners.clear();
    initialized = false;
  }

  return {
    init,
    dispose,
  };
});
