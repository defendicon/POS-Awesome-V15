/**
 * Cart item management: column preferences, quantity editing, and delivery charges.
 *
 * **Column visibility**
 * `available_columns` lists every possible cart table column. `selected_columns`
 * is the operator-chosen subset, persisted to `localStorage` under the key
 * `posawesome_selected_columns`. The computed `items_headers` merges required
 * columns with the operator selection. `loadColumnPreferences` applies profile
 * defaults when no saved preference exists; `saveColumnPreferences` writes back
 * on every change.
 *
 * **Quantity editing (`setFormatedQty`)**
 * The central quantity setter enforces several layered rules in order:
 * 1. Clamps to `_offer_constraints.max_qty` for offer lines.
 * 2. Enforces stock ceiling when `posa_validate_stock` is enabled, with a
 *    "block vs. warn" branch controlled by `posa_block_sale_beyond_available_qty`
 *    and `allow_negative_stock`.
 * 3. Forces negative sign on return invoices.
 * After setting qty it calls `calc_stock_qty` and, for bundles,
 * `updateBundleChildrenQty`. It emits `apply_pricing_rules` on the bus.
 *
 * **Increment / decrement helpers**
 * `add_one` and `subtract_one` mirror the sign of the current qty so they work
 * correctly on return lines. Both remove the item automatically when qty would
 * reach zero. `blockSaleBeyondAvailableQty` is disabled for Order/Quotation types.
 *
 * **Delivery charges**
 * `fetch_delivery_charges(customer)` calls the server and caches results via
 * `saveDeliveryChargesCache`. On failure `getCachedDeliveryCharges` is used.
 * Three watchers keep `invoiceStore` in sync with the local delivery charge refs
 * so the customer display panel always reflects the current selection.
 */
import { ref, computed, watch } from "vue";
import type { Ref } from "vue";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useStockUtils } from "../shared/useStockUtils";
import { useItemAddition } from "../items/useItemAddition";
import { parseBooleanSetting } from "../../../utils/stock";
import {
	getCachedDeliveryCharges,
	saveDeliveryChargesCache,
} from "../../../../offline/index";
import format from "../../../format";
import { bus } from "../../../bus";

// @ts-ignore
const __ = window.__ || ((s) => s);

