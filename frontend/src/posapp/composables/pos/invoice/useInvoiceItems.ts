import { ref, computed } from "vue";
import type { Ref } from "vue";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useStockUtils } from "../shared/useStockUtils";
import { useItemAddition } from "../items/useItemAddition";
import { parseBooleanSetting } from "../../../utils/stock";
import format from "../../../format";
import { bus } from "../../../bus";

// @ts-ignore
const __ = window.__ || ((s) => s);

/**
 * useInvoiceItems Composable
 * Manages invoice items, validation, quantities, and table headers.
 */
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
			key: "discount_value",
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
				selected_columns.value = JSON.parse(saved);
			} else if (pos_profile.value) {
				// Default selection based on POS Profile
				selected_columns.value = available_columns.value
					.filter((col) => {
						if (col.required) return true;
						if (col.key === "price_list_rate") return true;
						if (
							col.key === "discount_value" &&
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

	// @ts-ignore
	const flt = (val, prec) => format.methods.flt(val, prec);
	// @ts-ignore
	const formatFloat = (val, prec) =>
		format.methods.formatFloat(
			val,
			prec || pos_profile.value?.posa_decimal_precision || 2,
		);

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
		// @ts-ignore
		let parsedValue: any = format.methods.setFormatedFloat(
			item,
			field_name,
			precision ?? undefined,
			no_negative,
			value,
		);

		const enforceStockLimits = shouldEnforceStockLimits(item);
		const allowNegativeStock =
			(parseBooleanSetting(stock_settings.value?.allow_negative_stock) ||
				parseBooleanSetting(item?.allow_negative_stock)) &&
			!blockSaleBeyondAvailableQty.value;

		if (
			enforceStockLimits &&
			item.max_qty !== undefined &&
			flt(item[field_name], precision) > flt(item.max_qty, precision)
		) {
			const blockSale =
				blockSaleBeyondAvailableQty.value || !allowNegativeStock;
			if (blockSale) {
				item[field_name] = item.max_qty;
				parsedValue = item.max_qty;
				toastStore.show({
					title: __(
						"Maximum available quantity is {0}. Quantity adjusted to match stock.",
						[formatFloat(item.max_qty, precision)],
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
		const proposed = (item.qty || 0) + (isReturnInvoice.value ? -1 : 1);
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
		const proposed = (item.qty || 0) + (isReturnInvoice.value ? 1 : -1);
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
				method: "posawesome.posawesome.api.pos_settings.get_delivery_charges",
				args: {
					filters: {
						pos_profile: pos_profile.value.name,
						customer: customer,
					},
				},
			});
			if (r.message) {
				delivery_charges.value = r.message;
			}
		} catch (error) {
			console.error("Failed to fetch delivery charges", error);
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
