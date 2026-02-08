import { ref, computed, type Ref } from "vue";
import { useItemsStore } from "../../../stores/itemsStore";
import { formatUtils } from "../../../format";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface PurchaseItem {
	line_id: string;
	item_code: string;
	item_name: string;
	stock_uom: string;
	item_group: string;
	item_uoms: any[];
	uom: string;
	conversion_factor: number;
	qty: number;
	rate: number;
	stock_uom_rate: number;
	standard_rate: number;
	received_qty: number;
	receivedQtyManual: boolean;
	_isEditingQty?: boolean;
	_editingQtyValue?: string;
	_isEditingRate?: boolean;
	_editingRateValue?: string;
	_isEditingUom?: boolean;
}

export function usePurchaseOrder(options: {
	posProfile: Ref<any>;
	receiveNow: Ref<boolean>;
	formatFloat: (_val: any, _prec?: number) => number;
}) {
	const { posProfile, receiveNow } = options;
	const itemsStore = useItemsStore();

	const purchaseItems = ref<PurchaseItem[]>([]);
	const supplier = ref<string | null>(null);
	const warehouse = ref<string | null>(null);
	const transactionDate = ref<string | null>(null);
	const scheduleDate = ref<string | null>(null);
	const createInvoice = ref(false);
	const supplierCurrency = ref<string | null>(null);
	const submitLoading = ref(false);
	const errorMessage = ref("");

	const totalAmount = computed(() => {
		return purchaseItems.value.reduce(
			(sum, item) => sum + item.qty * item.rate,
			0,
		);
	});

	const generateLineId = () => {
		return `po_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
	};

	const onAddItem = async (item: any) => {
		if (!item) return;

		// Fetch item details to get item_uoms if missing
		if (!item.item_uoms || !item.item_uoms.length) {
			try {
				const details = await itemsStore.getItemByCode(item.item_code);
				if (details) {
					if (details.item_uoms) item.item_uoms = details.item_uoms;
					if (details.purchase_uom)
						item.purchase_uom = details.purchase_uom;
				}
			} catch (e) {
				console.warn("Failed to fetch item details for UOMs", e);
			}
		}

		const existingItem = purchaseItems.value.find(
			(p) => p.item_code === item.item_code,
		);

		if (existingItem) {
			existingItem.qty += 1;
			if (receiveNow.value && !existingItem.receivedQtyManual) {
				existingItem.received_qty = existingItem.qty;
			}
		} else {
			let rate = item.rate || item.standard_rate || 0;
			let uom = item.purchase_uom || item.stock_uom;
			let conversion_factor = 1;

			if (uom !== item.stock_uom && item.item_uoms) {
				const uomData = item.item_uoms.find((u: any) => u.uom === uom);
				if (uomData) {
					conversion_factor = uomData.conversion_factor;
				}
			}

			const newItem: PurchaseItem = {
				line_id: generateLineId(),
				item_code: item.item_code,
				item_name: item.item_name,
				stock_uom: item.stock_uom,
				item_group: item.item_group,
				item_uoms: item.item_uoms || [
					{ uom: item.stock_uom, conversion_factor: 1 },
				],
				uom: uom,
				conversion_factor: conversion_factor,
				qty: 1,
				rate: rate,
				stock_uom_rate: rate,
				standard_rate: item.standard_rate || 0,
				received_qty: receiveNow.value ? 1 : 0,
				receivedQtyManual: false,
			};

			purchaseItems.value.unshift(newItem);

			if (newItem.uom !== newItem.stock_uom) {
				updateItemUom(newItem, newItem.uom);
			}
		}
	};

	const updateItemUom = async (item: PurchaseItem, value: string) => {
		if (!item || !value) return;

		item.uom = value;
		const matched = (item.item_uoms || []).find(
			(uom: any) => uom.uom === value,
		);
		item.conversion_factor = matched ? matched.conversion_factor : 1;

		let priceFound = false;
		try {
			const priceList = itemsStore.activePriceList;
			if (priceList) {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.items.get_price_for_uom",
					args: {
						item_code: item.item_code,
						price_list: priceList,
						uom: value,
					},
				});

				if (message !== undefined && message !== null && message > 0) {
					item.rate = message;
					priceFound = true;
				}
			}
		} catch (e) {
			console.error("Failed to update rate for UOM", e);
		}

		if (!priceFound) {
			const baseRate = item.stock_uom_rate || item.standard_rate || 0;
			item.rate = baseRate * item.conversion_factor;
		}
	};

	const updateItemQty = (item: PurchaseItem, value: any) => {
		const val = parseFloat(value);
		item.qty = isNaN(val) ? 0 : val;
		if (receiveNow.value && !item.receivedQtyManual) {
			item.received_qty = item.qty;
		}
	};

	const updateItemRate = (item: PurchaseItem, value: any) => {
		const val = parseFloat(value);
		item.rate = isNaN(val) ? 0 : val;
	};

	const updateItemReceivedQty = (item: PurchaseItem, value: any) => {
		const val = parseFloat(value);
		item.received_qty = isNaN(val) ? 0 : val;
		item.receivedQtyManual = true;
	};

	const removeItem = (item: PurchaseItem) => {
		purchaseItems.value = purchaseItems.value.filter(
			(row) => row.line_id !== item.line_id,
		);
	};

	const resetForm = () => {
		supplier.value = null;
		purchaseItems.value = [];
		errorMessage.value = "";
		submitLoading.value = false;
		warehouse.value = posProfile.value?.warehouse || null;
		transactionDate.value = formatUtils.toArabicNumerals(
			frappe.datetime.nowdate(),
		);
		scheduleDate.value = formatUtils.toArabicNumerals(
			frappe.datetime.nowdate(),
		);
		receiveNow.value = false;
		createInvoice.value = false;
	};

	return {
		purchaseItems,
		supplier,
		warehouse,
		transactionDate,
		scheduleDate,
		createInvoice,
		supplierCurrency,
		totalAmount,
		submitLoading,
		errorMessage,
		onAddItem,
		updateItemUom,
		updateItemQty,
		updateItemRate,
		updateItemReceivedQty,
		removeItem,
		resetForm,
		generateLineId,
	};
}