export function useInvoiceItems(invoiceType: Ref<string>) {
	const invoiceStore = useInvoiceStore();
	const toastStore = useToastStore();
	const uiStore = useUIStore();
	const { calc_stock_qty } = useStockUtils();
	const { removeItem, addItem } = useItemAddition();

	const pos_profile = computed(() => uiStore.posProfile);
	const stock_settings = computed(() => uiStore.stockSettings);

	const isReturnInvoice = computed(() => {
		return (
			invoiceType.value === "Return" ||
			(invoiceStore.invoiceDoc && invoiceStore.invoiceDoc.is_return)
		);
	});

	const blockSaleBeyondAvailableQty = computed(() => {
		if (["Order", "Quotation"].includes(invoiceType.value)) {
			return false;
		}
		return parseBooleanSetting(
			pos_profile.value?.posa_block_sale_beyond_available_qty,
		);
	});

	// --- Header and Column Management ---
	const available_columns = ref([
		{
			title: __("Name"),
			align: "start",
			sortable: true,
			key: "item_name",
			required: true,
		},
		{ title: __("QTY"), key: "qty", align: "center", required: true },
		{ title: __("UOM"), key: "uom", align: "center", required: false },
		{
			title: __("Price List Rate"),
			key: "price_list_rate",
			align: "end",
			required: false,
			width: "120px",
		},
		{
			title: __("Discount %"),
			key: "discount_percentage",
			align: "end",
			required: false,
		},
		{
			title: __("Discount Amount"),
			key: "discount_amount",
			align: "end",
			required: false,
		},
		{ title: __("Rate"), key: "rate", align: "center", required: true },
		{ title: __("Amount"), key: "amount", align: "center", required: true },
		{
			title: __("Offer?"),
			key: "posa_is_offer",
			align: "center",
			required: false,
		},
		{
			title: __("Actions"),
			key: "actions",
			align: "center",
			required: true,
			sortable: false,
		},
	]);

	const selected_columns = ref<string[]>([]);
	const items_headers = computed(() => {
		return available_columns.value.filter(
			(col) => selected_columns.value.includes(col.key) || col.required,
		);
	});

	const loadColumnPreferences = () => {
		try {
			const saved = localStorage.getItem("posawesome_selected_columns");
			if (saved) {
				const parsed: string[] = JSON.parse(saved);
				// Migrate old "discount_value" key (renamed to "discount_percentage")
				selected_columns.value = parsed.map((key) =>
					key === "discount_value" ? "discount_percentage" : key,
				);
			} else if (pos_profile.value) {
				// Default selection based on POS Profile
				selected_columns.value = available_columns.value
					.filter((col) => {
						if (col.required) return true;
						if (col.key === "price_list_rate") return true;
						if (
							col.key === "discount_percentage" &&
							pos_profile.value?.posa_display_discount_percentage
						)
							return true;
						if (
							col.key === "discount_amount" &&
							pos_profile.value?.posa_display_discount_amount
						)
							return true;
						return false;
					})
					.map((col) => col.key);
			}
		} catch (e) {
			console.error("Failed to load column preferences:", e);
		}
	};

	const saveColumnPreferences = () => {
		try {
			localStorage.setItem(
				"posawesome_selected_columns",
				JSON.stringify(selected_columns.value),
			);
		} catch (e) {
			console.error("Failed to save column preferences:", e);
		}
	};

	// --- Quality and Stock Validation ---

	const resolveFloatPrecision = (precision: number | null | undefined) => {
		if (Number.isInteger(precision) && Number(precision) >= 0) {
			return Number(precision);
		}

		const profilePrecision = Number.parseInt(
			String(pos_profile.value?.posa_decimal_precision ?? ""),
			10,
		);
		if (Number.isInteger(profilePrecision) && profilePrecision >= 0) {
			return profilePrecision;
		}

		const defaultPrecision = Number.parseInt(
			String(frappe?.defaults?.get_default?.("float_precision") ?? ""),
			10,
		);
		if (Number.isInteger(defaultPrecision) && defaultPrecision >= 0) {
			return defaultPrecision;
		}

		return 2;
	};

	// @ts-ignore
	const flt = (val, prec) =>
		format.methods.flt(val, resolveFloatPrecision(prec));
	// @ts-ignore
	const formatFloat = (val, prec) =>
		format.methods.formatFloat(val, resolveFloatPrecision(prec));

	const shouldEnforceStockLimits = (item: any) => {
		if (
			pos_profile.value &&
			!parseBooleanSetting(pos_profile.value.posa_validate_stock)
		) {
			return false;
		}
		if (item.is_stock_item === 0 || item.is_stock_item === false) {
			if (item.is_bundle) {
				const bundleChildren = invoiceStore.packedItems.filter(
					(ch: any) => ch.bundle_id === item.bundle_id,
				);
				return bundleChildren.some((ch: any) => ch.is_stock_item !== 0);
			}
			return false;
		}
		return true;
	};

	const setFormatedQty = (
		item: any,
		field_name: string,
		precision: number | null,
		no_negative: boolean,
		value: any,
	) => {
		const effectivePrecision = resolveFloatPrecision(precision);

		// @ts-ignore
		let parsedValue: any = format.methods.setFormatedFloat(
			item,
			field_name,
			effectivePrecision,
			no_negative,
			value,
		);

		if (
			field_name === "qty" &&
			item?.posa_is_offer &&
			item?._offer_constraints &&
			Number.isFinite(Number(item._offer_constraints.max_qty))
		) {
			const maxOfferQty = Math.max(
				0,
				Number(item._offer_constraints.max_qty || 0),
			);
			if (maxOfferQty > 0 && Math.abs(Number(parsedValue || 0)) > maxOfferQty) {
				const limitedQty = parsedValue < 0 ? -maxOfferQty : maxOfferQty;
				item[field_name] = limitedQty;
				parsedValue = limitedQty;
				toastStore.show({
					title: __(
						"Maximum offer quantity is {0}. Quantity adjusted to allowed limit.",
						[formatFloat(maxOfferQty, effectivePrecision)],
					),
					color: "error",
				});
			}
		}

		const enforceStockLimits = shouldEnforceStockLimits(item);
		const allowNegativeStock =
			(parseBooleanSetting(stock_settings.value?.allow_negative_stock) ||
				parseBooleanSetting(item?.allow_negative_stock)) &&
			!blockSaleBeyondAvailableQty.value;

		if (
			enforceStockLimits &&
			item.max_qty !== undefined &&
			flt(item[field_name], effectivePrecision) >
				flt(item.max_qty, effectivePrecision)
		) {
			const blockSale =
				blockSaleBeyondAvailableQty.value || !allowNegativeStock;
			if (blockSale) {
				item[field_name] = item.max_qty;
				parsedValue = item.max_qty;
				toastStore.show({
					title: __(
						"Maximum available quantity is {0}. Quantity adjusted to match stock.",
						[formatFloat(item.max_qty, effectivePrecision)],
					),
					color: "error",
				});
			} else {
				toastStore.show({
					title: __(
						"Stock is lower than requested. Proceeding may create negative stock.",
					),
					color: "warning",
				});
			}
		}

		if (isReturnInvoice.value && parsedValue > 0) {
			parsedValue = -Math.abs(parsedValue);
			item[field_name] = parsedValue;
		}

		if (typeof calc_stock_qty === "function")
			calc_stock_qty(item, item[field_name]);
		if (field_name === "qty") updateBundleChildrenQty(item);

		if (field_name === "qty") {
			bus.emit("apply_pricing_rules");
		}

		return parsedValue;
	};

	const updateBundleChildrenQty = (item: any) => {
		if (!item || !item.is_bundle) return;
		const multiplier = item.qty || 0;
		invoiceStore.packedItems
			.filter((it: any) => it.bundle_id === item.bundle_id)
			.forEach((ch: any) => {
				ch.qty = multiplier * (ch.child_qty_per_bundle || 1);
				calc_stock_qty(ch, ch.qty);
			});
	};

	const add_one = (item: any) => {
		const delta = item.qty < 0 ? -1 : 1;
		const proposed = (item.qty || 0) + delta;

		if (proposed === 0) {
			removeItem(item, {
				invoiceStore,
				items: invoiceStore.items,
				pos_profile: pos_profile.value,
			});
			return;
		}
		setFormatedQty(item, "qty", null, false, proposed);
	};

	const subtract_one = (item: any) => {
		const delta = item.qty < 0 ? 1 : -1;
		const proposed = (item.qty || 0) + delta;

		if (proposed === 0) {
			removeItem(item, {
				invoiceStore,
				items: invoiceStore.items,
				pos_profile: pos_profile.value,
			});
			return;
		}
		setFormatedQty(item, "qty", null, false, proposed);
	};

	const handleItemDrop = (item: any) => {
		addItem(item, {
			invoiceStore,
			items: invoiceStore.items,
			pos_profile: pos_profile.value,
			isReturnInvoice: isReturnInvoice.value,
		});
	};

	const handleItemReorder = (reorderData: {
		fromIndex: number;
		toIndex: number;
	}) => {
		const { fromIndex, toIndex } = reorderData;
		if (fromIndex === toIndex) return;
		const newItems = [...invoiceStore.items];
		const [movedItem] = newItems.splice(fromIndex, 1);
		if (movedItem) {
			newItems.splice(toIndex, 0, movedItem);
		}
		newItems.forEach((it, idx) => (it.idx = idx + 1));
		invoiceStore.setItems(newItems);
		toastStore.show({ title: __("Item order updated"), color: "success" });
	};

	// --- Delivery Charges ---
	const delivery_charges = ref<any[]>([]);
	const selected_delivery_charge = ref<any>(null);
	const base_delivery_charges_rate = ref(0);
	const delivery_charges_rate = ref(0);

	const fetch_delivery_charges = async (customer: string) => {
		if (!pos_profile.value) return;
		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.offers.get_applicable_delivery_charges",
				args: {
					company: pos_profile.value.company,
					pos_profile: pos_profile.value.name,
					customer: customer,
				},
			});
			if (r.message) {
				delivery_charges.value = r.message;
				saveDeliveryChargesCache(
					pos_profile.value.name,
					customer,
					r.message,
				);
			}
		} catch (error) {
			console.error("Failed to fetch delivery charges", error);
			const cachedCharges = getCachedDeliveryCharges(
				pos_profile.value.name,
				customer,
			);
			delivery_charges.value = Array.isArray(cachedCharges)
				? cachedCharges
				: [];
		}
	};

	const update_delivery_charges = (
		conversionRate: number,
		precision: number,
	) => {
		if (selected_delivery_charge.value) {
			base_delivery_charges_rate.value =
				selected_delivery_charge.value.rate;
		} else {
			base_delivery_charges_rate.value = 0;
		}

		if (base_delivery_charges_rate.value) {
			delivery_charges_rate.value = flt(
				base_delivery_charges_rate.value / (conversionRate || 1),
				precision,
			);
		} else {
			delivery_charges_rate.value = 0;
		}
	};

	// Keep delivery charge state mirrored in the central invoice store.
	// Customer display publisher reads from invoiceStore.* values.
	watch(
		delivery_charges,
		(next) => {
			invoiceStore.setDeliveryCharges(next);
		},
		{ deep: true, immediate: true },
	);

	watch(
		selected_delivery_charge,
		(next) => {
			invoiceStore.setSelectedDeliveryCharge(next?.name || "");
		},
		{ immediate: true },
	);

	watch(
		delivery_charges_rate,
		(next) => {
			invoiceStore.setDeliveryChargesRate(next);
		},
		{ immediate: true },
	);

	return {
		items_headers,
		selected_columns,
		available_columns,
		loadColumnPreferences,
		saveColumnPreferences,
		setFormatedQty,
		add_one,
		subtract_one,
		handleItemDrop,
		handleItemReorder,
		delivery_charges,
		selected_delivery_charge,
		base_delivery_charges_rate,
		delivery_charges_rate,
		fetch_delivery_charges,
		update_delivery_charges,
		isReturnInvoice,
		blockSaleBeyondAvailableQty,
		shouldEnforceStockLimits,
		updateBundleChildrenQty,
	};
}
