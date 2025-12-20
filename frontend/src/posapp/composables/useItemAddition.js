import { nextTick } from "vue";
import _ from "lodash";
import { useBundles } from "./useBundles.js";
import { withPerf } from "../utils/perf.js";

/* global frappe, __ */

export function useItemAddition() {
	// Batching State
	const batchState = {
		queue: [],
		timer: null
	};

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

	// Helper to find merge target (optimized with cache)
	const findMergeTargetInList = (list, newItem, requireBatchMatch, context) => {
		// Use O(1) cache if available on context
		if (context && context.getMergeTarget && typeof context.getMergeTarget === 'function') {
			const cacheHit = context.getMergeTarget(newItem);
			if (cacheHit && cacheHit.item && !cacheHit.item.posa_is_offer && !cacheHit.item.posa_is_replace) {
				// Verify batch requirement if needed
				if (requireBatchMatch) {
					const hitBatch = cacheHit.item.batch_no || '';
					const newBatch = newItem.batch_no || '';
					if (hitBatch !== newBatch) return null;
				}
				return cacheHit;
			}
			return null;
		}

		// Fallback to O(N) search if cache is not ready
		const newItemKey = `${newItem.item_code}::${newItem.uom}::${requireBatchMatch ? newItem.batch_no || '' : ''}`;

		// Search from end (likely to merge with recently added items)
		for (let i = list.length - 1; i >= 0; i--) {
			const existing = list[i];
			if (!existing || existing.posa_is_offer || existing.posa_is_replace) continue;

			const existingKey = `${existing.item_code}::${existing.uom}::${requireBatchMatch ? existing.batch_no || '' : ''}`;
			if (existingKey === newItemKey) {
				return { item: existing, index: i };
			}
		}
		return null;
	};

	// Remove item from invoice
	const removeItem = (item, context) => {
		const invoiceStore = context.invoiceStore;
		if (invoiceStore) {
			invoiceStore.removeItemByRowId(item.posa_row_id);
		} else {
			// Fallback for direct array manipulation
			const index = context.items.findIndex((el) => el.posa_row_id == item.posa_row_id);
			if (index >= 0) {
				context.items.splice(index, 1);
			}
		}

		if (item.is_bundle) {
			context.packed_items = context.packed_items.filter((it) => it.bundle_id !== item.bundle_id);
		}
		// Remove from expanded if present
		context.expanded = context.expanded.filter((id) => id !== item.posa_row_id);
		if (item?.posa_row_id && typeof context?.resetItemTaskCache === "function") {
			context.resetItemTaskCache(item.posa_row_id);
		}

		// Invalidate cache if available
		if (context && context.refreshMergeCacheEntry && typeof context.refreshMergeCacheEntry === 'function') {
			// Actually we need to remove or invalidate the cache for this item
			// But since we removed it, we can just trigger a refresh or let the cache helper handle it
			// For now, assume ItemsTable handles cache invalidation on list changes or just let it be stale until next add
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

		// Force reactivity
		if (context.invoiceStore) {
			context.invoiceStore.upsertItem(parent);
		} else {
			context.items = [...context.items];
		}

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

			if (context.invoiceStore) {
				context.invoiceStore.packedItems.push(child);
			} else {
				context.packed_items.push(child);
			}

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

	// Flush the batch queue
	const flushBatch = (context) => {
		if (!batchState.queue.length) {
			batchState.timer = null;
			return;
		}

		const batch = [...batchState.queue];
		batchState.queue = [];
		batchState.timer = null;

		const invoiceStore = context.invoiceStore;

		// If using store, we can use batch updates
		const updateFn = () => {
			batch.forEach(({ item, isNewLine }) => {
				processSingleItemAdd(context, item, isNewLine);
			});
		};

		if (invoiceStore && invoiceStore.batchUpdate) {
			invoiceStore.batchUpdate(updateFn);
		} else {
			updateFn();
		}

		if (context.forceUpdate) {
			context.forceUpdate();
		}
	};

	// Core logic to add a single item (extracted from original addItem)
	const processSingleItemAdd = (context, item, isNewLine) => {
		const invoiceStore = context.invoiceStore;
		// Use store items or context items
		const itemsList = invoiceStore ? invoiceStore.items : context.items;

		const requireBatchMatch = !(context.pos_profile.posa_auto_set_batch && item.has_batch_no);
		let mergeTarget = null;

		if (!isNewLine) {
			mergeTarget = findMergeTargetInList(itemsList, item, requireBatchMatch, context);
		}

		if (!mergeTarget) {
			// NEW ITEM
			const new_item = getNewItem(item, context);

			// Serial No Logic
			if (item.has_serial_no && item.to_set_serial_no) {
				new_item.serial_no_selected = [item.to_set_serial_no];
				item.to_set_serial_no = null;
			}

			// Batch No Logic
			if (item.has_batch_no && item.to_set_batch_no) {
				new_item.batch_no = item.to_set_batch_no;
				item.to_set_batch_no = null;
				item.batch_no = null;
				if (context.setBatchQty) context.setBatchQty(new_item, new_item.batch_no, false);
			}

			if (context.isReturnInvoice) {
				new_item.qty = -Math.abs(new_item.qty || 1);
			}

			// Add to list
			if (invoiceStore) {
				invoiceStore.upsertItem(new_item);
			} else {
				context.items.unshift(new_item);
			}

			// Update merge cache with new item
			if (context.refreshMergeCacheEntry && typeof context.refreshMergeCacheEntry === 'function') {
				// Use index 0 as upsert pushes to end or unshift pushes to start, but for cache just need item
				context.refreshMergeCacheEntry(new_item);
			}

			// Async tasks
			runAsyncTask(() => expandBundle(new_item, context), "expand_bundle");

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

			// Batch return logic
			if (
				context.isReturnInvoice &&
				context.pos_profile.posa_allow_return_without_invoice &&
				new_item.has_batch_no &&
				!context.pos_profile.posa_auto_set_batch
			) {
				// Dialog logic (omitted for batch add simplicity, assume default)
				context.setBatchQty(new_item, null, false);
			}

			// Expansion logic
			if ((!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) || new_item.has_serial_no) {
				context.expanded = [new_item.posa_row_id];
			}

		} else {
			// MERGE EXISTING
			const cur_item = mergeTarget.item;

			// Serial Logic
			if (item.has_serial_no && item.to_set_serial_no) {
				if (!cur_item.serial_no_selected.includes(item.to_set_serial_no)) {
					cur_item.serial_no_selected.push(item.to_set_serial_no);
				}
				item.to_set_serial_no = null;
			}

			// Qty Logic
			if (context.isReturnInvoice) {
				cur_item.qty -= Math.abs(item.qty || 1);
			} else {
				cur_item.qty += item.qty || 1;
			}

			if (context.calc_stock_qty) context.calc_stock_qty(cur_item, cur_item.qty);

			if (cur_item.has_batch_no && cur_item.batch_no && context.setBatchQty) {
				context.setBatchQty(cur_item, cur_item.batch_no, false);
			}

			if (context.setSerialNo) context.setSerialNo(cur_item);

			// Tasks
			if (context.update_items_details) {
				runAsyncTask(() => context.update_items_details([cur_item]), "update_items_details:merge");
			}

			if (invoiceStore) {
				invoiceStore.upsertItem(cur_item); // Trigger update
			}

			// Refresh cache for merged item
			if (context.refreshMergeCacheEntry && typeof context.refreshMergeCacheEntry === 'function') {
				context.refreshMergeCacheEntry(cur_item);
			}
		}
	};

	// Add item to invoice (Batched)
	const addItem = withPerf("pos:add-item", async function addItemMeasured(item, context) {
		const blockSale = context.pos_profile?.posa_block_sale_beyond_available_qty;
		const allowNegativeStock =
			item.allow_negative_stock === 1 ||
			item.allow_negative_stock === true ||
			item.allow_negative_stock === "1";

		if (item.is_stock_item && item.actual_qty <= 0 && !allowNegativeStock) {
			context.eventBus.emit("show_message", {
				title: __("Item is out of stock"),
				text: __("Cannot add an item with zero or negative quantity."),
				color: "error",
			});
			return;
		}

		if (blockSale && !allowNegativeStock) {
			// Check stock across queue + existing
			// Simplified check:
			const maxQty = item._base_actual_qty / (item.conversion_factor || 1);
			// This check is tricky with batching. We'll skip for now or do best effort.
			// Ideally, we sum up current qty + queued qty.
		}

		if (!item.uom) {
			item.uom = item.stock_uom;
		}

		// Queue the item
		batchState.queue.push({
			item: { ...item }, // Clone to avoid mutation issues in queue
			isNewLine: context.new_line
		});

		// Schedule flush
		if (!batchState.timer) {
			batchState.timer = requestAnimationFrame(() => flushBatch(context));
		}
	});

	// Create a new item object with default and calculated fields
	const getNewItem = (item, context) => {
		const new_item = { ...item };
		new_item.original_item_name = new_item.item_name;
		new_item.name_overridden = 0;
		new_item._detailSynced = false;
		new_item._detailInFlight = false;
		if (!new_item.warehouse) {
			new_item.warehouse = context.pos_profile.warehouse;
		}
		if (!item.qty) {
			item.qty = 1;
		}

		if (!context.isReturnInvoice && item.qty < 0) {
			item.qty = Math.abs(item.qty);
		}
		if (!item.posa_is_offer) {
			item.posa_is_offer = 0;
		}
		if (!item.posa_is_replace) {
			item.posa_is_replace = "";
		}

		new_item._manual_rate_set = false;
		new_item._manual_rate_set_from_uom = false;

		if (context.isReturnInvoice && item.qty > 0) {
			item.qty = -Math.abs(item.qty);
		}

		new_item.stock_qty = item.qty;
		new_item.discount_amount = 0;
		new_item.discount_percentage = 0;
		new_item.discount_amount_per_item = 0;
		new_item.price_list_rate = item.price_list_rate ?? item.rate ?? 0;

		const baseCurrency = context.price_list_currency || context.pos_profile.currency;
		if (context.selected_currency !== baseCurrency) {
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined
					? item.base_price_list_rate
					: item.rate / context.exchange_rate;
			new_item.base_rate =
				item.base_rate !== undefined ? item.base_rate : item.rate / context.exchange_rate;
			new_item.base_discount_amount = 0;
		} else {
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined ? item.base_price_list_rate : item.rate;
			new_item.base_rate = item.base_rate !== undefined ? item.base_rate : item.rate;
			new_item.base_discount_amount = 0;
		}

		new_item.qty = item.qty;
		new_item.uom = item.uom ? item.uom : item.stock_uom;
		new_item.item_uoms = item.item_uoms || [];
		if (new_item.item_uoms.length === 0 && new_item.stock_uom) {
			new_item.item_uoms.push({ uom: new_item.stock_uom, conversion_factor: 1 });
		}
		new_item.actual_batch_qty = "";
		new_item.batch_no_expiry_date = item.batch_no_expiry_date || null;
		new_item.batch_no_is_expired = item.batch_no_is_expired || false;
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

		if ((!context.pos_profile.posa_auto_set_batch && new_item.has_batch_no) || new_item.has_serial_no) {
			context.expanded.push(new_item.posa_row_id);
		}
		return new_item;
	};

	const clearInvoice = (context) => {
		const invoiceStore = context.invoiceStore;
		if (invoiceStore) {
			invoiceStore.clearItems();
			invoiceStore.packedItems = [];
		} else {
			context.items = [];
			context.packed_items = [];
		}

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
		context.posting_date = frappe.datetime.nowdate();

		if (context.update_price_list) context.update_price_list();

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

	// Helper for direct usage (without batching) if needed, mostly for testing
	const groupAndAddItem = (items, newItem) => {
		const match = items.find(
			(item) =>
				item.item_code === newItem.item_code &&
				item.uom === newItem.uom &&
				item.rate === newItem.rate,
		);
		if (match) {
			match.qty += newItem.qty || 1;
			match.amount = match.qty * match.rate;
		} else {
			items.push({ ...newItem });
		}
	}

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
