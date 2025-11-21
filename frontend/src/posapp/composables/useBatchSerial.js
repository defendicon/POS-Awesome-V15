export function useBatchSerial() {
	const normalizeSerialSelection = (item) => {
		if (!Array.isArray(item.serial_no_selected)) {
			item.serial_no_selected = [];
		}
		return item.serial_no_selected;
	};

	const applySerialBatchFilter = (item) => {
		const serials = Array.isArray(item.serial_no_data) ? item.serial_no_data : [];
		if (!item?.has_serial_no) {
			item.filtered_serial_no_data = serials;
			return serials;
		}

		if (!item.has_batch_no || !item.batch_no) {
			item.filtered_serial_no_data = serials;
			return serials;
		}

		const filtered = serials.filter((serial) => serial?.batch_no === item.batch_no);
		item.filtered_serial_no_data = filtered;
		return filtered;
	};

	const isBatchExpired = (batch) => {
		if (!batch || !batch.expiry_date) return false;

		const today = new Date();
		const expiryDate = new Date(batch.expiry_date);

		// Treat the batch as expired when the expiry date is today or in the past
		return expiryDate.setHours(0, 0, 0, 0) <= today.setHours(0, 0, 0, 0);
	};

	// Set serial numbers for an item (and update qty)
	const setSerialNo = (item, context) => {
		if (!item?.has_serial_no) return;

		const filteredSerials = applySerialBatchFilter(item);
		const validSerials = new Set(filteredSerials.map((serial) => serial?.serial_no).filter(Boolean));

		const currentSelection = normalizeSerialSelection(item);
		const sanitizedSelection = currentSelection.filter((serial) => validSerials.has(serial));
		if (sanitizedSelection.length !== currentSelection.length) {
			item.serial_no_selected = sanitizedSelection;
		}

		item.serial_no = item.serial_no_selected.join("\n");
		item.serial_no_selected_count = item.serial_no_selected.length;
		if (item.serial_no_selected_count != item.stock_qty) {
			item.qty = item.serial_no_selected_count;
			if (context?.forceUpdate) context.forceUpdate();
		}
	};

	// Set batch number for an item (and update batch data)
	const setBatchQty = (item, value, update = true, context) => {
		const existing_items = context.items.filter(
			(element) => element.item_code == item.item_code && element.posa_row_id != item.posa_row_id,
		);
		const source_batches = Array.isArray(item.batch_no_data) ? item.batch_no_data : [];
		const normalized_batch_data = source_batches
			.map((batch, index) => {
				const baseQty = Number(batch.original_batch_qty ?? batch.batch_qty) || 0;
				return {
					...batch,
					_original_index: index,
					original_batch_qty: baseQty,
					used_qty: 0,
					remaining_qty: baseQty,
					available_qty: baseQty,
					is_expired:
						typeof batch.is_expired === "boolean" ? batch.is_expired : isBatchExpired(batch),
				};
			})
			.sort((a, b) => a._original_index - b._original_index);

		existing_items.forEach((element) => {
			if (!element.batch_no || !element.qty) return;
			let qtyToAllocate = Number(element.qty) || 0;
			normalized_batch_data.forEach((batch) => {
				if (qtyToAllocate <= 0) return;
				if (batch.batch_no !== element.batch_no) return;
				const available = Math.max(batch.remaining_qty, 0);
				if (available <= 0) return;
				const deduction = Math.min(available, qtyToAllocate);
				batch.used_qty += deduction;
				batch.remaining_qty -= deduction;
				batch.available_qty = Math.max(batch.remaining_qty, 0);
				qtyToAllocate -= deduction;
			});
		});

		normalized_batch_data.sort((a, b) => {
			const aExpired = a.is_expired;
			const bExpired = b.is_expired;

			if (aExpired !== bExpired) {
				return aExpired ? 1 : -1;
			}

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

		const selectable_batches = normalized_batch_data.filter((batch) => batch.available_qty > 0);
		const selection_pool = selectable_batches.length > 0 ? selectable_batches : normalized_batch_data;

		if (selection_pool.length > 0) {
			let batch_to_use = null;
			if (value) {
				batch_to_use = normalized_batch_data.find((batch) => batch.batch_no == value);
			}
			if (!batch_to_use) {
				batch_to_use = selection_pool[0];
			}

			item.batch_no = batch_to_use.batch_no;
			item.actual_batch_qty = batch_to_use.available_qty;
			item.batch_no_expiry_date = batch_to_use.expiry_date;
			item.batch_no_is_expired = batch_to_use.is_expired;

			if (batch_to_use.batch_price) {
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
			item.batch_no_is_expired = false;
			item.batch_price = null;
			item.base_batch_price = null;
		}

		// Update batch_no_data with the full list so the UI can show every batch
		item.batch_no_data = normalized_batch_data;

		if (item.has_serial_no) {
			const filteredSerials = applySerialBatchFilter(item);
			const validSerials = new Set(filteredSerials.map((serial) => serial?.serial_no).filter(Boolean));
			const currentSelection = normalizeSerialSelection(item);
			const sanitizedSelection = currentSelection.filter((serial) => validSerials.has(serial));
			if (sanitizedSelection.length !== currentSelection.length) {
				item.serial_no_selected = sanitizedSelection;
			}
			setSerialNo(item, context);
		} else {
			item.filtered_serial_no_data = Array.isArray(item.serial_no_data) ? item.serial_no_data : [];
		}

		// Force UI update
		if (context?.forceUpdate) context.forceUpdate();
	};

	return {
		setSerialNo,
		setBatchQty,
	};
}
