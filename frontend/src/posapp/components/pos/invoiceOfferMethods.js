import { silentPrint } from "../../plugins/print.js";
import { formatUtils } from "../../format.js";
/* global __, frappe, flt */

export default {
	checkOfferIsAppley(item, offer) {
		let applied = false;
		const item_offers = JSON.parse(item.posa_offers);
		for (const row_id of item_offers) {
			const exist_offer = this.posa_offers.find((el) => row_id == el.row_id);
			if (exist_offer && exist_offer.offer_name == offer.name) {
				applied = true;
				break;
			}
		}
		return applied;
	},

	handelOffers() {
		const offers = [];
		this.posOffers.forEach((offer) => {
			if (offer.apply_on === "Item Code") {
				const itemOffer = this.getItemOffer(offer);
				if (itemOffer) {
					offers.push(itemOffer);
				}
			} else if (offer.apply_on === "Item Group") {
				const groupOffer = this.getGroupOffer(offer);
				if (groupOffer) {
					offers.push(groupOffer);
				}
			} else if (offer.apply_on === "Brand") {
				const brandOffer = this.getBrandOffer(offer);
				if (brandOffer) {
					offers.push(brandOffer);
				}
			} else if (offer.apply_on === "Transaction") {
				const transactionOffer = this.getTransactionOffer(offer);
				if (transactionOffer) {
					offers.push(transactionOffer);
				}
			}
		});

		this.setItemGiveOffer(offers);
		this.updatePosOffers(offers);
	},

	setItemGiveOffer(offers) {
		// Set item give offer for replace
		offers.forEach((offer) => {
			if (offer.apply_on == "Item Code" && offer.apply_type == "Item Code" && offer.replace_item) {
				offer.give_item = offer.item;
				offer.apply_item_code = offer.item;
			} else if (
				offer.apply_on == "Item Group" &&
				offer.apply_type == "Item Group" &&
				offer.replace_cheapest_item
			) {
				const offerItemCode = this.getCheapestItem(offer).item_code;
				offer.give_item = offerItemCode;
				offer.apply_item_code = offerItemCode;
			}
		});
	},

	getCheapestItem(offer) {
		let itemsRowID;
		if (typeof offer.items === "string") {
			itemsRowID = JSON.parse(offer.items);
		} else {
			itemsRowID = offer.items;
		}
		const itemsList = [];
		itemsRowID.forEach((row_id) => {
			itemsList.push(this.getItemFromRowID(row_id));
		});
		const result = itemsList.reduce(function (res, obj) {
			return !obj.posa_is_replace && !obj.posa_is_offer && obj.price_list_rate < res.price_list_rate
				? obj
				: res;
		});
		return result;
	},

	getItemFromRowID(row_id) {
		const combined = [...this.items, ...this.packed_items];
		return combined.find((el) => el.posa_row_id == row_id);
	},

	checkQtyAnountOffer(offer, qty, amount) {
		let min_qty = false;
		let max_qty = false;
		let min_amt = false;
		let max_amt = false;
		const applys = [];

		if (offer.min_qty || offer.min_qty == 0) {
			if (qty >= offer.min_qty) {
				min_qty = true;
			}
			applys.push(min_qty);
		}

		if (offer.max_qty > 0) {
			if (qty <= offer.max_qty) {
				max_qty = true;
			}
			applys.push(max_qty);
		}

		if (offer.min_amt > 0) {
			if (amount >= offer.min_amt) {
				min_amt = true;
			}
			applys.push(min_amt);
		}

		if (offer.max_amt > 0) {
			if (amount <= offer.max_amt) {
				max_amt = true;
			}
			applys.push(max_amt);
		}
		let apply = false;
		if (!applys.includes(false)) {
			apply = true;
		}
		const res = {
			apply: apply,
			conditions: { min_qty, max_qty, min_amt, max_amt },
		};
		return res;
	},

	checkOfferCoupon(offer) {
		if (offer.coupon_based) {
			const coupon = this.posa_coupons.find((el) => offer.name == el.pos_offer);
			if (coupon) {
				offer.coupon = coupon.coupon;
				return true;
			} else {
				return false;
			}
		} else {
			offer.coupon = null;
			return true;
		}
	},

	getItemOffer(offer) {
		let apply_offer = null;
		if (offer.apply_on === "Item Code") {
			if (this.checkOfferCoupon(offer)) {
				const combined = [...this.items, ...this.packed_items];
				combined.forEach((item) => {
					if (!item.posa_is_offer && item.item_code === offer.item) {
						if (
							offer.offer === "Item Price" &&
							item.posa_offer_applied &&
							!this.checkOfferIsAppley(item, offer)
						) {
							return;
						}
						const items = [];
						const rate = item.original_price_list_rate || item.price_list_rate;
						const res = this.checkQtyAnountOffer(offer, item.stock_qty, item.stock_qty * rate);
						if (res.apply) {
							items.push(item.posa_row_id);
							offer.items = items;
							apply_offer = offer;
						}
					}
				});
			}
		}
		return apply_offer;
	},

	getGroupOffer(offer) {
		let apply_offer = null;
		if (offer.apply_on === "Item Group") {
			if (this.checkOfferCoupon(offer)) {
				const items = [];
				let total_count = 0;
				let total_amount = 0;
				const combined = [...this.items, ...this.packed_items];
				combined.forEach((item) => {
					if (!item.posa_is_offer && item.item_group === offer.item_group) {
						if (
							offer.offer === "Item Price" &&
							item.posa_offer_applied &&
							!this.checkOfferIsAppley(item, offer)
						) {
							return;
						}
						total_count += item.stock_qty;
						const rate = item.original_price_list_rate || item.price_list_rate;
						total_amount += item.stock_qty * rate;
						items.push(item.posa_row_id);
					}
				});
				if (total_count || total_amount) {
					const res = this.checkQtyAnountOffer(offer, total_count, total_amount);
					if (res.apply) {
						offer.items = items;
						apply_offer = offer;
					}
				}
			}
		}
		return apply_offer;
	},

	getBrandOffer(offer) {
		let apply_offer = null;
		if (offer.apply_on === "Brand") {
			if (this.checkOfferCoupon(offer)) {
				const items = [];
				let total_count = 0;
				let total_amount = 0;
				const combined = [...this.items, ...this.packed_items];
				combined.forEach((item) => {
					if (!item.posa_is_offer && item.brand === offer.brand) {
						if (
							offer.offer === "Item Price" &&
							item.posa_offer_applied &&
							!this.checkOfferIsAppley(item, offer)
						) {
							return;
						}
						total_count += item.stock_qty;
						const rate = item.original_price_list_rate || item.price_list_rate;
						total_amount += item.stock_qty * rate;
						items.push(item.posa_row_id);
					}
				});
				if (total_count || total_amount) {
					const res = this.checkQtyAnountOffer(offer, total_count, total_amount);
					if (res.apply) {
						offer.items = items;
						apply_offer = offer;
					}
				}
			}
		}
		return apply_offer;
	},
	getTransactionOffer(offer) {
		let apply_offer = null;
		if (offer.apply_on === "Transaction") {
			if (this.checkOfferCoupon(offer)) {
				const combined = [...this.items, ...this.packed_items];
				let total_qty = 0;
				let total_amount = 0;
				const items = [];
				combined.forEach((item) => {
					if (!item.posa_is_offer && !item.posa_is_replace) {
						total_qty += item.stock_qty;
						const rate = item.original_price_list_rate || item.price_list_rate;
						total_amount += item.stock_qty * rate;
						items.push(item.posa_row_id);
					}
				});
				const total_count = total_qty;
				if (total_count || total_amount) {
					const res = this.checkQtyAnountOffer(offer, total_count, total_amount);
					if (res.apply) {
						offer.items = items;
						apply_offer = offer;
					}
				}
			}
		}
		return apply_offer;
	},

	updatePosOffers(offers) {
		this.eventBus.emit("update_pos_offers", offers);
	},

	updateInvoiceOffers(offers) {
		this.posa_offers.forEach((invoiceOffer) => {
			const existOffer = offers.find((offer) => invoiceOffer.row_id == offer.row_id);
			if (!existOffer) {
				this.removeApplyOffer(invoiceOffer);
			}
		});
		offers.forEach((offer) => {
			const existOffer = this.posa_offers.find((invoiceOffer) => invoiceOffer.row_id == offer.row_id);
			if (existOffer) {
				existOffer.items = JSON.stringify(offer.items);
				if (
					existOffer.offer === "Give Product" &&
					existOffer.give_item &&
					existOffer.give_item != offer.give_item
				) {
					const combined = [...this.items, ...this.packed_items];
					const item_to_remove = combined.find(
						(item) => item.posa_row_id == existOffer.give_item_row_id,
					);
					if (item_to_remove) {
						const updated_item_offers = offer.items.filter(
							(row_id) => row_id != item_to_remove.posa_row_id,
						);
						offer.items = updated_item_offers;
						const collection = this.items.includes(item_to_remove)
							? this.items
							: this.packed_items;
						const idx = collection.findIndex(
							(el) => el.posa_row_id == item_to_remove.posa_row_id,
						);
						if (idx > -1) collection.splice(idx, 1);
						existOffer.give_item_row_id = null;
						existOffer.give_item = null;
					}
					const newItemOffer = this.ApplyOnGiveProduct(offer);
					if (offer.replace_cheapest_item) {
						const cheapestItem = this.getCheapestItem(offer);
						const oldBaseItem = combined.find(
							(el) => el.posa_row_id == item_to_remove.posa_is_replace,
						);
						newItemOffer.qty = item_to_remove.qty;
						if (oldBaseItem && !oldBaseItem.posa_is_replace) {
							oldBaseItem.qty += item_to_remove.qty;
						} else {
							const restoredItem = this.ApplyOnGiveProduct(
								{
									given_qty: item_to_remove.qty,
								},
								item_to_remove.item_code,
							);
							restoredItem.posa_is_offer = 0;
							this.items.unshift(restoredItem);
						}
						newItemOffer.posa_is_offer = 0;
						newItemOffer.posa_is_replace = cheapestItem.posa_row_id;
						const diffQty = cheapestItem.qty - newItemOffer.qty;
						if (diffQty <= 0) {
							newItemOffer.qty += diffQty;
							const baseCollection = this.items.includes(cheapestItem)
								? this.items
								: this.packed_items;
							const baseIndex = baseCollection.findIndex(
								(el) => el.posa_row_id == cheapestItem.posa_row_id,
							);
							if (baseIndex > -1) baseCollection.splice(baseIndex, 1);
							newItemOffer.posa_row_id = cheapestItem.posa_row_id;
							newItemOffer.posa_is_replace = newItemOffer.posa_row_id;
						} else {
							cheapestItem.qty = diffQty;
						}
					}
					this.items.unshift(newItemOffer);
					existOffer.give_item_row_id = newItemOffer.posa_row_id;
					existOffer.give_item = newItemOffer.item_code;
				} else if (
					existOffer.offer === "Give Product" &&
					existOffer.give_item &&
					existOffer.give_item == offer.give_item &&
					(offer.replace_item || offer.replace_cheapest_item)
				) {
					this.$nextTick(function () {
						const offerItem = this.getItemFromRowID(existOffer.give_item_row_id);
						const diff = offer.given_qty - offerItem.qty;
						if (diff > 0) {
							const itemsRowID = JSON.parse(existOffer.items);
							const itemsList = [];
							itemsRowID.forEach((row_id) => {
								itemsList.push(this.getItemFromRowID(row_id));
							});
							const existItem = itemsList.find(
								(el) =>
									el.item_code == offerItem.item_code &&
									el.posa_is_replace != offerItem.posa_row_id,
							);
							if (existItem) {
								const diffExistQty = existItem.qty - diff;
								if (diffExistQty > 0) {
									offerItem.qty += diff;
									existItem.qty -= diff;
								} else {
									offerItem.qty += existItem.qty;
									const col = this.items.includes(existItem)
										? this.items
										: this.packed_items;
									const idx2 = col.findIndex(
										(el) => el.posa_row_id == existItem.posa_row_id,
									);
									if (idx2 > -1) col.splice(idx2, 1);
								}
							}
						}
					});
				} else if (existOffer.offer === "Item Price") {
					this.ApplyOnPrice(offer);
				} else if (existOffer.offer === "Grand Total") {
					this.ApplyOnTotal(offer);
				}
				this.addOfferToItems(existOffer);
			} else {
				this.applyNewOffer(offer);
			}
		});
	},

	removeApplyOffer(invoiceOffer) {
		if (invoiceOffer.offer === "Item Price") {
			this.RemoveOnPrice(invoiceOffer);
			const index = this.posa_offers.findIndex((el) => el.row_id === invoiceOffer.row_id);
			this.posa_offers.splice(index, 1);
		}
		if (invoiceOffer.offer === "Give Product") {
			const combined = [...this.items, ...this.packed_items];
			const item_to_remove = combined.find((item) => item.posa_row_id == invoiceOffer.give_item_row_id);
			const index = this.posa_offers.findIndex((el) => el.row_id === invoiceOffer.row_id);
			this.posa_offers.splice(index, 1);
			if (item_to_remove) {
				const collection = this.items.includes(item_to_remove) ? this.items : this.packed_items;
				const idx = collection.findIndex((el) => el.posa_row_id == item_to_remove.posa_row_id);
				if (idx > -1) collection.splice(idx, 1);
			}
		}
		if (invoiceOffer.offer === "Grand Total") {
			this.RemoveOnTotal(invoiceOffer);
			const index = this.posa_offers.findIndex((el) => el.row_id === invoiceOffer.row_id);
			this.posa_offers.splice(index, 1);
		}
		if (invoiceOffer.offer === "Loyalty Point") {
			const index = this.posa_offers.findIndex((el) => el.row_id === invoiceOffer.row_id);
			this.posa_offers.splice(index, 1);
		}
		this.deleteOfferFromItems(invoiceOffer);
	},

	applyNewOffer(offer) {
		this.isApplyingOffer = true;
		if (offer.offer === "Item Price") {
			this.ApplyOnPrice(offer);
		}
		if (offer.offer === "Give Product") {
			let itemsRowID;
			if (typeof offer.items === "string") {
				itemsRowID = JSON.parse(offer.items);
			} else {
				itemsRowID = offer.items;
			}
			if (offer.apply_on == "Item Code" && offer.apply_type == "Item Code" && offer.replace_item) {
				const item = this.ApplyOnGiveProduct(offer, offer.item);
				item.posa_is_replace = itemsRowID[0];
				const combined = [...this.items, ...this.packed_items];
				const baseItem = combined.find((el) => el.posa_row_id == item.posa_is_replace);
				const diffQty = baseItem.qty - offer.given_qty;
				item.posa_is_offer = 0;
				if (diffQty <= 0) {
					item.qty = baseItem.qty;
					const collection = this.items.includes(baseItem) ? this.items : this.packed_items;
					const idx = collection.findIndex((el) => el.posa_row_id == baseItem.posa_row_id);
					if (idx > -1) collection.splice(idx, 1);
					item.posa_row_id = item.posa_is_replace;
				} else {
					baseItem.qty = diffQty;
				}
				this.items.unshift(item);
				offer.give_item_row_id = item.posa_row_id;
			} else if (
				offer.apply_on == "Item Group" &&
				offer.apply_type == "Item Group" &&
				offer.replace_cheapest_item
			) {
				const itemsList = [];
				itemsRowID.forEach((row_id) => {
					itemsList.push(this.getItemFromRowID(row_id));
				});
				const baseItem = itemsList.find((el) => el.item_code == offer.give_item);
				const item = this.ApplyOnGiveProduct(offer, offer.give_item);
				item.posa_is_offer = 0;
				item.posa_is_replace = baseItem.posa_row_id;
				const diffQty = baseItem.qty - offer.given_qty;
				if (diffQty <= 0) {
					item.qty = baseItem.qty;
					const collection = this.items.includes(baseItem) ? this.items : this.packed_items;
					const idx = collection.findIndex((el) => el.posa_row_id == baseItem.posa_row_id);
					if (idx > -1) collection.splice(idx, 1);
					item.posa_row_id = item.posa_is_replace;
				} else {
					baseItem.qty = diffQty;
				}
				this.items.unshift(item);
				offer.give_item_row_id = item.posa_row_id;
			} else {
				const item = this.ApplyOnGiveProduct(offer);
				this.items.unshift(item);
				if (item) {
					offer.give_item_row_id = item.posa_row_id;
				}
			}
		}
		if (offer.offer === "Grand Total") {
			this.ApplyOnTotal(offer);
		}
		if (offer.offer === "Loyalty Point") {
			this.eventBus.emit("show_message", {
				title: __("Loyalty Point Offer Applied"),
				color: "success",
			});
		}

		const newOffer = {
			offer_name: offer.name,
			row_id: offer.row_id,
			apply_on: offer.apply_on,
			offer: offer.offer,
			items: JSON.stringify(offer.items),
			give_item: offer.give_item,
			give_item_row_id: offer.give_item_row_id,
			offer_applied: offer.offer_applied,
			coupon_based: offer.coupon_based,
			coupon: offer.coupon,
		};
		this.posa_offers.push(newOffer);
		this.addOfferToItems(newOffer);
		this.isApplyingOffer = false;
	},

	ApplyOnGiveProduct(offer, item_code) {
		if (!item_code) {
			item_code = offer.give_item;
		}
		const items = this.allItems;
		const item = items.find((item) => item.item_code == item_code);
		if (!item) {
			return;
		}
		const new_item = { ...item };
		new_item.qty = offer.given_qty;
		new_item.stock_qty = offer.given_qty;

		// Handle rate based on currency
		if (offer.discount_type === "Rate") {
			// offer.rate is always in base currency (PKR)
			new_item.base_rate = offer.rate;
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				// If exchange rate is 300 PKR = 1 USD
				// Convert PKR to USD by multiplying
				new_item.rate = this.flt(offer.rate * this.exchange_rate, this.currency_precision);
			} else {
				new_item.rate = offer.rate;
			}
		} else if (offer.discount_type === "Discount Percentage") {
			// Apply percentage discount on item's base rate
			const base_price = item.base_rate || item.rate / this.exchange_rate;
			const base_discount = this.flt(
				(base_price * offer.discount_percentage) / 100,
				this.currency_precision,
			);
			new_item.base_discount_amount = base_discount;
			new_item.base_rate = this.flt(base_price - base_discount, this.currency_precision);

			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				new_item.discount_amount = this.flt(
					base_discount * this.exchange_rate,
					this.currency_precision,
				);
				new_item.rate = this.flt(new_item.base_rate * this.exchange_rate, this.currency_precision);
			} else {
				new_item.discount_amount = base_discount;
				new_item.rate = new_item.base_rate;
			}
		} else {
			// Use item's original rate
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				new_item.base_rate = item.base_rate || item.rate / this.exchange_rate;
				new_item.rate = item.rate;
			} else {
				new_item.base_rate = item.rate;
				new_item.rate = item.rate;
			}
		}

		// Handle discount amount based on currency
		if (offer.discount_type === "Discount Amount") {
			// offer.discount_amount is always in base currency (PKR)
			new_item.base_discount_amount = offer.discount_amount;
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				// Convert PKR to USD by multiplying
				new_item.discount_amount = this.flt(
					offer.discount_amount * this.exchange_rate,
					this.currency_precision,
				);
			} else {
				new_item.discount_amount = offer.discount_amount;
			}
		} else if (offer.discount_type !== "Discount Percentage") {
			new_item.base_discount_amount = 0;
			new_item.discount_amount = 0;
		}

		new_item.discount_percentage =
			offer.discount_type === "Discount Percentage" ? offer.discount_percentage : 0;
		new_item.discount_amount_per_item = 0;
		new_item.uom = item.uom ? item.uom : item.stock_uom;
		new_item.actual_batch_qty = "";
		new_item.conversion_factor = 1;
		new_item.posa_offers = JSON.stringify([]);
		new_item.posa_offer_applied =
			offer.discount_type === "Rate" ||
			offer.discount_type === "Discount Amount" ||
			offer.discount_type === "Discount Percentage"
				? 1
				: 0;
		new_item.posa_is_offer = 1;
		new_item.posa_is_replace = null;
		new_item.posa_notes = "";
		new_item.posa_delivery_date = "";

		// Handle free items
		const is_free =
			(offer.discount_type === "Rate" && !offer.rate) ||
			(offer.discount_type === "Discount Percentage" && offer.discount_percentage == 100);

		new_item.is_free_item = is_free ? 1 : 0;

		// Set price list rate based on currency similar to invoice logic
		if (is_free) {
			new_item.base_price_list_rate = 0;
			new_item.price_list_rate = 0;
		} else {
			// item.rate is already in the currently selected currency
			new_item.price_list_rate = item.rate;
			// Determine base price list rate just like invoice items
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				new_item.base_price_list_rate = this.flt(
					item.rate / this.exchange_rate,
					this.currency_precision,
				);
			} else {
				new_item.base_price_list_rate = item.rate;
			}
		}

		new_item.posa_row_id = this.makeid(20);

		if ((!this.pos_profile.posa_auto_set_batch && new_item.has_batch_no) || new_item.has_serial_no) {
			// Store only the item's row ID for the expanded state
			this.expanded.push(new_item.posa_row_id);
		}

		this.update_item_detail(new_item);
		return new_item;
	},

	ApplyOnPrice(offer) {
		console.log("Applying price offer:", offer);
		if (!offer) return;

		const combined = [...this.items, ...this.packed_items];
		combined.forEach((item) => {
			// Check if offer.items exists and is valid
			if (!item || !offer.items || !Array.isArray(offer.items)) return;

			if (offer.items.includes(item.posa_row_id)) {
				// Ensure posa_offers is initialized and valid
				const item_offers = item.posa_offers ? JSON.parse(item.posa_offers) : [];
				if (!Array.isArray(item_offers)) return;

				if (!item_offers.includes(offer.row_id)) {
					// Store original rates only if this is the first offer being applied
					if (!item.posa_offer_applied) {
						// Store original prices normalized to conversion factor 1
						const cf = flt(item.conversion_factor || 1);
						item.original_base_rate = item.base_rate / cf;
						item.original_base_price_list_rate = item.base_price_list_rate / cf;
						item.original_rate = item.rate / cf;
						item.original_price_list_rate = item.price_list_rate / cf;
						console.log("Storing original rates (normalized to conversion factor 1):", {
							original_base_rate: item.original_base_rate,
							original_base_price_list_rate: item.original_base_price_list_rate,
							original_rate: item.original_rate,
							original_price_list_rate: item.original_price_list_rate,
							conversion_factor: cf,
						});
					}

					const conversion_factor = flt(item.conversion_factor || 1);

					if (offer.discount_type === "Rate") {
						// offer.rate is always in base currency (e.g. PKR)
						const base_offer_rate = flt(offer.rate * conversion_factor);

						// Set base rates first
						item.base_rate = base_offer_rate;
						item.base_price_list_rate = base_offer_rate;

						// Convert to selected currency if needed
						const baseCurrency = this.price_list_currency || this.pos_profile.currency;
						if (this.selected_currency !== baseCurrency) {
							// If exchange rate is 285 PKR = 1 USD
							// To convert PKR to USD multiply by exchange rate
							item.rate = this.flt(
								base_offer_rate * this.exchange_rate,
								this.currency_precision,
							);
							item.price_list_rate = item.rate;
						} else {
							item.rate = base_offer_rate;
							item.price_list_rate = base_offer_rate;
						}

						// Reset discounts since we're setting rate directly
						item.discount_percentage = 0;
						item.discount_amount = 0;
						item.base_discount_amount = 0;
					} else if (offer.discount_type === "Discount Percentage") {
						item.discount_percentage = offer.discount_percentage;

						// Calculate discount in base currency first
						// Use normalized price * current conversion factor
						const base_price = this.flt(
							(item.original_base_price_list_rate ||
								item.base_price_list_rate / conversion_factor) * conversion_factor,
							this.currency_precision,
						);
						const base_discount = this.flt(
							(base_price * offer.discount_percentage) / 100,
							this.currency_precision,
						);
						item.base_discount_amount = base_discount;
						item.base_rate = this.flt(base_price - base_discount, this.currency_precision);

						// Keep price_list_rate aligned with the discounted rate so offers
						// aren't immediately overwritten by price list values.
						item.base_price_list_rate = item.base_rate;

						// Convert to selected currency if needed
						const baseCurrency = this.price_list_currency || this.pos_profile.currency;
						if (this.selected_currency !== baseCurrency) {
							item.rate = this.flt(
								item.base_rate * this.exchange_rate,
								this.currency_precision,
							);
							item.price_list_rate = item.rate;
							item.discount_amount = this.flt(
								base_discount * this.exchange_rate,
								this.currency_precision,
							);
						} else {
							item.rate = item.base_rate;
							item.price_list_rate = item.base_rate;
							item.discount_amount = base_discount;
						}
					}

					// Calculate final amounts
					item.amount = this.flt(item.qty * item.rate, this.currency_precision);
					item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);

					console.log("Updated rates after applying offer:", {
						rate: item.rate,
						base_rate: item.base_rate,
						price_list_rate: item.price_list_rate,
						base_price_list_rate: item.base_price_list_rate,
						discount_amount: item.discount_amount,
						base_discount_amount: item.base_discount_amount,
						amount: item.amount,
						base_amount: item.base_amount,
					});

					item.posa_offer_applied = 1;
					this.$forceUpdate();
				}
			}
		});
	},

	RemoveOnPrice(offer) {
		console.log("Removing price offer:", offer);
		if (!offer) return;

		const combined = [...this.items, ...this.packed_items];
		combined.forEach((item) => {
			if (!item || !item.posa_offers) return;

			try {
				const item_offers = JSON.parse(item.posa_offers);
				if (!Array.isArray(item_offers)) return;

				if (item_offers.includes(offer.row_id)) {
					console.log("Found item with offer:", item);

					// Check if we have original rates stored
					if (!item.original_base_rate) {
						console.warn("Original rates not found, fetching from server");
						this.update_item_detail(item);
						return;
					}

					// Get current conversion factor
					const cf = flt(item.conversion_factor || 1);

					console.log("Restoring original rates with conversion factor:", {
						original_base_rate: item.original_base_rate,
						original_base_price_list_rate: item.original_base_price_list_rate,
						conversion_factor: cf,
					});

					// Restore original rates adjusted for current conversion factor
					item.base_rate = this.flt(item.original_base_rate * cf, this.currency_precision);
					item.base_price_list_rate = this.flt(
						item.original_base_price_list_rate * cf,
						this.currency_precision,
					);

					// Convert to selected currency
					const baseCurrency = this.price_list_currency || this.pos_profile.currency;
					if (this.selected_currency !== baseCurrency) {
						item.rate = this.flt(item.base_rate * this.exchange_rate, this.currency_precision);
						item.price_list_rate = this.flt(
							item.base_price_list_rate * this.exchange_rate,
							this.currency_precision,
						);
					} else {
						item.rate = item.base_rate;
						item.price_list_rate = item.base_price_list_rate;
					}

					// Reset all discounts
					item.discount_percentage = 0;
					item.discount_amount = 0;
					item.base_discount_amount = 0;

					// Recalculate amounts
					item.amount = this.flt(item.qty * item.rate, this.currency_precision);
					item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);

					// Only clear original rates if no other offers are applied
					const remaining_offers = item_offers.filter((id) => id !== offer.row_id);
					if (remaining_offers.length === 0) {
						item.original_base_rate = null;
						item.original_base_price_list_rate = null;
						item.original_rate = null;
						item.original_price_list_rate = null;
						item.posa_offer_applied = 0;
					}

					// Update posa_offers
					item.posa_offers = JSON.stringify(remaining_offers);

					console.log("Updated rates after removing offer:", {
						rate: item.rate,
						base_rate: item.base_rate,
						price_list_rate: item.price_list_rate,
						base_price_list_rate: item.base_price_list_rate,
						amount: item.amount,
						base_amount: item.base_amount,
						remaining_offers: remaining_offers,
					});

					// Force UI update
					this.$forceUpdate();
				}
			} catch (error) {
				console.error("Error removing price offer:", error);
				this.eventBus.emit("show_message", {
					title: __("Error removing price offer"),
					color: "error",
					message: error.message,
				});
			}
		});
	},

	ApplyOnTotal(offer) {
		if (!offer.name) {
			offer = this.posOffers.find((el) => el.name == offer.offer_name);
		}
		if (this.discount_percentage_offer_name === offer.name && this.discount_amount !== 0) {
			// Discount already applied, do not recalculate when items change
			return;
		}
		if (
			(!this.discount_percentage_offer_name || this.discount_percentage_offer_name == offer.name) &&
			offer.discount_percentage > 0 &&
			offer.discount_percentage <= 100
		) {
			this.discount_amount = this.flt(
				(flt(this.Total) * flt(offer.discount_percentage)) / 100,
				this.currency_precision,
			);
			this.discount_percentage_offer_name = offer.name;

			// Update invoice level discount fields so the value
			// is reflected in the UI and saved correctly
			this.additional_discount = this.discount_amount;
			if (this.Total && this.Total !== 0) {
				this.additional_discount_percentage = (this.discount_amount / this.Total) * 100;
			} else {
				this.additional_discount_percentage = 0;
			}
		}
	},

	RemoveOnTotal(offer) {
		if (this.discount_percentage_offer_name && this.discount_percentage_offer_name == offer.offer_name) {
			this.discount_amount = 0;
			this.discount_percentage_offer_name = null;

			// Reset invoice discount fields when offer is removed
			this.additional_discount = 0;
			this.additional_discount_percentage = 0;
		}
	},

	addOfferToItems(offer) {
		if (!offer || !offer.items) return;

		try {
			const offer_items = typeof offer.items === "string" ? JSON.parse(offer.items) : offer.items;
			if (!Array.isArray(offer_items)) return;

			const combined = [...this.items, ...this.packed_items];
			offer_items.forEach((el) => {
				combined.forEach((exist_item) => {
					if (!exist_item || !exist_item.posa_row_id) return;

					if (exist_item.posa_row_id == el) {
						const item_offers = exist_item.posa_offers ? JSON.parse(exist_item.posa_offers) : [];
						if (!Array.isArray(item_offers)) return;

						if (!item_offers.includes(offer.row_id)) {
							item_offers.push(offer.row_id);
							if (offer.offer === "Item Price") {
								exist_item.posa_offer_applied = 1;
							}
						}
						exist_item.posa_offers = JSON.stringify(item_offers);
					}
				});
			});
		} catch (error) {
			console.error("Error adding offer to items:", error);
			this.eventBus.emit("show_message", {
				title: __("Error adding offer to items"),
				color: "error",
				message: error.message,
			});
		}
	},

	deleteOfferFromItems(offer) {
		if (!offer || !offer.items) return;

		try {
			const offer_items = typeof offer.items === "string" ? JSON.parse(offer.items) : offer.items;
			if (!Array.isArray(offer_items)) return;

			const combined = [...this.items, ...this.packed_items];
			offer_items.forEach((el) => {
				combined.forEach((exist_item) => {
					if (!exist_item || !exist_item.posa_row_id) return;

					if (exist_item.posa_row_id == el) {
						const item_offers = exist_item.posa_offers ? JSON.parse(exist_item.posa_offers) : [];
						if (!Array.isArray(item_offers)) return;

						const updated_item_offers = item_offers.filter((row_id) => row_id != offer.row_id);
						if (offer.offer === "Item Price") {
							exist_item.posa_offer_applied = 0;
						}
						exist_item.posa_offers = JSON.stringify(updated_item_offers);
					}
				});
			});
		} catch (error) {
			console.error("Error deleting offer from items:", error);
			this.eventBus.emit("show_message", {
				title: __("Error deleting offer from items"),
				color: "error",
				message: error.message,
			});
		}
	},

	validate_due_date(item) {
		const today = frappe.datetime.now_date();
		const parse_today = Date.parse(today);
		// Convert to backend format for comparison
		const backend_date = this.formatDateForBackend(item.posa_delivery_date);
		const new_date = Date.parse(backend_date);
		if (isNaN(new_date) || new_date < parse_today) {
			setTimeout(() => {
				item.posa_delivery_date = this.formatDateForDisplay(today);
			}, 0);
		} else {
			item.posa_delivery_date = this.formatDateForDisplay(backend_date);
		}
	},
	load_print_page(invoice_name) {
		const print_format = this.pos_profile.print_format_for_online || this.pos_profile.print_format;
		const letter_head = this.pos_profile.letter_head || 0;
		const doctype = this.pos_profile.create_pos_invoice_instead_of_sales_invoice
			? "POS Invoice"
			: "Sales Invoice";
		const url =
			frappe.urllib.get_base_url() +
			"/printview?doctype=" +
			encodeURIComponent(doctype) +
			"&name=" +
			invoice_name +
			"&trigger_print=1" +
			"&format=" +
			print_format +
			"&no_letterhead=" +
			letter_head;

		if (this.pos_profile.posa_silent_print) {
			silentPrint(url);
		} else {
			const printWindow = window.open(url, "Print");
			printWindow.addEventListener(
				"load",
				function () {
					printWindow.print();
				},
				{ once: true },
			);
		}
	},

	formatDateForBackend(date) {
		if (!date) return null;
		if (typeof date === "string") {
			const western = formatUtils.fromArabicNumerals(date);
			if (/^\d{4}-\d{2}-\d{2}$/.test(western)) {
				return western;
			}
			if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(western)) {
				const [d, m, y] = western.split("-");
				return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
			}
			date = western;
		}
		const d = new Date(formatUtils.fromArabicNumerals(String(date)));
		if (!isNaN(d.getTime())) {
			const year = d.getFullYear();
			const month = `0${d.getMonth() + 1}`.slice(-2);
			const day = `0${d.getDate()}`.slice(-2);
			return `${year}-${month}-${day}`;
		}
		return formatUtils.fromArabicNumerals(String(date));
	},

	formatDateForDisplay(date) {
		if (!date) return "";
		const western = formatUtils.fromArabicNumerals(String(date));
		if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(western)) {
			const [y, m, d] = western.split("-");
			return formatUtils.toArabicNumerals(`${d}-${m}-${y}`);
		}
		const d = new Date(western);
		if (!isNaN(d.getTime())) {
			const year = d.getFullYear();
			const month = `0${d.getMonth() + 1}`.slice(-2);
			const day = `0${d.getDate()}`.slice(-2);
			return formatUtils.toArabicNumerals(`${day}-${month}-${year}`);
		}
		return formatUtils.toArabicNumerals(western);
	},

	toggleOffer(item) {
		this.$nextTick(() => {
			if (!item.posa_is_offer) {
				item.posa_offers = JSON.stringify([]);
				item.posa_offer_applied = 0;
				item.discount_percentage = 0;
				item.discount_amount = 0;
				item.rate = item.price_list_rate;
				this.calc_item_price(item);
				this.handelOffers();
			}
			// Ensure Vue reactivity
			this.$forceUpdate();
		});
	}, // Added missing comma here
};
