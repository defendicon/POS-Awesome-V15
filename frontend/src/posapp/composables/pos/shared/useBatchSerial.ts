export const getDisplayableBatchOptions = (batchList: any): any[] => {
	if (!Array.isArray(batchList)) {
		return [];
	}

	return batchList.filter((batch) => {
		if (!batch?.batch_no) {
			return false;
		}

		const rawAvailableQty =
			batch.available_qty ?? batch.batch_qty ?? batch.original_batch_qty;
		const availableQty = Number(rawAvailableQty);
		return Number.isFinite(availableQty) && availableQty > 0;
	});
};

export function useBatchSerial() {
	const normalizeSerialSelection = (item: any) => {
		if (!Array.isArray(item.serial_no_selected)) {
			item.serial_no_selected = [];
		}
		return item.serial_no_selected;
	};

	const applySerialBatchFilter = (item: any) => {
		const serials = Array.isArray(item.serial_no_data)
			? item.serial_no_data
			: [];
		if (!item?.has_serial_no) {
			item.filtered_serial_no_data = serials;
			return serials;
		}

		if (!item.has_batch_no || !item.batch_no) {
			item.filtered_serial_no_data = serials;
			return serials;
		}

		const filtered = serials.filter(
			(serial) => serial?.batch_no === item.batch_no,
		);
		item.filtered_serial_no_data = filtered;
		return filtered;
	};

	const isBatchExpired = (batch: any) => {
		if (!batch || !batch.expiry_date) return false;

		const today = new Date();
		const expiryDate = new Date(batch.expiry_date);

		// Treat the batch as expired when the expiry date is today or in the past
		return expiryDate.setHours(0, 0, 0, 0) <= today.setHours(0, 0, 0, 0);
	};

	// Set serial numbers for an item (and update qty)
	const setSerialNo = (item: any, context: any) => {
		if (!item?.has_serial_no) return;

		const syncQtyFromSelection = () => {
			const selectedCount = Array.isArray(item.serial_no_selected)
				? item.serial_no_selected.length
				: 0;
			item.serial_no_selected_count = selectedCount;

			// Do not force quantity to zero when no serial is selected.
			// Keep user-entered qty intact until serials are explicitly chosen.
			if (selectedCount <= 0) {
				return;
			}

			const currentQty = Number(item.qty);
			const currentAbsQty = Number.isFinite(currentQty)
				? Math.abs(currentQty)
				: 0;
			const sign = Number.isFinite(currentQty) && currentQty < 0 ? -1 : 1;
			if (currentAbsQty !== selectedCount) {
				item.qty = sign * selectedCount;
				if (context?.forceUpdate) context.forceUpdate();
			}
		};

		const filteredSerials = applySerialBatchFilter(item);
		const currentSelection = normalizeSerialSelection(item);
		const hasSerialDataset = filteredSerials.length > 0;

		// Preserve explicitly selected serials when the backend has not returned
		// serial rows yet (or rows are temporarily unavailable after refresh).
		if (!hasSerialDataset) {
			item.serial_no = currentSelection.join("\n");
			syncQtyFromSelection();
			return;
		}

		const validSerials = new Set(
			filteredSerials.map((serial) => serial?.serial_no).filter(Boolean),
		);

		let sanitizedSelection = currentSelection.filter((serial) =>
			validSerials.has(serial),
		);

		// Keep scanned/manual serials sticky even if current filter excludes them.
		if (sanitizedSelection.length === 0 && currentSelection.length > 0) {
			sanitizedSelection = [...currentSelection];
		}

		if (
			sanitizedSelection.length !== currentSelection.length ||
			sanitizedSelection.some(
				(serial, index) => serial !== currentSelection[index],
			)
		) {
			item.serial_no_selected = sanitizedSelection;
		}

		item.serial_no = item.serial_no_selected.join("\n");
		syncQtyFromSelection();
	};

	// Calculate batch availability and sort according to FIFO/Expiry
	const getBatchAvailability = (item: any, context: any) => {
		const existing_items = context.items.filter(
			(element) =>
				element.item_code == item.item_code &&
				element.posa_row_id != item.posa_row_id,
		);
		const source_batches = Array.isArray(item.batch_no_data)
			? item.batch_no_data
			: [];
		let normalized_batch_data: any[] = source_batches
			.map((batch, index) => {
				const baseQty =
					Number(
						batch.original_batch_qty ??
							batch.batch_qty ??
							batch.available_qty,
					) || 0;
				return {
					...batch,
					_original_index: index,
					original_batch_qty: baseQty,
					used_qty: 0,
					remaining_qty: baseQty,
					available_qty: baseQty,
					is_expired:
						typeof batch.is_expired === "boolean"
							? batch.is_expired
							: isBatchExpired(batch),
				};
			})
			.sort((a, b) => a._original_index - b._original_index);

		existing_items.forEach((element) => {
			if (!element.batch_no || !element.qty) return;
			let qtyToAllocate = Number(element.qty) || 0;
			if (element.qty < 0) return; // Don't subtract returns from availability? Or should we add them?
			// Usually returns add back to stock. But simple logic: if qty > 0, it consumes stock.
			// Returns (negative qty) technically free up stock, but for auto-selection we care about "taking" stock.

			normalized_batch_data.forEach((batch) => {
				if (qtyToAllocate <= 0) return;
				if (batch.batch_no !== element.batch_no) return;
				const available = Math.max(batch.remaining_qty, 0);
				// If available <= 0, we can still "use" it to show negative/overused?
				// But here we want to calculate what's LEFT.
				// If allocation exceeds available, it just eats it all.
				const deduction = Math.min(available, qtyToAllocate);
				batch.used_qty += deduction;
				batch.remaining_qty -= deduction;
				batch.available_qty = Math.max(batch.remaining_qty, 0);
				qtyToAllocate -= deduction;
			});
		});

		normalized_batch_data = normalized_batch_data.filter(
			(batch) => !batch.is_expired,
		);

		normalized_batch_data.sort((a, b) => {
			const aExpired = a.is_expired;
			const bExpired = b.is_expired;

			if (aExpired !== bExpired) {
				return aExpired ? 1 : -1;
			}

			if (a.expiry_date && b.expiry_date) {
				return (
					new Date(a.expiry_date).getTime() -
					new Date(b.expiry_date).getTime()
				);
			} else if (a.expiry_date) {
				return -1;
			} else if (b.expiry_date) {
				return 1;
			} else if (a.manufacturing_date && b.manufacturing_date) {
				return (
					new Date(a.manufacturing_date).getTime() -
					new Date(b.manufacturing_date).getTime()
				);
			} else if (a.manufacturing_date) {
				return -1;
			} else if (b.manufacturing_date) {
				return 1;
			} else if (a.creation && b.creation) {
				return (
					new Date(a.creation).getTime() -
					new Date(b.creation).getTime()
				);
			} else {
				return a._original_index - b._original_index;
			}
		});

		console.debug("[POS BatchFlow] Calculated batch availability", {
			item_code: item?.item_code,
			row_id: item?.posa_row_id,
			batches: normalized_batch_data.map((batch) => ({
				batch_no: batch.batch_no,
				available_qty: batch.available_qty,
				remaining_qty: batch.remaining_qty,
				used_qty: batch.used_qty,
				is_expired: batch.is_expired,
			})),
		});

		return normalized_batch_data;
	};

	// Set batch number for an item (and update batch data)
	const setBatchQty = (
		item: any,
		value: any,
		update = true,
		context: any,
	) => {
		const flt = context.flt || ((v: unknown) => Number(v));
		const normalized_batch_data: any[] = getBatchAvailability(
			item,
			context,
		);
		const selectable_batches = normalized_batch_data.filter(
			(batch) => batch.available_qty > 0,
		);
		const selection_pool =
			selectable_batches.length > 0
				? selectable_batches
				: normalized_batch_data;

		if (selection_pool.length > 0) {
			let batch_to_use: any = null;
			if (value) {
				batch_to_use = normalized_batch_data.find(
					(batch) => batch.batch_no == value,
				);
			}
			if (!batch_to_use) {
				batch_to_use = selection_pool[0];
			}
			if (!batch_to_use) {
				return;
			}

			item.batch_no = batch_to_use.batch_no;
			item.actual_batch_qty = batch_to_use.available_qty;
			item.batch_no_expiry_date = batch_to_use.expiry_date;
			item.batch_no_is_expired = batch_to_use.is_expired;
			console.debug("[POS BatchFlow] Selected batch for line", {
				item_code: item?.item_code,
				row_id: item?.posa_row_id,
				batch_no: item.batch_no,
				available_qty: batch_to_use.available_qty,
				update,
			});

			const parsedBatchPrice = Number(batch_to_use.batch_price);
			const hasBatchPrice =
				Number.isFinite(parsedBatchPrice) && parsedBatchPrice > 0;
			const shouldApplyBatchPrice = hasBatchPrice;

			if (shouldApplyBatchPrice) {
				// Store batch price in base currency
				item.base_batch_price = parsedBatchPrice;

				// Convert batch price to selected currency if needed
				const baseCurrency =
					context.price_list_currency || context.pos_profile.currency;
				if (context.selected_currency !== baseCurrency) {
					item.batch_price = flt(
						parsedBatchPrice / context.exchange_rate,
						context.currency_precision,
					);
				} else {
					item.batch_price = parsedBatchPrice;
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
				item.amount = flt(
					item.qty * item.rate,
					context.currency_precision,
				);
				item.base_amount = flt(
					item.qty * item.base_rate,
					context.currency_precision,
				);
			} else if (update && context.update_item_detail) {
				item.batch_price = null;
				item.base_batch_price = null;
				context.update_item_detail(item);
			}
		} else {
			item.batch_no = null;
			item.actual_batch_qty = null;
			item.batch_no_expiry_date = null;
			item.batch_no_is_expired = false;
			item.batch_price = null;
			item.base_batch_price = null;
		}

		// Update batch_no_data with the full list so the UI can show every batch
		item.batch_no_data = normalized_batch_data;

		if (item.has_serial_no) {
			const filteredSerials = applySerialBatchFilter(item);
			const validSerials = new Set(
				filteredSerials
					.map((serial) => serial?.serial_no)
					.filter(Boolean),
			);
			const currentSelection = normalizeSerialSelection(item);
			const sanitizedSelection = currentSelection.filter((serial) =>
				validSerials.has(serial),
			);
			if (sanitizedSelection.length !== currentSelection.length) {
				item.serial_no_selected = sanitizedSelection;
			}
			setSerialNo(item, context);
		} else {
			item.filtered_serial_no_data = Array.isArray(item.serial_no_data)
				? item.serial_no_data
				: [];
		}

		// Force UI update
		if (context?.forceUpdate) context.forceUpdate();
	};

	return {
		setSerialNo,
		setBatchQty,
		getBatchAvailability,
		getDisplayableBatchOptions,
	};
}
