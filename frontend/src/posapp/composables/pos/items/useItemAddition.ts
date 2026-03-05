import _ from "lodash";
import { withPerf } from "../../../utils/perf";
import { parseBooleanSetting } from "../../../utils/stock";
import { useToastStore } from "../../../stores/toastStore";
import { useStockUtils } from "../shared/useStockUtils";

// Imported composables
import { useItemTasks } from "./addition/useItemTasks";
import { useItemMerging } from "./addition/useItemMerging";
import { useItemCreation } from "./addition/useItemCreation";
import { useItemBatchSerial } from "./addition/useItemBatchSerial";
import { useItemBundles } from "./addition/useItemBundles";
import { useBatchSerial } from "../shared/useBatchSerial";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

export function useItemAddition() {
	const toastStore = useToastStore();
	const { calcStockQty } = useStockUtils();

	const { runAsyncTask, scheduleItemTask } = useItemTasks() as any;

	const {
		findMergeTarget,
		refreshMergeCacheEntry,
		invalidateMergeCache,
		moveItemToTop,
		groupAndAddItem,
		groupAndAddItemDebounced,
	} = useItemMerging() as any;

	const { getNewItem, prepareItemForCart, handleVariantItem } =
		useItemCreation() as any;

	const { shouldAutoSetBatch, showBatchDialog, handleItemExpansion } =
		useItemBatchSerial() as any;

	const { expandBundle } = useItemBundles() as any;
	const sharedBatchSerial = useBatchSerial();
	const logBatchFlow = (message: string, payload?: any) => {
		console.debug(`[POS BatchFlow] ${message}`, payload || {});
	};

	const callSetBatchQty = (
		context: any,
		item: any,
		value: any,
		update = false,
	) => {
		if (typeof context?.setBatchQty === "function") {
			return context.setBatchQty(item, value, update);
		}
		if (typeof context?.set_batch_qty === "function") {
			return context.set_batch_qty(item, value, update);
		}
		return sharedBatchSerial.setBatchQty(item, value, update, context);
	};

	const callSetSerialNo = (context: any, item: any) => {
		if (typeof context?.setSerialNo === "function") {
			return context.setSerialNo(item);
		}
		if (typeof context?.set_serial_no === "function") {
			return context.set_serial_no(item);
		}
		return sharedBatchSerial.setSerialNo(item, context);
	};

	const getBatchAvailabilityForItem = (context: any, item: any) => {
		if (typeof context?.getBatchAvailability === "function") {
			return context.getBatchAvailability(item, context);
		}
		if (typeof context?.get_batch_availability === "function") {
			return context.get_batch_availability(item, context);
		}
		return sharedBatchSerial.getBatchAvailability(item, context);
	};

	const getRequestedSerialQty = (item: any) => {
		const parsedQty = Number(item?.qty);
		const absQty = Number.isFinite(parsedQty) ? Math.abs(Math.trunc(parsedQty)) : 0;
		return Math.max(absQty, 1);
	};

	const collectUsedSerials = (item: any, context: any) => {
		const used = new Set<string>();
		const lines = Array.isArray(context?.items) ? context.items : [];

		lines.forEach((line: any) => {
			if (!line || line.posa_row_id === item?.posa_row_id) return;
			if (line.item_code !== item?.item_code) return;
			if (item?.has_batch_no && item?.batch_no && line.batch_no && line.batch_no !== item.batch_no) {
				return;
			}

			if (Array.isArray(line.serial_no_selected)) {
				line.serial_no_selected.forEach((serial: any) => {
					const normalized = String(serial || "").trim();
					if (normalized) used.add(normalized);
				});
				return;
			}

			if (line.serial_no) {
				String(line.serial_no)
					.split("\n")
					.map((serial) => String(serial || "").trim())
					.filter(Boolean)
					.forEach((serial) => used.add(serial));
			}
		});

		return used;
	};

	const autoAssignSerials = (item: any, context: any) => {
		if (!item?.has_serial_no) return;

		const serialRows = Array.isArray(item.serial_no_data) ? item.serial_no_data : [];
		if (!serialRows.length) {
			callSetSerialNo(context, item);
			return;
		}

		if (!Array.isArray(item.serial_no_selected)) {
			item.serial_no_selected = [];
		}

		let candidateRows = serialRows.filter((row: any) => row?.serial_no);
		if (item.has_batch_no && item.batch_no) {
			candidateRows = candidateRows.filter(
				(row: any) => !row?.batch_no || row.batch_no === item.batch_no,
			);
		}

		const targetQty = getRequestedSerialQty(item);
		if (item.serial_no_selected.length >= targetQty) {
			callSetSerialNo(context, item);
			return;
		}

		const usedSerials = collectUsedSerials(item, context);
		item.serial_no_selected.forEach((serial: any) => {
			const normalized = String(serial || "").trim();
			if (normalized) usedSerials.add(normalized);
		});

		const availableSerialRows = candidateRows.filter((row: any) => {
			const serialNo = String(row?.serial_no || "").trim();
			return serialNo && !usedSerials.has(serialNo);
		});

		const needed = targetQty - item.serial_no_selected.length;
		const pickedRows = availableSerialRows.slice(0, needed);
		if (pickedRows.length) {
			pickedRows.forEach((row: any) => {
				item.serial_no_selected.push(String(row.serial_no));
			});

			if (!item.batch_no) {
				const batchFromSerial = pickedRows.find((row: any) => row?.batch_no)?.batch_no;
				if (batchFromSerial) {
					item.batch_no = batchFromSerial;
					callSetBatchQty(context, item, batchFromSerial, false);
				}
			}
		}

		callSetSerialNo(context, item);
	};

	// Remove item from invoice
	const removeItem = (item, context) => {
		if (context.invoiceStore) {
			context.invoiceStore.removeItemByRowId(item.posa_row_id);
		} else {
			// Fallback for non-store contexts (e.g. tests or legacy)
			const index = context.items.findIndex(
				(el) => el.posa_row_id == item.posa_row_id,
			);
			if (index >= 0) {
				context.items.splice(index, 1);
			}
		}

		if (item.is_bundle) {
			context.packed_items = context.packed_items.filter(
				(it) => it.bundle_id !== item.bundle_id,
			);
		}
		// Remove from expanded if present
		if (Array.isArray(context.expanded)) {
			context.expanded = context.expanded.filter(
				(id) => id !== item.posa_row_id,
			);
		}
		if (
			item?.posa_row_id &&
			typeof context?.resetItemTaskCache === "function"
		) {
			context.resetItemTaskCache(item.posa_row_id);
		}
		invalidateMergeCache(context);
	};

	// Micro-batching state
	let pendingItems: any[] = [];
	let pendingResolvers: Array<Array<(_value: any) => void>> = [];
	let pendingUpdates = new Map<
		any,
		{ qty: number; resolvers: Array<(_value: any) => void> }
	>(); // rowId -> { qty, resolvers[] }
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
				console.log("[useItemAddition] Merging item qty", {
					item_code: item.item_code,
					old_qty: item.qty,
					added: data.qty,
				});
				item.qty += data.qty;
				calcStockQty(item, item.qty);

				// Handle other updates that happen on merge
				if (item.has_batch_no && item.batch_no) {
					callSetBatchQty(context, item, item.batch_no, false);
				}
				callSetSerialNo(context, item);

				// Resolve all promises waiting for this update
				data.resolvers.forEach((r) => r(item));
			}
		}

		// 2. Process Additions
		if (currentItems.length) {
			console.log("[useItemAddition] Adding new items to store", {
				count: currentItems.length,
			});
			const addedItems = context.invoiceStore.addItems(currentItems, 0); // Prepend to top

			addedItems.forEach((item, index) => {
				const resolvers = currentResolvers[index] || []; // Array of resolvers
				refreshMergeCacheEntry(context, item, 0);
				// Benchmark note: Use preloaded batch data to avoid extra fetches on auto-assign.
				if (shouldAutoSetBatch(context, item)) {
					callSetBatchQty(context, item, null, false);
				}
				runAsyncTask(
					() => expandBundle(item, context),
					"expand_bundle",
				);

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
				resolvers.forEach((r) => r(item));
			});
		}

		// Update store metadata to trigger reactivity
		if (context.invoiceStore?.touch) {
			context.invoiceStore.touch();
		}

		// Trigger background flush if any updates or additions happened
		if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();
	};

	const addSplitItemsDirectly = (context: any, splitItems: any[]) => {
		if (!Array.isArray(splitItems) || splitItems.length === 0) {
			return;
		}
		logBatchFlow("Adding split items directly", {
			count: splitItems.length,
			items: splitItems.map((entry: any) => ({
				item_code: entry?.item_code,
				batch_no: entry?.batch_no,
				qty: entry?.qty,
			})),
		});

		if (context.invoiceStore) {
			const added = context.invoiceStore.addItems(splitItems, 0);
			added.forEach((line: any) => {
				refreshMergeCacheEntry(context, line, 0);
				runAsyncTask(() => expandBundle(line, context), "expand_bundle");
				handleItemExpansion(line, context);
			});
			if (context.invoiceStore?.touch) {
				context.invoiceStore.touch();
			}
		} else {
			splitItems.forEach((line: any) => {
				context.items.unshift(line);
				refreshMergeCacheEntry(context, line, 0);
				runAsyncTask(() => expandBundle(line, context), "expand_bundle");
				handleItemExpansion(line, context);
			});
		}

		if (context.triggerBackgroundFlush) {
			context.triggerBackgroundFlush();
		}
	};

	// Add item to invoice
	const addItem = withPerf(
		"pos:add-item",
		async function addItemMeasured(item, context) {
			const currentInvoiceType =
				typeof context?.invoiceType === "string"
					? context.invoiceType
					: context?.invoiceType?.value;
			const deferStockValidationToPayment =
				currentInvoiceType === "Order" || currentInvoiceType === "Quotation";

			const blockSale = parseBooleanSetting(
				context.pos_profile?.posa_block_sale_beyond_available_qty,
			);
			const allowNegativeStock =
				parseBooleanSetting(
					context.stock_settings?.allow_negative_stock,
				) || parseBooleanSetting(item.allow_negative_stock);

			if (
				!context.isReturnInvoice &&
				!deferStockValidationToPayment &&
				blockSale &&
				item.is_stock_item &&
				item.actual_qty <= 0 &&
				!allowNegativeStock
			) {
				console.debug("POS stock gate: item blocked", {
					item_code: item.item_code,
					actual_qty: item.actual_qty,
					block_sale_beyond_available_qty: blockSale,
					allow_negative_stock: allowNegativeStock,
					item_allow_negative_stock: parseBooleanSetting(
						item.allow_negative_stock,
					),
				});
				toastStore.show({
					title: __("Item is out of stock"),
					detail: __(
						"Cannot add an item with zero or negative quantity.",
					),
					color: "error",
				});
				return;
			}

			if (
				!context.isReturnInvoice &&
				!deferStockValidationToPayment &&
				blockSale &&
				!allowNegativeStock
			) {
				const existingItem =
					findMergeTarget(context, item, false)?.item ||
					context.items.find(
						(i) =>
							i.item_code === item.item_code &&
							i.uom === item.uom,
					);
				const currentQty = existingItem ? existingItem.qty : 0;
				const requestedQty = item.qty || 1;
				const maxQty =
					item._base_actual_qty / (item.conversion_factor || 1);

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
			let mergeTarget: any = null;
			const requireBatchMatch = Boolean(item.has_batch_no);
			if (!context.new_line) {
				// For normal additions (not returns), only merge with existing positive quantity lines
				mergeTarget = findMergeTarget(context, item, requireBatchMatch);
				index = mergeTarget ? mergeTarget.index : -1;
			}

			let new_item: any;
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
					callSetBatchQty(context, new_item, new_item.batch_no, false);
				}
				const extra_items: any[] = [];
				const requestedQtyForBatching = Math.abs(
					Number(new_item.qty || 0),
				);
				const shouldAllocateAcrossBatches =
					new_item.has_batch_no &&
					!new_item.batch_no &&
					(shouldAutoSetBatch(context, new_item) ||
						requestedQtyForBatching > 1);

				if (shouldAllocateAcrossBatches) {
					// Get sorted availability (taking existing cart items into account)
					const batches = getBatchAvailabilityForItem(
						context,
						new_item,
					);
					// Filter for usable batches
					const usable_batches = batches.filter(
						(b) => b.available_qty > 0,
					);

					// Standard Case: If no usable batches or only one needed/available
					if (usable_batches.length === 0) {
						// Fallback to standard behavior (likely picks first or none)
						callSetBatchQty(context, new_item, null, false);
					} else {
						let remaining_qty = new_item.qty;

						const allocations: Array<{ batch: any; qty: number }> =
							[];

						for (const batch of usable_batches) {
							if (remaining_qty <= 0) break;
							const take = Math.min(
								remaining_qty,
								batch.available_qty,
							);
							if (take <= 0) continue;
							allocations.push({
								batch: batch.batch_no,
								qty: take,
							});
							remaining_qty -= take;
						}
						logBatchFlow("Batch allocation prepared", {
							item_code: new_item.item_code,
							requested_qty: new_item.qty,
							allocations,
							remaining_qty,
						});

						// If we still have remainder but ran out of batches, add it to the last allocation
						if (remaining_qty > 0) {
							if (allocations.length > 0) {
								const lastAllocation =
									allocations[allocations.length - 1];
								if (lastAllocation) {
									lastAllocation.qty += remaining_qty;
									logBatchFlow(
										"Insufficient batch availability, keeping remainder on last allocation",
										{
											item_code: new_item.item_code,
											remainder: remaining_qty,
											last_batch: lastAllocation.batch,
										},
									);
								}
							} else {
								// No usable batches found? Just use standard logic
								callSetBatchQty(context, new_item, null, false);
							}
						}

						if (allocations.length > 0) {
							// Apply first allocation to new_item
							const first = allocations[0];
							if (first) {
								new_item.qty = first.qty;
								callSetBatchQty(
									context,
									new_item,
									first.batch,
									false,
								);
							}

							// Create items for rest
							for (let i = 1; i < allocations.length; i++) {
								const alloc = allocations[i];
								if (!alloc) continue;
								// Clone new_item. Using getNewItem again is safer to ensure unique IDs
								const split_item = getNewItem(
									{ ...item, qty: alloc.qty },
									context,
								);
								// Copy crucial flags from new_item if any changed
								split_item.to_set_batch_no = null;
								split_item.batch_no = alloc.batch;

								// Need to explicitly set batch here because getNewItem resets logic
								callSetBatchQty(
									context,
									split_item,
									alloc.batch,
									false,
								);
								if (split_item.has_serial_no) {
									autoAssignSerials(split_item, context);
								}

								extra_items.push(split_item);
							}
						}
					}
				} else if (shouldAutoSetBatch(context, new_item)) {
					// Fallback if getBatchAvailability is missing (should not happen after update)
					callSetBatchQty(context, new_item, null, false);
				}
				// Make quantity negative for returns
				if (context.isReturnInvoice) {
					new_item.qty = -Math.abs(new_item.qty || 1);
				}

				if (new_item.has_serial_no) {
					autoAssignSerials(new_item, context);
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
					const mergeProbeItem = new_item || item;
					mergeTarget = findMergeTarget(
						context,
						mergeProbeItem,
						requireBatchMatch,
					);
					index = mergeTarget ? mergeTarget.index : -1;
					logBatchFlow("Re-check merge target", {
						item_code: mergeProbeItem?.item_code,
						batch_no: mergeProbeItem?.batch_no || "",
						found_index: index,
					});
				}

				if (index === -1 || context.new_line) {
					if (context.invoiceStore) {
						// Use batching
						return new Promise((resolve) => {
							const toQueue = [new_item, ...extra_items];
							toQueue.forEach((line, lineIndex) => {
								const pendingIndex = pendingItems.findIndex(
									(pendingItem) =>
										pendingItem.item_code === line.item_code &&
										pendingItem.uom === line.uom &&
										pendingItem.rate === line.rate &&
										(pendingItem.batch_no || "") ===
											(line.batch_no || ""),
								);

								if (pendingIndex !== -1 && !context.new_line) {
									const pendingItem = pendingItems[pendingIndex];
									if (context.isReturnInvoice) {
										pendingItem.qty -= Math.abs(line.qty || 1);
									} else {
										pendingItem.qty += line.qty || 1;
									}
									if (lineIndex === 0) {
										const existingResolvers =
											pendingResolvers[pendingIndex] || [];
										existingResolvers.push(resolve);
										pendingResolvers[pendingIndex] =
											existingResolvers;
									}
								} else {
									pendingItems.push(line);
									pendingResolvers.push(
										lineIndex === 0 ? [resolve] : [],
									);
								}
							});

							if (!flushScheduled) {
								flushScheduled = true;
								queueMicrotask(() =>
									flushPendingItems(context),
								);
							}
						});
					} else {
						context.items.unshift(new_item);
						refreshMergeCacheEntry(context, new_item, 0);
						runAsyncTask(
							() => expandBundle(new_item, context),
							"expand_bundle",
						);

						// Handle extra items from batch splitting
						if (extra_items && extra_items.length > 0) {
							console.log(
								"[useItemAddition] Adding split batch items",
								extra_items.length,
							);
							extra_items.forEach((split_item) => {
								context.items.unshift(split_item);
								// Replicate basic setup for split items
								refreshMergeCacheEntry(context, split_item, 0);
								runAsyncTask(
									() => expandBundle(split_item, context),
									"expand_bundle",
								);
								if (context.triggerBackgroundFlush)
									context.triggerBackgroundFlush();

								handleItemExpansion(split_item, context);
							});
						}

						// Trigger background flush
						if (context.triggerBackgroundFlush)
							context.triggerBackgroundFlush();

						if (
							context.isReturnInvoice &&
							context.pos_profile
								.posa_allow_return_without_invoice &&
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
					const qtyDelta = context.isReturnInvoice
						? -Math.abs(new_item.qty || 1)
						: new_item.qty || 1;

					if (context.invoiceStore) {
						// Use batching for updates
						return new Promise((resolve) => {
							const rowId = cur_item.posa_row_id;
							if (pendingUpdates.has(rowId)) {
								const data = pendingUpdates.get(rowId);
								if (!data) return;
								data.qty += qtyDelta;
								data.resolvers.push(resolve);
							} else {
								pendingUpdates.set(rowId, {
									qty: qtyDelta,
									resolvers: [resolve],
								});
							}

							// Merge serial numbers immediately
							if (
								new_item.serial_no_selected &&
								new_item.serial_no_selected.length
							) {
								if (
									!Array.isArray(cur_item.serial_no_selected)
								) {
									cur_item.serial_no_selected = [];
								}
								new_item.serial_no_selected.forEach((sn) => {
									if (
										!cur_item.serial_no_selected.includes(
											sn,
										)
									) {
										cur_item.serial_no_selected.push(sn);
									}
								});
							}

							if (extra_items.length > 0) {
								extra_items.forEach((splitLine) => {
									const pendingIndex = pendingItems.findIndex(
										(pendingItem) =>
											pendingItem.item_code === splitLine.item_code &&
											pendingItem.uom === splitLine.uom &&
											pendingItem.rate === splitLine.rate &&
											(pendingItem.batch_no || "") ===
												(splitLine.batch_no || ""),
									);
									if (pendingIndex !== -1 && !context.new_line) {
										const pendingItem = pendingItems[pendingIndex];
										if (context.isReturnInvoice) {
											pendingItem.qty -= Math.abs(splitLine.qty || 1);
										} else {
											pendingItem.qty += splitLine.qty || 1;
										}
									} else {
										pendingItems.push(splitLine);
										pendingResolvers.push([]);
									}
								});
							}

							if (!flushScheduled) {
								flushScheduled = true;
								queueMicrotask(() =>
									flushPendingItems(context),
								);
							}
						});
					}

					const previousQty = cur_item.qty;
					if (context.update_items_details) {
						cur_item._needs_update = true;
					}
					// Merge serial numbers if any
					if (
						new_item.serial_no_selected &&
						new_item.serial_no_selected.length
					) {
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

					if (
						cur_item.has_batch_no &&
						cur_item.batch_no
					) {
						callSetBatchQty(
							context,
							cur_item,
							cur_item.batch_no,
							false,
						);
					}

					callSetSerialNo(context, cur_item);
					if (cur_item.has_serial_no) autoAssignSerials(cur_item, context);

					if (
						context.calc_uom &&
						cur_item.uom &&
						(!cur_item.stock_uom ||
							cur_item.uom !== cur_item.stock_uom)
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
					if (context.triggerBackgroundFlush)
						context.triggerBackgroundFlush();
					if (extra_items.length > 0) {
						addSplitItemsDirectly(context, extra_items);
					}
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
					if (
						cur_item.serial_no_selected.includes(
							item.to_set_serial_no,
						)
					) {
						toastStore.show({
							title: __(
								`This Serial Number {0} has already been added!`,
								[item.to_set_serial_no],
							),
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
				if (
					cur_item.has_batch_no &&
					cur_item.batch_no
				) {
					callSetBatchQty(context, cur_item, cur_item.batch_no, false);
				}

				callSetSerialNo(context, cur_item);
				if (cur_item.has_serial_no) autoAssignSerials(cur_item, context);

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
				if (context.triggerBackgroundFlush)
					context.triggerBackgroundFlush();
			}
			if (context.forceUpdate) {
				runAsyncTask(() => context.forceUpdate(), "force_update");
			}

			if (new_item) {
				handleItemExpansion(new_item, context);
			}
		},
	);

	// Reset all invoice fields to default/empty values
	const clearInvoice = (
		context,
		options: { preserveStickies?: boolean } = {},
	) => {
		const { preserveStickies = false } = options;
		const previousInvoiceType = context.invoiceType;
		const wasReturn =
			previousInvoiceType === "Return" ||
			Boolean(context?.invoice_doc?.is_return);
		const wasQuotation = previousInvoiceType === "Quotation";

		if (context.invoiceStore) {
			context.invoiceStore.clear({ preserveStickies });
		} else {
			context.items = [];
			context.packed_items = [];
		}

		if (!preserveStickies) {
			context.discount_amount = 0;
			context.additional_discount = 0;
			context.additional_discount_percentage = 0;
			context.base_delivery_charges_rate = 0;
			context.delivery_charges_rate = 0;
			context.selected_delivery_charge = null;
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
		context.invoiceType = wasReturn || wasQuotation
			? "Invoice"
			: context.pos_profile.posa_default_sales_order
				? "Order"
				: "Invoice";
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
