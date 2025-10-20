import { clearPriceListCache } from "../../../offline/index.js";
import { useCustomersStore } from "../../stores/customersStore.js";
/* global frappe */

const buildSnapshot = (items) => {
	const snapshot = {
		order: [],
		qty: {},
		stockQty: {},
		meta: {},
	};

	(Array.isArray(items) ? items : []).forEach((item) => {
		if (!item || !item.posa_row_id) {
			return;
		}
		const rowId = item.posa_row_id;
		snapshot.order.push(rowId);
		snapshot.qty[rowId] = item.qty;
		snapshot.stockQty[rowId] = item.stock_qty;
		snapshot.meta[rowId] = {
			item_code: item.item_code,
			item_group: item.item_group,
			brand: item.brand,
			uom: item.uom,
			conversion_factor: item.conversion_factor,
			price_list_rate: item.price_list_rate,
			stock_qty: item.stock_qty,
			posa_is_offer: item.posa_is_offer,
			posa_is_replace: item.posa_is_replace,
		};
	});

	return snapshot;
};

const diffSnapshots = (previous, current) => {
	const prevSnapshot = previous || { order: [], qty: {}, stockQty: {}, meta: {} };
	const changed = new Set();
	const removedInfo = {};

	const prevOrder = Array.isArray(prevSnapshot.order) ? prevSnapshot.order : [];
	const currOrder = Array.isArray(current.order) ? current.order : [];
	const prevSet = new Set(prevOrder);
	const currSet = new Set(currOrder);

	currOrder.forEach((rowId) => {
		if (!prevSet.has(rowId)) {
			changed.add(rowId);
		}
	});

	prevOrder.forEach((rowId) => {
		if (!currSet.has(rowId)) {
			changed.add(rowId);
			if (prevSnapshot.meta && prevSnapshot.meta[rowId]) {
				removedInfo[rowId] = { ...prevSnapshot.meta[rowId] };
			}
		}
	});

	currOrder.forEach((rowId) => {
		const previousQty = prevSnapshot.qty ? prevSnapshot.qty[rowId] : undefined;
		if (previousQty !== current.qty[rowId]) {
			changed.add(rowId);
		}

		const previousStockQty = prevSnapshot.stockQty ? prevSnapshot.stockQty[rowId] : undefined;
		if (previousStockQty !== current.stockQty[rowId]) {
			changed.add(rowId);
		}

		const prevMeta = prevSnapshot.meta ? prevSnapshot.meta[rowId] : undefined;
		const currMeta = current.meta ? current.meta[rowId] : undefined;
		if (JSON.stringify(prevMeta) !== JSON.stringify(currMeta)) {
			changed.add(rowId);
		}
	});

	return { changed, removedInfo };
};

