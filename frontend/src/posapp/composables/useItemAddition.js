import { nextTick } from "vue";
import _ from "lodash";
import { useBundles } from "./useBundles.js";
import { withPerf } from "../utils/perf.js";

const mergeIndexKey = Symbol("posawesome:item-merge-index");

const sanitizeQty = (value) => {
        if (typeof value === "number") {
                return Number.isFinite(value) ? value : null;
        }

        if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) {
                        return null;
                }

                const parsed = Number.parseFloat(trimmed);
                return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
};

const qualifiesForIndex = (item) => {
        if (!item || !item.item_code) {
                return false;
        }

        if (item.posa_is_offer || item.posa_is_replace) {
                return false;
        }

        const qty = sanitizeQty(item.qty);
        if (qty !== null && qty <= 0) {
                return false;
        }

        return true;
};

const getCurrentVersion = (context) => (Array.isArray(context.items) ? context.items.length : 0);

const getMergeIndexState = (context) => {
        if (!context[mergeIndexKey]) {
                context[mergeIndexKey] = {
                        map: new Map(),
                        version: -1,
                };
        }

        return context[mergeIndexKey];
};

const rebuildMergeIndex = (context, state = getMergeIndexState(context)) => {
        const { map } = state;
        map.clear();

        if (Array.isArray(context.items)) {
                context.items.forEach((entry) => {
                        if (!qualifiesForIndex(entry)) {
                                return;
                        }

                        const code = entry.item_code || "";
                        let bucket = map.get(code);
                        if (!bucket) {
                                bucket = new Set();
                                map.set(code, bucket);
                        }
                        bucket.add(entry);
                });
        }

        state.version = getCurrentVersion(context);
        return state.map;
};

const ensureIndexCurrent = (context) => {
        const state = getMergeIndexState(context);
        if (state.version !== getCurrentVersion(context)) {
                rebuildMergeIndex(context, state);
        }
        return state.map;
};

const registerItemForMerge = (context, item) => {
        const state = getMergeIndexState(context);

        if (qualifiesForIndex(item)) {
                const code = item.item_code || "";
                let bucket = state.map.get(code);
                if (!bucket) {
                        bucket = new Set();
                        state.map.set(code, bucket);
                }
                bucket.add(item);
        }

        state.version = getCurrentVersion(context);
};

const unregisterItemForMerge = (context, item) => {
        const state = getMergeIndexState(context);

        if (item && item.item_code) {
                const bucket = state.map.get(item.item_code);
                if (bucket) {
                        bucket.delete(item);
                        if (bucket.size === 0) {
                                state.map.delete(item.item_code);
                        }
                }
        }

        state.version = getCurrentVersion(context);
};

const clearMergeIndex = (context) => {
        const state = getMergeIndexState(context);
        state.map.clear();
        state.version = getCurrentVersion(context);
};

const refreshItemInMergeIndex = (context, item) => {
        const state = getMergeIndexState(context);

        if (!item || !item.item_code) {
                return;
        }

        let bucket = state.map.get(item.item_code);
        if (!qualifiesForIndex(item)) {
                if (bucket) {
                        bucket.delete(item);
                        if (bucket.size === 0) {
                                state.map.delete(item.item_code);
                        }
                }
                return;
        }

        if (!bucket) {
                bucket = new Set();
                state.map.set(item.item_code, bucket);
        }

        if (!bucket.has(item)) {
                bucket.add(item);
        }
};

const findMergeCandidate = (context, incoming) => {
        if (!incoming || !incoming.item_code) {
                return null;
        }

        const index = ensureIndexCurrent(context);
        const bucket = index.get(incoming.item_code);

        if (!bucket || bucket.size === 0) {
                return null;
        }

        const incomingUom = incoming.uom || incoming.stock_uom || "";
        const ignoreBatch = Boolean(context?.pos_profile?.posa_auto_set_batch) && Boolean(
                incoming.has_batch_no || incoming.batch_no || incoming.to_set_batch_no,
        );
        const incomingBatch = incoming.to_set_batch_no || incoming.batch_no || null;

        for (const candidate of bucket) {
                if (!qualifiesForIndex(candidate)) {
                        continue;
                }

                const candidateUom = candidate.uom || candidate.stock_uom || "";
                if (candidateUom !== incomingUom) {
                        continue;
                }

                if (ignoreBatch) {
                        return candidate;
                }

                const candidateBatch = candidate.batch_no || null;
                if (
                        (candidateBatch && incomingBatch && candidateBatch === incomingBatch) ||
                        (!candidateBatch && !incomingBatch)
                ) {
                        return candidate;
                }
        }

        return null;
};

