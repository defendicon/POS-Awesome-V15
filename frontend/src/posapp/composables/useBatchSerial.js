import { ref } from "vue";
import { batchStatus } from "../utils/batch.js";
import { parseBooleanSetting } from "../utils/stock.js";

export function useBatchSerial() {
	// Set serial numbers for an item (and update qty)
	const setSerialNo = (item, forceUpdate) => {
		console.log(item);
		if (!item.has_serial_no) return;
		item.serial_no = "";
		item.serial_no_selected.forEach((element) => {
			item.serial_no += element + "\n";
		});
		item.serial_no_selected_count = item.serial_no_selected.length;
		if (item.serial_no_selected_count != item.stock_qty) {
			item.qty = item.serial_no_selected_count;
			// Note: calc_stock_qty would need to be passed as a parameter or imported
			if (forceUpdate) forceUpdate();
		}
	};

        // Set batch number for an item (and update batch data)
        const setBatchQty = (item, value, update = true, context) => {
                console.log("Setting batch quantity:", item, value);
                const allowExpired = parseBooleanSetting(context?.pos_profile?.posa_allow_expired_batches);
                const showExpired = parseBooleanSetting(context?.pos_profile?.posa_show_expired_batches);
                const nearExpiryMonths = Number(context?.pos_profile?.posa_near_expiry_months || 0);
                const today = new Date();

                const setBatchMessage = (message = "") => {
                        item.batch_validation_message = message;
                };

                setBatchMessage("");

                const translate = (text, args) => {
                        if (context && typeof context.__ === "function") {
                                return context.__(text, args);
                        }
                        return text;
                };

                const notify = (message, color = "warning") => {
                        if (context?.eventBus?.emit) {
                                context.eventBus.emit("show_message", { title: message, color });
                        } else if (typeof frappe !== "undefined" && frappe?.show_alert) {
                                frappe.show_alert({ message, indicator: color });
                        }
                };

                const customWarning = context?.pos_profile?.posa_expired_batch_warning_message;

                const existing_items = context.items.filter(
                        (element) => element.item_code == item.item_code && element.posa_row_id != item.posa_row_id,
                );
                const used_batches = {};
                item.batch_no_data.forEach((batch) => {
                        const status = batchStatus(batch, {
                                monthsThreshold: nearExpiryMonths,
                                today,
                        });

                        used_batches[batch.batch_no] = {
                                ...batch,
                                used_qty: 0,
                                remaining_qty: batch.batch_qty,
                                is_expired: status.expired,
                                is_near_expiry: status.nearExpiry,
                        };
                        existing_items.forEach((element) => {
                                if (element.batch_no && element.batch_no == batch.batch_no) {
                                        used_batches[batch.batch_no].used_qty += element.qty;
                                        used_batches[batch.batch_no].remaining_qty -= element.qty;
                                        used_batches[batch.batch_no].batch_qty -= element.qty;
                                }
                        });
                });

                const batch_no_data = Object.values(used_batches)
                        .map((batch) => ({
                                ...batch,
                                disabled: batch.is_expired && !allowExpired,
                        }))
                        .filter((batch) => batch.remaining_qty > 0)
                        .sort((a, b) => {
                                if (a.expiry_date && b.expiry_date) {
                                        return new Date(a.expiry_date) - new Date(b.expiry_date);
                                } else if (a.expiry_date) {
                                        return -1;
                                } else if (b.expiry_date) {
                                        return 1;
                                } else if (a.manufacturing_date && b.manufacturing_date) {
                                        return new Date(a.manufacturing_date) - new Date(b.manufacturing_date);
                                } else if (a.manufacturing_date) {
                                        return -1;
                                } else if (b.manufacturing_date) {
                                        return 1;
                                } else {
                                        return b.remaining_qty - a.remaining_qty;
                                }
                        });

                const selectableBatches = batch_no_data.filter((batch) => !batch.disabled);

                if (batch_no_data.length > 0) {
                        let batch_to_use = null;
                        if (value) {
                                batch_to_use = batch_no_data.find((batch) => batch.batch_no == value);
                        }
                        const fallbackPool = selectableBatches.length > 0 ? selectableBatches : batch_no_data;
                        if (!batch_to_use && fallbackPool.length) {
                                batch_to_use = fallbackPool[0];
                        }

                        if (batch_to_use?.disabled) {
                                const message = customWarning
                                        ? customWarning
                                                  .replace("{batch_no}", batch_to_use.batch_no)
                                                  .replace(
                                                          "{expiry_date}",
                                                          batch_to_use.expiry_date || translate("Unknown"),
                                                  )
                                        : translate("Batch {0} is expired and blocked for sale.", [
                                                  batch_to_use.batch_no,
                                          ]);
                                notify(message, "error");
                                setBatchMessage(message);
                                batch_to_use = null;
                        }

                        if (batch_to_use) {
                                item.batch_no = batch_to_use.batch_no;
                                item.actual_batch_qty = batch_to_use.batch_qty;
                                item.batch_no_expiry_date = batch_to_use.expiry_date;
                                setBatchMessage("");
                        } else {
                                item.batch_no = null;
                                item.actual_batch_qty = null;
                                item.batch_no_expiry_date = null;
                                if (!item.batch_validation_message) {
                                        setBatchMessage(translate("Please choose a valid batch."));
                                }
                        }

                        if (batch_to_use?.batch_price) {
                                // Store batch price in base currency
                                item.base_batch_price = batch_to_use.batch_price;

                                // Convert batch price to selected currency if needed
                                const baseCurrency = context.price_list_currency || context.pos_profile.currency;
                                if (context.selected_currency !== baseCurrency) {
                                        item.batch_price = context.flt(
                                                batch_to_use.batch_price / context.exchange_rate,
                                                context.currency_precision,
                                        );
                                } else {
                                        item.batch_price = batch_to_use.batch_price;
                                }

                                // Set rates based on batch price
                                item.base_price_list_rate = item.base_batch_price;
                                item.base_rate = item.base_batch_price;

                                if (context.selected_currency !== baseCurrency) {
                                        item.price_list_rate = item.batch_price;
                                        item.rate = item.batch_price;
                                } else {
                                        item.price_list_rate = item.base_batch_price;
                                        item.rate = item.base_batch_price;
                                }

                                // Reset discounts since we're using batch price
                                item.discount_percentage = 0;
                                item.discount_amount = 0;
                                item.base_discount_amount = 0;

                                // Calculate final amounts
                                item.amount = context.flt(item.qty * item.rate, context.currency_precision);
                                item.base_amount = context.flt(item.qty * item.base_rate, context.currency_precision);

                                console.log("Updated batch prices:", {
                                        base_batch_price: item.base_batch_price,
                                        batch_price: item.batch_price,
                                        rate: item.rate,
                                        base_rate: item.base_rate,
                                        price_list_rate: item.price_list_rate,
                                        exchange_rate: context.exchange_rate,
                                });
                        } else if (update && context.update_item_detail) {
                                item.batch_price = null;
                                item.base_batch_price = null;
                                context.update_item_detail(item);
                        }
                } else {
                        item.batch_no = null;
                        item.actual_batch_qty = null;
                        item.batch_no_expiry_date = null;
                        item.batch_price = null;
                        item.base_batch_price = null;

                        if (!allowExpired && !showExpired && item.has_batch_no) {
                                const message = translate("No valid batches are available for {0}.", [
                                        item.item_name || item.item_code,
                                ]);
                                notify(message);
                                setBatchMessage(message);
                        }
                }

                // Update batch_no_data
                item.batch_no_data = batch_no_data;

                // Force UI update
                if (context.forceUpdate) context.forceUpdate();
        };

	return {
		setSerialNo,
		setBatchQty,
	};
}