export default {
	// Watch for customer change and update related data
        customer() {
                this.close_payments();
                const customersStore = useCustomersStore();
                customersStore.setSelectedCustomer(this.customer || null);
                this.fetch_customer_details();
                this.fetch_customer_balance();
                this.set_delivery_charges();
                this.sync_invoice_customer_details();
        },
        // Watch for customer_info change and emit to edit form
        customer_info() {
                const customersStore = useCustomersStore();
                customersStore.setCustomerInfo(this.customer_info || {});
                this.sync_invoice_customer_details(this.customer_info);
        },
	// Watch for expanded row change and update item detail
	expanded(data_value) {
		if (data_value.length > 0) {
			const expandedId = data_value[0];
			const item = this.items.find((it) => it.posa_row_id === expandedId);
			if (item) {
				this.update_item_detail(item);
			}
		}
	},
	// Watch for discount offer name change and emit
	discount_percentage_offer_name() {
		this.eventBus.emit("update_discount_percentage_offer_name", {
			value: this.discount_percentage_offer_name,
		});
	},
	// Watch for items array changes (deep) and re-handle offers
	items: {
		deep: true,
		handler(newItems) {
			const snapshot = buildSnapshot(newItems);
			this._offerSnapshots = this._offerSnapshots || {};
			const previous = this._offerSnapshots.items;
			this._offerSnapshots.items = snapshot;

			const { changed, removedInfo } = diffSnapshots(previous, snapshot);

			if (removedInfo && Object.keys(removedInfo).length) {
				this._pendingRemovedRowInfo = {
					...(this._pendingRemovedRowInfo || {}),
					...removedInfo,
				};
			}

			if (!previous) {
				if (snapshot.order.length) {
					this.scheduleOfferRefresh([...new Set(snapshot.order)]);
				}
				return;
			}

			if (changed.size) {
				this.scheduleOfferRefresh(Array.from(changed));
			}
		},
	},
	packed_items: {
		deep: true,
		handler(newItems) {
			const snapshot = buildSnapshot(newItems);
			this._offerSnapshots = this._offerSnapshots || {};
			const previous = this._offerSnapshots.packed;
			this._offerSnapshots.packed = snapshot;

			const { changed, removedInfo } = diffSnapshots(previous, snapshot);

			if (removedInfo && Object.keys(removedInfo).length) {
				this._pendingRemovedRowInfo = {
					...(this._pendingRemovedRowInfo || {}),
					...removedInfo,
				};
			}

			if (!previous) {
				if (snapshot.order.length) {
					this.scheduleOfferRefresh([...new Set(snapshot.order)]);
				}
				return;
			}

			if (changed.size) {
				this.scheduleOfferRefresh(Array.from(changed));
			}
		},
	},
	// Watch for invoice type change and emit
	invoiceType() {
		this.eventBus.emit("update_invoice_type", this.invoiceType);
	},
	// Watch for additional discount and update percentage accordingly
	additional_discount() {
		if (!this.additional_discount || this.additional_discount == 0) {
			this.additional_discount_percentage = 0;
		} else if (this.pos_profile.posa_use_percentage_discount) {
			// Prevent division by zero which causes NaN
			if (this.Total && this.Total !== 0) {
				this.additional_discount_percentage = (this.additional_discount / this.Total) * 100;
			} else {
				this.additional_discount_percentage = 0;
			}
		} else {
			this.additional_discount_percentage = 0;
		}
	},
	// Keep display date in sync with posting_date
	posting_date: {
		handler(newVal) {
			this.posting_date_display = this.formatDateForDisplay(newVal);
		},
		immediate: true,
	},
	// Update posting_date when user changes the display value
	posting_date_display(newVal) {
		this.posting_date = this.formatDateForBackend(newVal);
	},

	selected_price_list(newVal) {
		// Clear cached price list items to avoid mixing rates
		clearPriceListCache();

		const price_list = newVal === this.pos_profile.selling_price_list ? null : newVal;
		this.eventBus.emit("update_customer_price_list", price_list);
		const applied = newVal || this.pos_profile.selling_price_list;
		this.apply_cached_price_list(applied);

		// If multi-currency is enabled, sync currency with the price list currency
		if (this.pos_profile.posa_allow_multi_currency && applied) {
			frappe.call({
				method: "posawesome.posawesome.api.invoices.get_price_list_currency",
				args: { price_list: applied },
				callback: (r) => {
					if (r.message) {
						// Store price list currency for later use
						this.price_list_currency = r.message;
						// Sync invoice currency with price list currency
						this.update_currency(r.message);
					}
				},
			});
		}

		if (Array.isArray(this.items)) {
			this.items.forEach((item) => {
				item._detailSynced = false;
			});
		}
		if (Array.isArray(this.packed_items)) {
			this.packed_items.forEach((item) => {
				item._detailSynced = false;
			});
		}

		if (typeof this.clearItemDetailCache === "function") {
			this.clearItemDetailCache();
		}
		if (typeof this.clearItemStockCache === "function") {
			this.clearItemStockCache();
		}
		if (this.available_stock_cache) {
			this.available_stock_cache = {};
		}
	},

	// Reactively update item prices when currency changes
	selected_currency() {
		clearPriceListCache();
		if (this.items && this.items.length) {
			this.update_item_rates();
		}
	},

	// Reactively update item prices when exchange rate changes
	exchange_rate() {
		if (this.items && this.items.length) {
			this.update_item_rates();
		}
	},
};