/* global frappe, __ */

export function useItemAddition() {
        const runAsyncTask = (task, contextLabel) => {
                Promise.resolve().then(() => {
                        try {
                                const result = typeof task === "function" ? task() : null;
                                if (result && typeof result.then === "function") {
                                        result.catch((error) => {
                                                console.error(
                                                        `Async task failed${contextLabel ? ` (${contextLabel})` : ""}:`,
                                                        error,
                                                );
                                        });
                                }
                        } catch (error) {
                                console.error(
                                        `Async task threw synchronously${contextLabel ? ` (${contextLabel})` : ""}:`,
                                        error,
                                );
                        }
                });
        };

        // Remove item from invoice
        const removeItem = (item, context) => {
                const index = context.items.findIndex((el) => el.posa_row_id == item.posa_row_id);
                if (index >= 0) {
                        const [removed] = context.items.splice(index, 1);
                        unregisterItemForMerge(context, removed || item);
                } else {
                        unregisterItemForMerge(context, item);
                }
                if (item.is_bundle) {
                        context.packed_items = context.packed_items.filter((it) => it.bundle_id !== item.bundle_id);
                }
                // Remove from expanded if present
                context.expanded = context.expanded.filter((id) => id !== item.posa_row_id);
        };

	const { getBundleComponents } = useBundles();

	const expandBundle = async (parent, context) => {
		const components = await getBundleComponents(parent.item_code);
		if (!components || !components.length) {
			return;
		}
		parent.is_bundle = 1;
		parent.is_bundle_parent = 1;
		parent.is_stock_item = 0;
		parent.warehouse = null;
		parent.stock_qty = 0;
		parent.bundle_id = context.makeid ? context.makeid(10) : Math.random().toString(36).substr(2, 10);
		// Force reactivity so the bundle badge appears immediately
		context.items = [...context.items];
		for (const comp of components) {
			const child = {
				parent_item: parent.item_code,
				bundle_id: parent.bundle_id,
				item_code: comp.item_code,
				item_name: comp.item_name || comp.item_code,
				qty: (parent.qty || 1) * comp.qty,
				stock_qty: (parent.qty || 1) * comp.qty,
				uom: comp.uom,
				rate: 0,
				child_qty_per_bundle: comp.qty,
				warehouse: context.pos_profile.warehouse,
				is_stock_item: 1,
				has_batch_no: comp.is_batch,
				has_serial_no: comp.is_serial,
				posa_row_id: context.makeid ? context.makeid(20) : Math.random().toString(36).substr(2, 20),
				posa_offers: JSON.stringify([]),
				posa_offer_applied: 0,
				posa_is_offer: 0,
			};
			context.packed_items.push(child);
                        if (context.update_item_detail) {
                                runAsyncTask(() => context.update_item_detail(child, false), "update_item_detail:bundle_child");
                                context.calc_stock_qty && context.calc_stock_qty(child, child.qty);
                        }
                        if (context.fetch_available_qty) {
                                runAsyncTask(() => context.fetch_available_qty(child), "fetch_available_qty:bundle_child");
                        }
		}
	};

        const moveItemToTop = (context, target) => {
                if (!target) return;
                const currentIndex = context.items.findIndex((item) => item.posa_row_id === target.posa_row_id);
                if (currentIndex > 0) {
                        const [existing] = context.items.splice(currentIndex, 1);
                        context.items.unshift(existing);
                }
        };

        const mergeIntoExisting = (context, existingItem, addition, { additionIsNewItem = false } = {}) => {
                if (!existingItem) {
                        return false;
                }

                const curItem = existingItem;
                const previousQty = curItem.qty;

                if (context.update_items_details) {
                        runAsyncTask(
                                () => context.update_items_details([curItem]),
                                additionIsNewItem ? "update_items_details:merge_new" : "update_items_details:existing",
                        );
                }

                if (additionIsNewItem) {
                        if (addition.serial_no_selected && addition.serial_no_selected.length) {
                                if (!Array.isArray(curItem.serial_no_selected)) {
                                        curItem.serial_no_selected = [];
                                }
                                addition.serial_no_selected.forEach((sn) => {
                                        if (!curItem.serial_no_selected.includes(sn)) {
                                                curItem.serial_no_selected.push(sn);
                                        }
                                });
                        }
                } else if (addition.has_serial_no && addition.to_set_serial_no) {
                        if (!Array.isArray(curItem.serial_no_selected)) {
                                curItem.serial_no_selected = [];
                        }
                        if (curItem.serial_no_selected.includes(addition.to_set_serial_no)) {
                                context.eventBus.emit("show_message", {
                                        title: __(`This Serial Number {0} has already been added!`, [addition.to_set_serial_no]),
                                        color: "warning",
                                });
                                addition.to_set_serial_no = null;
                                return false;
                        }
                        curItem.serial_no_selected.push(addition.to_set_serial_no);
                        addition.to_set_serial_no = null;
                }

                const additionQty = addition.qty ?? 1;
                const numericQty =
                        typeof additionQty === "number" && Number.isFinite(additionQty)
                                ? additionQty
                                : Number.parseFloat(additionQty) || 1;

                if (context.isReturnInvoice) {
                        curItem.qty -= Math.abs(numericQty);
                } else {
                        curItem.qty += numericQty;
                }

                if (context.calc_stock_qty) {
                        context.calc_stock_qty(curItem, curItem.qty);
                }

                if (curItem.has_batch_no && curItem.batch_no && context.setBatchQty) {
                        context.setBatchQty(curItem, curItem.batch_no, false);
                }

                if (context.setSerialNo) {
                        context.setSerialNo(curItem);
                }

                if (
                        context.calc_uom &&
                        curItem.uom &&
                        (!curItem.stock_uom || curItem.uom !== curItem.stock_uom)
                ) {
                        runAsyncTask(
                                () => context.calc_uom(curItem, curItem.uom),
                                additionIsNewItem ? "calc_uom:merge_new_item" : "calc_uom:merge_existing",
                        );
                }

                if (context.fetch_available_qty) {
                        runAsyncTask(
                                () => context.fetch_available_qty(curItem),
                                additionIsNewItem ? "fetch_available_qty:merge_new" : "fetch_available_qty:existing",
                        );
                }

                refreshItemInMergeIndex(context, curItem);

                if (!context.isReturnInvoice && curItem.qty > previousQty) {
                        moveItemToTop(context, curItem);
                }

                return true;
        };

        // Add item to invoice
        const addItem = withPerf("pos:add-item", async function addItemMeasured(item, context) {
                if (!item.uom) {
                        item.uom = item.stock_uom;
                }

                let existingItem = null;
                if (!context.new_line) {
                        existingItem = findMergeCandidate(context, item);
                }

                let new_item;
                if (!existingItem || context.new_line) {
                        new_item = getNewItem(item, context);
                        if (item.has_serial_no && item.to_set_serial_no) {
                                new_item.serial_no_selected = [];
                                new_item.serial_no_selected.push(item.to_set_serial_no);
                                item.to_set_serial_no = null;
                        }
                        if (item.has_batch_no && item.to_set_batch_no) {
                                new_item.batch_no = item.to_set_batch_no;
                                item.to_set_batch_no = null;
                                item.batch_no = null;
                                if (context.setBatchQty) context.setBatchQty(new_item, new_item.batch_no, false);
                        }
                        if (context.isReturnInvoice) {
                                new_item.qty = -Math.abs(new_item.qty || 1);
                        }
                        if (
                                context.calc_uom &&
                                new_item.uom &&
                                (!new_item.stock_uom || new_item.uom !== new_item.stock_uom)
                        ) {
                                runAsyncTask(
                                        () => context.calc_uom(new_item, new_item.uom),
                                        "calc_uom:new_item",
                                );
                        }

                        if (!context.new_line) {
                                const refreshed = findMergeCandidate(context, item);
                                if (refreshed) {
                                        existingItem = refreshed;
                                }
                        }

                        if (!existingItem || context.new_line) {
                                context.items.unshift(new_item);
                                registerItemForMerge(context, new_item);
                                runAsyncTask(() => expandBundle(new_item, context), "expand_bundle");
                                if (context.update_item_detail) {
                                        runAsyncTask(
                                                () => context.update_item_detail(new_item, false),
                                                "update_item_detail:new",
                                        );
                                }

                                if (context.fetch_available_qty) {
                                        runAsyncTask(
                                                () => context.fetch_available_qty(new_item),
                                                "fetch_available_qty:new",
                                        );
                                }

                                if (
                                        context.isReturnInvoice &&
                                        context.pos_profile.posa_allow_return_without_invoice &&
                                        new_item.has_batch_no &&
                                        !context.pos_profile.posa_auto_set_batch
                                ) {
                                        const opts =
                                                Array.isArray(new_item.batch_no_data) && new_item.batch_no_data.length > 0
                                                        ? new_item.batch_no_data
                                                        : null;
                                        if (opts) {
                                                const dialog = new frappe.ui.Dialog({
                                                        title: __("Select Batch"),
                                                        fields: [
                                                                {
                                                                        fieldtype: "Select",
                                                                        fieldname: "batch",
                                                                        label: __("Batch"),
                                                                        options: opts.map((b) => `${b.batch_no} | ${b.batch_qty}`).join("\n"),
                                                                        reqd: !context.pos_profile.posa_allow_free_batch_return,
                                                                },
                                                        ],
                                                        primary_action_label: __("Select"),
                                                        primary_action(values) {
                                                                const selected = values.batch ? values.batch.split("|")[0].trim() : null;
                                                                context.setBatchQty(new_item, selected, false);
                                                                dialog.hide();
                                                        },
                                                });
                                                dialog.onhide = () => {
                                                        if (!new_item.batch_no) {
                                                                context.setBatchQty(new_item, null, false);
                                                        }
                                                };
                                                dialog.show();
                                        } else {
                                                context.setBatchQty(new_item, null, false);
                                        }
                                }

                                if (
                                        (!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) ||
                                        new_item.has_serial_no
                                ) {
                                        nextTick(() => {
                                                context.expanded = [new_item.posa_row_id];
                                        });
                                }

                                if (context.forceUpdate) {
                                        runAsyncTask(() => context.forceUpdate(), "force_update");
                                }

                                return;
                        }

                        const mergedNew = mergeIntoExisting(context, existingItem, new_item, { additionIsNewItem: true });
                        if (mergedNew && context.forceUpdate) {
                                runAsyncTask(() => context.forceUpdate(), "force_update");
                        }
                        return;
                }

                const mergedExisting = mergeIntoExisting(context, existingItem, item);
                if (mergedExisting && context.forceUpdate) {
                        runAsyncTask(() => context.forceUpdate(), "force_update");
                }
        });


        // Create a new item object with default and calculated fields
        const getNewItem = (item, context) => {
                const new_item = { ...item };
                new_item.original_item_name = new_item.item_name;
                new_item.name_overridden = 0;
                // Mark server detail state so invoice can avoid redundant refreshes
                new_item._detailSynced = false;
                new_item._detailInFlight = false;
                if (!new_item.warehouse) {
                        new_item.warehouse = context.pos_profile.warehouse;
                }
		if (!item.qty) {
			item.qty = 1;
		}

		// Ensure normal additions are always positive (unless it's a return invoice)
		if (!context.isReturnInvoice && item.qty < 0) {
			item.qty = Math.abs(item.qty);
		}
		if (!item.posa_is_offer) {
			item.posa_is_offer = 0;
		}
		if (!item.posa_is_replace) {
			item.posa_is_replace = "";
		}

		// Initialize flag for tracking manual rate changes
		new_item._manual_rate_set = false;

		// Set negative quantity for return invoices
		if (context.isReturnInvoice && item.qty > 0) {
			item.qty = -Math.abs(item.qty);
		}

		new_item.stock_qty = item.qty;
		new_item.discount_amount = 0;
		new_item.discount_percentage = 0;
		new_item.discount_amount_per_item = 0;
		new_item.price_list_rate = item.price_list_rate ?? item.rate ?? 0;

		// Setup base rates properly for multi-currency
		const baseCurrency = context.price_list_currency || context.pos_profile.currency;
		if (context.selected_currency !== baseCurrency) {
			// Store original base currency values
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined
					? item.base_price_list_rate
					: item.rate / context.exchange_rate;
			new_item.base_rate =
				item.base_rate !== undefined ? item.base_rate : item.rate / context.exchange_rate;
			new_item.base_discount_amount = 0;
		} else {
			// In base currency, base rates = displayed rates
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined ? item.base_price_list_rate : item.rate;
			new_item.base_rate = item.base_rate !== undefined ? item.base_rate : item.rate;
			new_item.base_discount_amount = 0;
		}

		new_item.qty = item.qty;
		new_item.uom = item.uom ? item.uom : item.stock_uom;
		// Ensure item_uoms is initialized
		new_item.item_uoms = item.item_uoms || [];
		if (new_item.item_uoms.length === 0 && new_item.stock_uom) {
			new_item.item_uoms.push({ uom: new_item.stock_uom, conversion_factor: 1 });
		}
		new_item.actual_batch_qty = "";
		new_item.batch_no_expiry_date = item.batch_no_expiry_date || null;
		new_item.conversion_factor = 1;
		new_item.posa_offers = JSON.stringify([]);
		new_item.posa_offer_applied = 0;
		new_item.posa_is_offer = item.posa_is_offer;
		new_item.posa_is_replace = item.posa_is_replace || null;
		new_item.is_free_item = 0;
		new_item.is_bundle = 0;
		new_item.is_bundle_parent = 0;
		new_item.bundle_id = null;
		new_item.posa_notes = "";
		new_item.posa_delivery_date = "";
		new_item.posa_row_id = context.makeid ? context.makeid(20) : Math.random().toString(36).substr(2, 20);
		if (new_item.has_serial_no && !new_item.serial_no_selected) {
			new_item.serial_no_selected = [];
			new_item.serial_no_selected_count = 0;
		}
		// Expand row if batch/serial required
		if ((!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) || new_item.has_serial_no) {
			// Only store the row ID to keep expanded array consistent
			context.expanded.push(new_item.posa_row_id);
		}
		return new_item;
	};

        // Reset all invoice fields to default/empty values
        const clearInvoice = (context) => {
                context.items = [];
                context.packed_items = [];
                context.posa_offers = [];
                context.expanded = [];
                clearMergeIndex(context);
                context.eventBus.emit("set_pos_coupons", []);
		context.posa_coupons = [];
		context.invoice_doc = "";
		context.return_doc = "";
		context.discount_amount = 0;
		context.additional_discount = 0;
		context.additional_discount_percentage = 0;
		context.delivery_charges_rate = 0;
		context.selected_delivery_charge = "";
		// Reset posting date to today
		context.posting_date = frappe.datetime.nowdate();

		// Reset price list to default
		if (context.update_price_list) context.update_price_list();

		// Always reset to default customer after invoice
		context.customer = context.pos_profile.customer;

		context.eventBus.emit("set_customer_readonly", false);
		context.invoiceType = context.pos_profile.posa_default_sales_order ? "Order" : "Invoice";
		context.invoiceTypes = ["Invoice", "Order", "Quotation"];

		if (Object.prototype.hasOwnProperty.call(context, "itemSearch")) {
			context.itemSearch = "";
		}
	};

	// Add this utility for grouping logic, matching ItemsTable.vue
	function groupAndAddItem(items, newItem) {
		// Find a matching item (by item_code, uom, and rate)
		const match = items.find(
			(item) =>
				item.item_code === newItem.item_code &&
				item.uom === newItem.uom &&
				item.rate === newItem.rate,
		);
		if (match) {
			// If found, increment quantity
			match.qty += newItem.qty || 1;
			match.amount = match.qty * match.rate;
		} else {
			items.push({ ...newItem });
		}
	}

	// Debounced version for rapid additions
	const groupAndAddItemDebounced = _.debounce(groupAndAddItem, 50);

	return {
		removeItem,
		addItem,
		getNewItem,
		clearInvoice,
		groupAndAddItem,
		groupAndAddItemDebounced,
	};
}
