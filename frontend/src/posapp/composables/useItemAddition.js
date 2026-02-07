import { nextTick } from "vue";
import _ from "lodash";
import { withPerf } from "../utils/perf.js";
import { parseBooleanSetting } from "../utils/stock.js";
import { useToastStore } from "../stores/toastStore.js";
import { useStockUtils } from "./useStockUtils.js";

// Imported composables
import { useItemTasks } from "./item_addition/useItemTasks.js";
import { useItemMerging } from "./item_addition/useItemMerging.js";
import { useItemCreation } from "./item_addition/useItemCreation.js";
import { useItemBatchSerial } from "./item_addition/useItemBatchSerial.js";
import { useItemBundles } from "./item_addition/useItemBundles.js";

/* global frappe, __ */

export function useItemAddition() {
	const toastStore = useToastStore();
	const { calcStockQty } = useStockUtils();

	const { runAsyncTask, scheduleItemTask } = useItemTasks();

	const {
		shouldIndexItem,
		findMergeTarget,
		refreshMergeCacheEntry,
		invalidateMergeCache,
		moveItemToTop,
		groupAndAddItem,
		groupAndAddItemDebounced,
	} = useItemMerging();

	const { getNewItem, prepareItemForCart, handleVariantItem } = useItemCreation();

	const { shouldAutoSetBatch, showBatchDialog, handleItemExpansion } = useItemBatchSerial();

	const { expandBundle } = useItemBundles();

	// Remove item from invoice
	const removeItem = (item, context) => {
		if (context.invoiceStore) {
			context.invoiceStore.removeItemByRowId(item.posa_row_id);
		} else {
			// Fallback for non-store contexts (e.g. tests or legacy)
			const index = context.items.findIndex((el) => el.posa_row_id == item.posa_row_id);
			if (index >= 0) {
				context.items.splice(index, 1);
			}
		}

		if (item.is_bundle) {
			context.packed_items = context.packed_items.filter((it) => it.bundle_id !== item.bundle_id);
		}
		// Remove from expanded if present
		if (Array.isArray(context.expanded)) {
			context.expanded = context.expanded.filter((id) => id !== item.posa_row_id);
		}
		if (item?.posa_row_id && typeof context?.resetItemTaskCache === "function") {
			context.resetItemTaskCache(item.posa_row_id);
		}
		invalidateMergeCache(context);
	};

	// Micro-batching state
	let pendingItems = [];
	let pendingResolvers = [];
	let pendingUpdates = new Map(); // rowId -> { qty, resolvers[] }
	let flushScheduled = false;

	const flushPendingItems = async (context) => {
		if (!pendingItems.length && !pendingUpdates.size) return;

		const currentItems = [...pendingItems];
		const currentResolvers = [...pendingResolvers];
		const currentUpdates = new Map(pendingUpdates);

		pendingItems = [];
		pendingResolvers = [];
		pendingUpdates.clear();
		flushScheduled = false;

		// 1. Process Updates
		for (const [rowId, data] of currentUpdates) {
			const item = context.invoiceStore.itemsData.get(rowId);
			if (item) {
				console.log("[useItemAddition] Merging item qty", { item_code: item.item_code, old_qty: item.qty, added: data.qty });
				item.qty += data.qty;
				calcStockQty(item, item.qty);

				// Handle other updates that happen on merge
				if (item.has_batch_no && item.batch_no && context.setBatchQty) {
					context.setBatchQty(item, item.batch_no, false);
				}
				if (context.setSerialNo) context.setSerialNo(item);

				// Resolve all promises waiting for this update
				data.resolvers.forEach((r) => r(item));
			}
		}

		// 2. Process Additions
		if (currentItems.length) {
			console.log("[useItemAddition] Adding new items to store", { count: currentItems.length });
			const addedItems = context.invoiceStore.addItems(currentItems, 0); // Prepend to top

			addedItems.forEach((item, index) => {
				const resolvers = currentResolvers[index]; // Array of resolvers
				refreshMergeCacheEntry(context, item, 0);
				// Benchmark note: Use preloaded batch data to avoid extra fetches on auto-assign.
				if (shouldAutoSetBatch(context, item)) {
					context.setBatchQty(item, null, false);
				}
				runAsyncTask(() => expandBundle(item, context), "expand_bundle");

				// Handle Batch/Serial/Return specific logic for new items
				if (
					context.isReturnInvoice &&
					context.pos_profile.posa_allow_return_without_invoice &&
					item.has_batch_no &&
					!context.pos_profile.posa_auto_set_batch
				) {
					showBatchDialog(item, context);
				}

				handleItemExpansion(item, context);

				// Resolve all promises waiting for this new item
				if (Array.isArray(resolvers)) {
					resolvers.forEach((r) => r(item));
				} else {
					// Fallback if structure mismatches (shouldn't happen with new logic)
					if (typeof resolvers === "function") resolvers(item);
					else if (resolvers && resolvers.resolve) resolvers.resolve(item);
				}
			});
		}

		// Update store metadata to trigger reactivity
		if (context.invoiceStore?.touch) {
			context.invoiceStore.touch();
		}

		// Trigger background flush if any updates or additions happened
		if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();
	};

	// Add item to invoice
	const addItem = withPerf("pos:add-item", async function addItemMeasured(item, context) {
		const blockSale = parseBooleanSetting(context.pos_profile?.posa_block_sale_beyond_available_qty);
		const allowNegativeStock =
			parseBooleanSetting(context.stock_settings?.allow_negative_stock) ||
			parseBooleanSetting(item.allow_negative_stock);

		if (blockSale && item.is_stock_item && item.actual_qty <= 0 && !allowNegativeStock) {
			console.debug("POS stock gate: item blocked", {
				item_code: item.item_code,
				actual_qty: item.actual_qty,
				block_sale_beyond_available_qty: blockSale,
				allow_negative_stock: allowNegativeStock,
				item_allow_negative_stock: parseBooleanSetting(item.allow_negative_stock),
			});
			toastStore.show({
				title: __("Item is out of stock"),
				detail: __("Cannot add an item with zero or negative quantity."),
				color: "error",
			});
			return;
		}

		if (blockSale && !allowNegativeStock) {
			const existingItem =
				findMergeTarget(context, item, false)?.item ||
				context.items.find((i) => i.item_code === item.item_code && i.uom === item.uom);
			const currentQty = existingItem ? existingItem.qty : 0;
			const requestedQty = item.qty || 1;
			const maxQty = item._base_actual_qty / (item.conversion_factor || 1);

			if (currentQty + requestedQty > maxQty) {
				toastStore.show({
					title: __("Quantity exceeds available stock"),
					color: "warning",
				});
				return;
			}
		}

		if (!item.uom) {
			item.uom = item.stock_uom;
		}
		let index = -1;
		let mergeTarget = null;
		const requireBatchMatch = !(context.pos_profile.posa_auto_set_batch && item.has_batch_no);
		if (!context.new_line) {
			// For normal additions (not returns), only merge with existing positive quantity lines
			mergeTarget = findMergeTarget(context, item, requireBatchMatch);
			index = mergeTarget ? mergeTarget.index : -1;
		}

		let new_item;
		if (index === -1 || context.new_line) {
			new_item = getNewItem(item, context);
			new_item._needs_update = true; // Mark new item for background update

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
			const extra_items = [];
			if (shouldAutoSetBatch(context, new_item) && context.getBatchAvailability) {
				// Get sorted availability (taking existing cart items into account)
				const batches = context.getBatchAvailability(new_item, context);
				// Filter for usable batches
				const usable_batches = batches.filter(b => b.available_qty > 0);

				// Standard Case: If no usable batches or only one needed/available
				if (usable_batches.length === 0) {
					// Fallback to standard behavior (likely picks first or none)
					context.setBatchQty(new_item, null, false);
				} else {
					let remaining_qty = new_item.qty;

					const allocations = [];

					for (const batch of usable_batches) {
						if (remaining_qty <= 0) break;
						const take = Math.min(remaining_qty, batch.available_qty);
						allocations.push({ batch: batch.batch_no, qty: take });
						remaining_qty -= take;
					}

					// If we still have remainder but ran out of batches, add it to the last allocation
					if (remaining_qty > 0) {
						if (allocations.length > 0) {
							allocations[allocations.length - 1].qty += remaining_qty;
						} else {
							// No usable batches found? Just use standard logic
							context.setBatchQty(new_item, null, false);
						}
					}

					if (allocations.length > 0) {
						// Apply first allocation to new_item
						const first = allocations[0];
						new_item.qty = first.qty;
						context.setBatchQty(new_item, first.batch, false);

						// Create items for rest
						for (let i = 1; i < allocations.length; i++) {
							const alloc = allocations[i];
							// Clone new_item. Using getNewItem again is safer to ensure unique IDs
							const split_item = getNewItem({ ...item, qty: alloc.qty }, context);
							// Copy crucial flags from new_item if any changed
							split_item.to_set_batch_no = null;
							split_item.batch_no = alloc.batch;

							// Need to explicitly set batch here because getNewItem resets logic
							if (context.setBatchQty) context.setBatchQty(split_item, alloc.batch, false);

							extra_items.push(split_item);
						}
					}
				}
			} else if (shouldAutoSetBatch(context, new_item)) {
				// Fallback if getBatchAvailability is missing (should not happen after update)
				context.setBatchQty(new_item, null, false);
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
				mergeTarget = findMergeTarget(context, item, requireBatchMatch);
				index = mergeTarget ? mergeTarget.index : -1;
			}

			if (index === -1 || context.new_line) {
				if (context.invoiceStore) {
					// Use batching
					return new Promise((resolve) => {
						// Check pending additions first
						const pendingIndex = pendingItems.findIndex((pendingItem) => {
							// Use same matching logic as findMergeTarget but for pending items
							// Note: pendingItems contains item OBJECTS, not Vue proxies yet.
							return (
								pendingItem.item_code === new_item.item_code &&
								pendingItem.uom === new_item.uom &&
								pendingItem.rate === new_item.rate
							);
						});

						if (pendingIndex !== -1 && !context.new_line) {
							// Merge with pending item
							const pendingItem = pendingItems[pendingIndex];
							if (context.isReturnInvoice) {
								pendingItem.qty -= Math.abs(new_item.qty || 1);
							} else {
								pendingItem.qty += new_item.qty || 1;
							}

							// Add this resolver to the existing item's resolver list
							if (!Array.isArray(pendingResolvers[pendingIndex])) {
								pendingResolvers[pendingIndex] = [pendingResolvers[pendingIndex]];
							}
							pendingResolvers[pendingIndex].push(resolve);
						} else {
							// Add as new pending item
							pendingItems.push(new_item);
							pendingResolvers.push([resolve]); // Array of resolvers for this item
						}

						if (!flushScheduled) {
							flushScheduled = true;
							queueMicrotask(() => flushPendingItems(context));
						}
					});
				} else {
					context.items.unshift(new_item);
					refreshMergeCacheEntry(context, new_item, 0);
					runAsyncTask(() => expandBundle(new_item, context), "expand_bundle");

					// Handle extra items from batch splitting
					if (extra_items && extra_items.length > 0) {
						console.log("[useItemAddition] Adding split batch items", extra_items.length);
						extra_items.forEach(split_item => {
							context.items.unshift(split_item);
							// Replicate basic setup for split items
							refreshMergeCacheEntry(context, split_item, 0);
							runAsyncTask(() => expandBundle(split_item, context), "expand_bundle");
							if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();

							handleItemExpansion(split_item, context);
						});
					}

					// Trigger background flush
					if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();

					if (
						context.isReturnInvoice &&
						context.pos_profile.posa_allow_return_without_invoice &&
						new_item.has_batch_no &&
						!context.pos_profile.posa_auto_set_batch
					) {
						showBatchDialog(new_item, context);
					}

					handleItemExpansion(new_item, context);
				}
			} else {
				// Existing item update
				const cur_item = context.items[index];
				const qtyDelta = context.isReturnInvoice ? -Math.abs(new_item.qty || 1) : new_item.qty || 1;

				if (context.invoiceStore) {
					// Use batching for updates
					return new Promise((resolve) => {
						const rowId = cur_item.posa_row_id;
						if (pendingUpdates.has(rowId)) {
							const data = pendingUpdates.get(rowId);
							data.qty += qtyDelta;
							data.resolvers.push(resolve);
						} else {
							pendingUpdates.set(rowId, { qty: qtyDelta, resolvers: [resolve] });
						}

						// Merge serial numbers immediately
						if (new_item.serial_no_selected && new_item.serial_no_selected.length) {
							if (!Array.isArray(cur_item.serial_no_selected)) {
								cur_item.serial_no_selected = [];
							}
							new_item.serial_no_selected.forEach((sn) => {
								if (!cur_item.serial_no_selected.includes(sn)) {
									cur_item.serial_no_selected.push(sn);
								}
							});
						}

						if (!flushScheduled) {
							flushScheduled = true;
							queueMicrotask(() => flushPendingItems(context));
						}
					});
				}

				const previousQty = cur_item.qty;
				if (context.update_items_details) {
					cur_item._needs_update = true;
				}
				// Merge serial numbers if any
				if (new_item.serial_no_selected && new_item.serial_no_selected.length) {
					if (!Array.isArray(cur_item.serial_no_selected)) {
						cur_item.serial_no_selected = [];
					}
					new_item.serial_no_selected.forEach((sn) => {
						if (!cur_item.serial_no_selected.includes(sn)) {
							cur_item.serial_no_selected.push(sn);
						}
					});
				}
				cur_item.qty += qtyDelta;

				calcStockQty(cur_item, cur_item.qty);

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

				if (cur_item.qty > previousQty) {
					moveItemToTop(context, cur_item, index);
				} else {
					refreshMergeCacheEntry(context, cur_item, index);
				}
				// Trigger background flush
				if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();
			}
		} else {
			const cur_item = context.items[index];
			const previousQty = cur_item.qty;
			if (context.update_items_details) {
				cur_item._needs_update = true;
			}
			// Serial number logic for existing item
			if (item.has_serial_no && item.to_set_serial_no) {
				if (!Array.isArray(cur_item.serial_no_selected)) {
					cur_item.serial_no_selected = [];
				}
				if (cur_item.serial_no_selected.includes(item.to_set_serial_no)) {
					toastStore.show({
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
			calcStockQty(cur_item, cur_item.qty);

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

			if (cur_item.qty > previousQty) {
				moveItemToTop(context, cur_item, index);
			} else {
				refreshMergeCacheEntry(context, cur_item, index);
			}
			// Trigger background flush
			if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();
		}
		if (context.forceUpdate) {
			runAsyncTask(() => context.forceUpdate(), "force_update");
		}

		handleItemExpansion(new_item, context);
	});

	// Reset all invoice fields to default/empty values
	const clearInvoice = (context, options = {}) => {
		const { preserveStickies = false } = options;

		if (context.invoiceStore) {
			context.invoiceStore.clear({ preserveStickies });
		} else {
			context.items = [];
			context.packed_items = [];

			if (!preserveStickies) {
				context.discount_amount = 0;
				context.additional_discount = 0;
				context.additional_discount_percentage = 0;
				context.delivery_charges_rate = 0;
				context.selected_delivery_charge = "";
			}
		}

		context.posa_offers = [];
		context.expanded = [];
		context.eventBus.emit("set_pos_coupons", []);
		context.posa_coupons = [];
		context.invoice_doc = "";
		context.return_doc = "";

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
		invalidateMergeCache(context);
	};

	return {
		removeItem,
		addItem,
		getNewItem,
		clearInvoice,
		groupAndAddItem,
		groupAndAddItemDebounced,
		handleVariantItem,
		prepareItemForCart,
	};
}
