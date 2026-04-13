declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

export function useItemCreation() {
	// Create a new item object with default and calculated fields
	const getNewItem = (item: any, context: any) => {
		const new_item = { ...item };
		new_item.original_item_name = new_item.item_name;
		new_item.name_overridden = 0;
		// Mark server detail state so invoice can avoid redundant refreshes
		new_item._detailSynced = false;
		new_item._detailInFlight = false;
		new_item._needs_update = false; // Will be set to true if added fresh

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
		new_item._manual_rate_set = new_item._manual_rate_set || false;
		new_item._manual_rate_set_from_uom =
			new_item._manual_rate_set_from_uom || false;

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
		const companyCurrency = context.pos_profile.currency;
		const selectedCurrency = context.selected_currency || companyCurrency;
		if (selectedCurrency !== companyCurrency) {
			// Store original base currency values (Selected -> Company)
			const conversionRate = context.conversion_rate || 1;
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined
					? item.base_price_list_rate
					: item.rate * conversionRate;
			new_item.base_rate =
				item.base_rate !== undefined
					? item.base_rate
					: item.rate * conversionRate;
			new_item.base_discount_amount = 0;
		} else {
			// In base currency, base rates = displayed rates
			new_item.base_price_list_rate =
				item.base_price_list_rate !== undefined
					? item.base_price_list_rate
					: item.rate;
			new_item.base_rate =
				item.base_rate !== undefined ? item.base_rate : item.rate;
			new_item.base_discount_amount = 0;
		}



		new_item.qty = item.qty;
		new_item.uom = item.uom ? item.uom : item.stock_uom;
		// Ensure item_uoms is initialized
		new_item.item_uoms = item.item_uoms || [];
		if (new_item.item_uoms.length === 0 && new_item.stock_uom) {
			new_item.item_uoms.push({
				uom: new_item.stock_uom,
				conversion_factor: 1,
			});
		}

		// Correct conversion factor initialization
		if (item.conversion_factor !== undefined) {
			new_item.conversion_factor = item.conversion_factor;
		} else {
			const uom_data = new_item.item_uoms.find(
				(u) => u.uom === new_item.uom,
			);
			new_item.conversion_factor = uom_data
				? uom_data.conversion_factor
				: 1;
		}

		// Baseline for UOM recalculations (ensure CF is finalized first)
		const initialCF = new_item.conversion_factor || 1;
		new_item.original_base_rate =
			new_item.base_rate !== undefined
				? new_item.base_rate / initialCF
				: 0;
		new_item.original_base_price_list_rate =
			new_item.base_price_list_rate !== undefined
				? new_item.base_price_list_rate / initialCF
				: new_item.original_base_rate;

		console.log("[useItemCreation] getNewItem complete", {
			item_code: new_item.item_code,
			uom: new_item.uom,
			cf: new_item.conversion_factor,
			base_rate: new_item.base_rate,
			orig_base: new_item.original_base_rate,
			orig_base_pl: new_item.original_base_price_list_rate,
		});

		new_item.actual_batch_qty = "";
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
		new_item.posa_row_id = context.makeid
			? context.makeid(20)
			: Math.random().toString(36).substr(2, 20);
		if (new_item.has_serial_no && !new_item.serial_no_selected) {
			new_item.serial_no_selected = [];
			new_item.serial_no_selected_count = 0;
		}
		// Expand row if batch/serial required
		if (
			(!context?.pos_profile?.posa_auto_set_batch &&
				new_item.has_batch_no) ||
			new_item.has_serial_no
		) {
			// Only store the row ID to keep expanded array consistent
			if (Array.isArray(context.expanded)) {
				context.expanded.push(new_item.posa_row_id);
			}
		}
		return new_item;
	};

	/**
	 * Prepare item for adding to cart (UOMs, currency conversion, etc.)
	 * Returns the prepared item (modified in place mostly, but best to return it)
	 */
	async function prepareItemForCart(
		item: any,
		requestedQty: number,
		context: any,
	) {
		const {
			pos_profile,
			itemCurrencyUtils,
			itemDetailFetcher,
			hide_qty_decimals,
		} = context;

		// Ensure UOMs are initialized
		if (!item.uom) {
			item.uom = item.stock_uom;
		}
		if (!item.item_uoms || item.item_uoms.length === 0) {
			const getItemUOMs = (window as any).getItemUOMs;
			if (typeof getItemUOMs === "function") {
				const cachedUoms = getItemUOMs(item.item_code);
				if (cachedUoms.length > 0) {
					item.item_uoms = cachedUoms;
				} else {
					item.item_uoms = [
						{ uom: item.stock_uom, conversion_factor: 1.0 },
					];
				}
			} else {
				// Fallback
				item.item_uoms = [
					{ uom: item.stock_uom, conversion_factor: 1.0 },
				];
			}

			// Benchmark: avoid awaiting item detail fetch to keep click-to-add responsive.
			if (pos_profile?.name && itemDetailFetcher) {
				itemDetailFetcher
					.update_items_details([item])
					.catch((error) => {
						console.error(
							"Failed to refresh item details for cart",
							error,
						);
					});
			}
		}

		// Handle multi-currency conversion
		if (pos_profile?.posa_allow_multi_currency && itemCurrencyUtils) {
			if (!context.price_list_currency) {
				context.price_list_currency =
					item.original_currency ||
					item.currency ||
					pos_profile.currency;
			}
			// applyCurrencyConversionToItem logic
			itemCurrencyUtils.applyCurrencyConversionToItem(item, context);

			const companyCurrency = pos_profile.currency;
			// _getPlcToCompanyRate logic
			const plcToCompanyRate = itemCurrencyUtils.getPlcToCompanyRate(
				item,
				context,
			);
			const base_rate =
				item.original_currency === companyCurrency
					? item.original_rate
					: item.original_rate * plcToCompanyRate;

			item.base_rate = base_rate;
			item.base_price_list_rate = base_rate;
		}

		// Set final quantity
		const hasBarcodeQty = item._barcode_qty;

		console.log("[useItemAddition] prepareItemForCart qty check", {
			item_code: item.item_code,
			initial_item_qty: item.qty,
			requestedQty,
			hasBarcodeQty,
		});

		if (!item.qty || (item.qty === 1 && !hasBarcodeQty)) {
			let qtyVal = requestedQty;
			if (hide_qty_decimals) {
				qtyVal = Math.trunc(qtyVal);
			}
			item.qty = qtyVal;
			console.log("[useItemAddition] qty updated", {
				item_qty: item.qty,
			});
		}

		return item;
	}

	/**
	 * Handle variant item selection
	 */
	async function handleVariantItem(item: any, context: any) {
		if (!context) return;
		const {
			items,
			pos_profile,
			active_price_list,
			customer,
			toastStore,
			uiStore,
		} = context;

		let variants = items.filter((it) => it.variant_of == item.item_code);
		let attrsMeta = {};

		// Fetch variants if not already loaded
		if (!variants.length) {
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_item_variants",
					args: {
						pos_profile: JSON.stringify(pos_profile),
						parent_item_code: item.item_code,
						price_list: active_price_list,
						customer: customer,
					},
				});
				if (res.message) {
					variants = res.message.variants || res.message;
					attrsMeta = res.message.attributes_meta || {};
					// Add variants to the main items list so they are cached
					// context.items should be the reactive array
					if (Array.isArray(items)) {
						items.push(...variants);
					} else if (context.itemsStore) {
						// If context provided store, maybe add them?
						// But usually ItemsSelector manages the list.
						// We'll leave it to the caller to manage hydration if items is not array
					}
				}
			} catch (e) {
				console.error("Failed to fetch variants", e);
			}
		}

		// Show variant selection dialog
		if (toastStore) {
			toastStore.show({
				title: __("This is an item template. Please choose a variant."),
				color: "warning",
			});
		}

		attrsMeta = attrsMeta || {};
		if (uiStore) {
			uiStore.openVariants({
				item,
				items: variants,
				profile: pos_profile,
				attrsMeta,
			});
		}
	}

	return {
		getNewItem,
		prepareItemForCart,
		handleVariantItem,
	};
}
