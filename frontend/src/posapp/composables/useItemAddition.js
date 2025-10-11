import { nextTick } from "vue";
import _ from "lodash";
import { useBundles } from "./useBundles.js";
import { withPerf } from "../utils/perf.js";

/* global frappe, __ */

export function useItemAddition() {
	const runAsyncTask = (task, contextLabel) => {
		Promise.resolve().then(() => {
			try {
				const result = typeof task === "function" ? task() : null;
				if (result && typeof result.then === "function") {
					result.catch((error) => {
						console.error(`Async task failed${contextLabel ? ` (${contextLabel})` : ""}:`, error);
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

	const scheduleItemTask = (context, item, taskName, task, contextLabel) => {
		runAsyncTask(() => {
			if (item?.posa_row_id && typeof context?.getItemTaskPromise === "function") {
				const existing = context.getItemTaskPromise(item.posa_row_id, taskName);
				if (existing) {
					return existing;
				}
			}
			return typeof task === "function" ? task() : null;
		}, contextLabel);
	};

	// Remove item from invoice
	const removeItem = (item, context) => {
		const index = context.items.findIndex((el) => el.posa_row_id == item.posa_row_id);
		if (index >= 0) {
			context.items.splice(index, 1);
		}
		if (item.is_bundle) {
			context.packed_items = context.packed_items.filter((it) => it.bundle_id !== item.bundle_id);
		}
		// Remove from expanded if present
		context.expanded = context.expanded.filter((id) => id !== item.posa_row_id);
		if (item?.posa_row_id && typeof context?.resetItemTaskCache === "function") {
			context.resetItemTaskCache(item.posa_row_id);
		}
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
                        const isStockItem = comp.is_stock_item ?? 1;
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
                                is_stock_item: isStockItem ? 1 : 0,
                                has_batch_no: comp.is_batch,
                                has_serial_no: comp.is_serial,
                                posa_row_id: context.makeid ? context.makeid(20) : Math.random().toString(36).substr(2, 20),
                                posa_offers: JSON.stringify([]),
                                posa_offer_applied: 0,
				posa_is_offer: 0,
			};
			context.packed_items.push(child);
                        if (context.update_item_detail) {
                                scheduleItemTask(
                                        context,
                                        child,
                                        "update_item_detail",
                                        () => context.update_item_detail(child, false),
                                        "update_item_detail:bundle_child",
                                );
                                context.calc_stock_qty && context.calc_stock_qty(child, child.qty);
                        }
                        if (context.fetch_available_qty && isStockItem) {
                                scheduleItemTask(
                                        context,
                                        child,
                                        "fetch_available_qty",
                                        () => context.fetch_available_qty(child),
					"fetch_available_qty:bundle_child",
				);
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

	// Add item to invoice
	const addItem = withPerf("pos:add-item", async function addItemMeasured(item, context) {
		if (!item.uom) {
			item.uom = item.stock_uom;
		}
		let index = -1;
		if (!context.new_line) {
			// For normal additions (not returns), only merge with existing positive quantity lines
			// This ensures that negative quantities (returns) are kept separate from positive sales
			if (context.pos_profile.posa_auto_set_batch && item.has_batch_no) {
				index = context.items.findIndex(
					(el) =>
						el.item_code === item.item_code &&
						el.uom === item.uom &&
						!el.posa_is_offer &&
						!el.posa_is_replace &&
						// Only merge with positive quantity lines for normal additions
						el.qty > 0,
				);
			} else {
				index = context.items.findIndex(
					(el) =>
						el.item_code === item.item_code &&
						el.uom === item.uom &&
						!el.posa_is_offer &&
						!el.posa_is_replace &&
						((el.batch_no && item.batch_no && el.batch_no === item.batch_no) ||
							(!el.batch_no && !item.batch_no)) &&
						// Only merge with positive quantity lines for normal additions
						el.qty > 0,
				);
			}
		}

		let new_item;
		if (index === -1 || context.new_line) {
			new_item = getNewItem(item, context);
			// Handle serial number logic
			if (item.has_serial_no && item.to_set_serial_no) {
				new_item.serial_no_selected = [];
				new_item.serial_no_selected.push(item.to_set_serial_no);
				item.to_set_serial_no = null;
			}
			// Handle batch number logic
			if (item.has_batch_no && item.to_set_batch_no) {
				new_item.batch_no = item.to_set_batch_no;
				item.to_set_batch_no = null;
				item.batch_no = null;
				if (context.setBatchQty) context.setBatchQty(new_item, new_item.batch_no, false);
			}
			// Make quantity negative for returns
			if (context.isReturnInvoice) {
				new_item.qty = -Math.abs(new_item.qty || 1);
			}
			// Apply UOM conversion immediately if barcode specifies a different UOM
			if (
				context.calc_uom &&
				new_item.uom &&
				(!new_item.stock_uom || new_item.uom !== new_item.stock_uom)
			) {
				scheduleItemTask(
					context,
					new_item,
					"calc_uom",
					() => context.calc_uom(new_item, new_item.uom),
					"calc_uom:new_item",
				);
			}

			// Re-check in case other async updates modified the cart meanwhile
			if (!context.new_line) {
				// Apply same logic - only merge with positive quantity lines for normal additions
				if (context.pos_profile.posa_auto_set_batch && item.has_batch_no) {
					index = context.items.findIndex(
						(el) =>
							el.item_code === item.item_code &&
							el.uom === item.uom &&
							!el.posa_is_offer &&
							!el.posa_is_replace &&
							// Only merge with positive quantity lines for normal additions
							el.qty > 0,
					);
				} else {
					index = context.items.findIndex(
						(el) =>
							el.item_code === item.item_code &&
							el.uom === item.uom &&
							!el.posa_is_offer &&
							!el.posa_is_replace &&
							((el.batch_no && item.batch_no && el.batch_no === item.batch_no) ||
								(!el.batch_no && !item.batch_no)) &&
							// Only merge with positive quantity lines for normal additions
							el.qty > 0,
					);
				}
			}

			if (index === -1 || context.new_line) {
				context.items.unshift(new_item);
				runAsyncTask(() => expandBundle(new_item, context), "expand_bundle");
				// Skip recalculation to preserve the manually set rate
				if (context.update_item_detail) {
					scheduleItemTask(
						context,
						new_item,
						"update_item_detail",
						() => context.update_item_detail(new_item, false),
						"update_item_detail:new",
					);
				}

				if (context.fetch_available_qty) {
					scheduleItemTask(
						context,
						new_item,
						"fetch_available_qty",
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

				// Expand new item if it has batch or serial number
				if (
					(!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) ||
					new_item.has_serial_no
				) {
					nextTick(() => {
						context.expanded = [new_item.posa_row_id];
					});
				}
			} else {
				const cur_item = context.items[index];
				const previousQty = cur_item.qty;
				if (context.update_items_details) {
					runAsyncTask(
						() => context.update_items_details([cur_item]),
						"update_items_details:merge_new",
					);
				}
				// Merge serial numbers if any
				if (new_item.serial_no_selected && new_item.serial_no_selected.length) {
					new_item.serial_no_selected.forEach((sn) => {
						if (!cur_item.serial_no_selected.includes(sn)) {
							cur_item.serial_no_selected.push(sn);
						}
					});
				}
				if (context.isReturnInvoice) {
					cur_item.qty -= Math.abs(new_item.qty || 1);
				} else {
					cur_item.qty += new_item.qty || 1;
				}
				if (context.calc_stock_qty) context.calc_stock_qty(cur_item, cur_item.qty);

				if (cur_item.has_batch_no && cur_item.batch_no && context.setBatchQty) {
					context.setBatchQty(cur_item, cur_item.batch_no, false);
				}

				if (context.setSerialNo) context.setSerialNo(cur_item);

				if (
					context.calc_uom &&
					cur_item.uom &&
					(!cur_item.stock_uom || cur_item.uom !== cur_item.stock_uom)
				) {
					scheduleItemTask(
						context,
						cur_item,
						"calc_uom",
						() => context.calc_uom(cur_item, cur_item.uom),
						"calc_uom:merge_new_item",
					);
				}

				if (context.fetch_available_qty) {
					scheduleItemTask(
						context,
						cur_item,
						"fetch_available_qty",
						() => context.fetch_available_qty(cur_item),
						"fetch_available_qty:merge_new",
					);
				}
				if (cur_item.qty > previousQty) {
					moveItemToTop(context, cur_item);
				}
			}
		} else {
			const cur_item = context.items[index];
			const previousQty = cur_item.qty;
			if (context.update_items_details) {
				runAsyncTask(() => context.update_items_details([cur_item]), "update_items_details:existing");
			}
			// Serial number logic for existing item
			if (item.has_serial_no && item.to_set_serial_no) {
				if (cur_item.serial_no_selected.includes(item.to_set_serial_no)) {
					context.eventBus.emit("show_message", {
						title: __(`This Serial Number {0} has already been added!`, [item.to_set_serial_no]),
						color: "warning",
					});
					item.to_set_serial_no = null;
					return;
				}
				cur_item.serial_no_selected.push(item.to_set_serial_no);
				item.to_set_serial_no = null;
			}

			// For returns, subtract from quantity to make it more negative
			if (context.isReturnInvoice) {
				cur_item.qty -= Math.abs(item.qty || 1);
			} else {
				cur_item.qty += item.qty || 1;
			}
			if (context.calc_stock_qty) context.calc_stock_qty(cur_item, cur_item.qty);

			// Update batch quantity if needed
			if (cur_item.has_batch_no && cur_item.batch_no && context.setBatchQty) {
				context.setBatchQty(cur_item, cur_item.batch_no, false);
			}

			if (context.setSerialNo) context.setSerialNo(cur_item);

			// Recalculate rates if UOM differs from stock UOM
			if (
				context.calc_uom &&
				cur_item.uom &&
				(!cur_item.stock_uom || cur_item.uom !== cur_item.stock_uom)
			) {
				scheduleItemTask(
					context,
					cur_item,
					"calc_uom",
					() => context.calc_uom(cur_item, cur_item.uom),
					"calc_uom:merge_existing",
				);
			}

			if (context.fetch_available_qty) {
				scheduleItemTask(
					context,
					cur_item,
					"fetch_available_qty",
					() => context.fetch_available_qty(cur_item),
					"fetch_available_qty:existing",
				);
			}
			if (cur_item.qty > previousQty) {
				moveItemToTop(context, cur_item);
			}
		}
		if (context.forceUpdate) {
			runAsyncTask(() => context.forceUpdate(), "force_update");
		}

		// Only try to expand if new_item exists and should be expanded
		if (
			new_item &&
			((!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) || new_item.has_serial_no)
		) {
			context.expanded = [new_item.posa_row_id];
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

		if (typeof context.resetItemTaskCache === "function") {
			context.resetItemTaskCache(null);
		}
		if (typeof context.clearItemDetailCache === "function") {
			context.clearItemDetailCache();
		}
		if (typeof context.clearItemStockCache === "function") {
			context.clearItemStockCache();
		}
		if (context.available_stock_cache) {
			context.available_stock_cache = {};
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
