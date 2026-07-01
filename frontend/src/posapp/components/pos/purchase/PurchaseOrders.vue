<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<!-- Left Column: Item Selector -->
			<v-col cols="12" md="5" class="h-100 pa-0 border-e">
				<ItemsSelector context="purchase" @add-item="onAddItem" />
			</v-col>

			<!-- Right Column: Purchase Order Form (Cart) -->
			<v-col cols="12" md="7" class="h-100 pa-0">
				<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
					<v-card-title class="py-2 px-4 bg-primary text-white d-flex align-center flex-wrap ga-2">
						<span class="text-h6">{{ __("Create Purchase Order") }}</span>
						<v-chip
							v-if="purchaseOrderName"
							size="small"
							color="white"
							variant="tonal"
							prepend-icon="mdi-file-document-edit-outline"
						>
							{{ purchaseOrderName }}
						</v-chip>
						<v-spacer></v-spacer>
						<v-btn
							icon="mdi-delete"
							variant="text"
							color="white"
							@click="resetForm"
							:title="__('Clear All')"
							:aria-label="__('Clear all purchase order items')"
						></v-btn>
					</v-card-title>

					<v-card-text class="flex-grow-1 overflow-y-auto pa-4">
						<!-- Header Section -->
						<PurchaseHeader
							v-model:supplier="supplier"
							v-model:warehouse="warehouse"
							v-model:transactionDate="transactionDate"
							v-model:scheduleDate="scheduleDate"
							v-model:receiveNow="receiveNow"
							v-model:createInvoice="createInvoice"
							:supplierOptions="supplierOptions"
							:supplierLoading="supplierLoading"
							:warehouseOptions="warehouseOptions"
							:warehouseLoading="warehouseLoading"
							:allowCreateSupplier="allowCreateSupplier"
							:posProfile="pos_profile"
							@search-supplier="handleSupplierSearch"
							@create-supplier="supplierDialog = true"
						/>

						<v-divider class="mb-4"></v-divider>

						<!-- Items Table Section -->
						<PurchaseItemsTable
							:headers="itemHeaders"
							:items="purchaseItems"
							:currencySymbol="currencySymbol(priceListCurrency || supplierCurrency)"
							:receiveNow="receiveNow"
							:formatCurrency="formatCurrency"
							:formatNumber="formatNumber"
							@update-uom="({ item, value }) => updateItemUom(item, value)"
							@update-qty="({ item, value }) => updateItemQty(item, value)"
							@update-rate="({ item, value }) => updateItemRate(item, value)"
							@update-received-qty="({ item, value }) => updateItemReceivedQty(item, value)"
							@remove-item="removeItem"
						/>

						<v-alert v-if="errorMessage" type="error" density="compact" class="mt-4">
							{{ errorMessage }}
						</v-alert>
					</v-card-text>

					<v-card-actions class="purchase-action-bar">
						<div class="purchase-action-bar__totals">
							<span class="purchase-action-bar__label">{{ __("Total") }}</span>
							<strong>
								{{ currencySymbol(priceListCurrency || supplierCurrency) }}
								{{ formatCurrency(totalAmount) }}
							</strong>
							<span class="purchase-action-bar__meta">
								{{ purchaseItems.length }} {{ __("items") }} &middot; {{ formatNumber(totalQty) }} {{ __("qty") }}
							</span>
						</div>
						<div class="purchase-action-bar__buttons">
							<v-btn
								color="info"
								variant="tonal"
								prepend-icon="mdi-folder-open-outline"
								@click="draftDialog = true"
								:disabled="submitLoading || draftSaveLoading"
							>
								{{ __("Drafts") }}
							</v-btn>
							<v-btn
								color="warning"
								variant="tonal"
								prepend-icon="mdi-content-save-outline"
								@click="saveDraft"
								:loading="draftSaveLoading"
								:disabled="submitLoading || draftSaveLoading || !purchaseItems.length"
							>
								{{ __("Save and Clear") }}
							</v-btn>
							<v-btn
								color="success"
								theme="dark"
								prepend-icon="mdi-cash-register"
								:loading="submitLoading"
								:disabled="submitLoading || !purchaseItems.length"
								@click="openPaymentDialog"
							>
								{{ __("Pay") }}
							</v-btn>
						</div>
					</v-card-actions>
				</v-card>
			</v-col>
		</v-row>

		<!-- Payment Dialog -->
		<PurchasePaymentDialog
			v-model="paymentDialog"
			:total-amount="totalAmount"
			:currency="supplierCurrency"
			:pos-profile="pos_profile"
			:create-invoice="createInvoice"
			@submit="handlePaymentSubmit"
		/>

		<PurchaseDraftDialog
			v-model="draftDialog"
			:pos-profile="pos_profile"
			:warehouse-options="warehouseOptions"
			@select="handleDraftSelected"
		/>

		<!-- Supplier Dialog -->
		<SupplierDialog
			v-model="supplierDialog"
			:groups="supplierGroups"
			:posProfile="pos_profile"
			@created="handleSupplierCreated"
			@error="(msg) => toastStore.show({ title: msg, color: 'error' })"
		/>
	</div>
</template>

<script>
import format, { normalizeDateForBackend } from "../../../format";
import { useUIStore } from "../../../stores/uiStore.js";
import { getOpeningStorage } from "../../../../offline/index";
import { useItemsStore } from "../../../stores/itemsStore";
import { useToastStore } from "../../../stores/toastStore";
import { usePurchaseOrder } from "../../../composables/pos/payments/usePurchaseOrder";
import ItemsSelector from "../items/ItemsSelector.vue";
import PurchasePaymentDialog from "./PurchasePaymentDialog.vue";
import PurchaseDraftDialog from "./PurchaseDraftDialog.vue";
import SupplierDialog from "../dialogs/purchase/SupplierDialog.vue";
import PurchaseHeader from "./PurchaseHeader.vue";
import PurchaseItemsTable from "./PurchaseItemsTable.vue";
import { computed, ref, watch, onMounted, onBeforeUnmount, inject } from "vue";

export default {
	mixins: [format],
	components: {
		ItemsSelector,
		PurchasePaymentDialog,
		PurchaseDraftDialog,
		SupplierDialog,
		PurchaseHeader,
		PurchaseItemsTable,
	},
	setup() {
		const uiStore = useUIStore();
		const toastStore = useToastStore();
		const itemsStore = useItemsStore();
		const eventBus = inject("eventBus");

		const pos_profile = ref({});
		const receiveNow = ref(false);

		const {
			purchaseItems,
			purchaseOrderName,
			supplier,
			warehouse,
			transactionDate,
			scheduleDate,
			createInvoice,
			supplierCurrency,
			supplierPriceList,
			priceListCurrency,
			totalAmount,
			submitLoading,
			errorMessage,
			onAddItem,
			fetchSupplierInfo,
			updateItemUom,
			updateItemQty,
			updateItemRate,
			updateItemReceivedQty,
			removeItem,
			resetForm,
			generateLineId,
		} = usePurchaseOrder({
			posProfile: pos_profile,
			receiveNow: receiveNow,
			formatFloat: (val, prec) => format.methods.formatFloat.call({ currency_precision: 2 }, val, prec),
		});

		const supplierOptions = ref([]);
		const supplierLoading = ref(false);
		const supplierDialog = ref(false);
		const draftDialog = ref(false);
		const draftSaveLoading = ref(false);
		const paymentDialog = ref(false);
		const supplierGroups = ref([]);
		const warehouseOptions = ref([]);
		const warehouseLoading = ref(false);
		const payments = ref([]);
		const totalQty = computed(() =>
			purchaseItems.value.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
		);

		const supplierSearchTimeout = ref(null);

		const handleSupplierSearch = (term) => {
			if (supplierSearchTimeout.value) clearTimeout(supplierSearchTimeout.value);
			supplierSearchTimeout.value = setTimeout(() => searchSuppliers(term), 300);
		};

		const searchSuppliers = async (searchText = "") => {
			supplierLoading.value = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.search_suppliers",
					args: { search_text: searchText, limit: 20 },
				});
				supplierOptions.value = Array.isArray(message) ? message : [];
				if (supplier.value) {
					const s = supplierOptions.value.find((s) => s.name === supplier.value);
					supplierCurrency.value = s?.default_currency || pos_profile.value.currency;
				}
			} catch (error) {
				console.error("Failed to fetch suppliers:", error);
			} finally {
				supplierLoading.value = false;
			}
		};

		const loadSupplierGroups = async () => {
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Supplier Group",
						fields: ["name"],
						filters: { is_group: 0 },
						limit_page_length: 500,
					},
				});
				supplierGroups.value = (message || []).map((row) => row.name);
			} catch (error) {
				console.error("Failed to load groups:", error);
			}
		};

		const loadWarehouses = async () => {
			warehouseLoading.value = true;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Warehouse",
						fields: ["name", "warehouse_name"],
						filters: { company: pos_profile.value.company, is_group: 0, disabled: 0 },
					},
				});
				warehouseOptions.value = message || [];
			} catch (error) {
				console.error("Failed to load warehouses:", error);
			} finally {
				warehouseLoading.value = false;
			}
		};

		const handleSupplierCreated = (message) => {
			supplierOptions.value.unshift(message);
			supplier.value = message.name;
			supplierDialog.value = false;
		};

		const openPaymentDialog = () => {
			if (!validatePurchaseOrderForm()) {
				return;
			}
			errorMessage.value = "";
			paymentDialog.value = true;
		};

		const validatePurchaseOrderForm = () => {
			if (!supplier.value) {
				errorMessage.value = __("Supplier is required.");
				return false;
			}
			if (!purchaseItems.value.length) {
				errorMessage.value = __("Please add at least one item.");
				return false;
			}
			if (!transactionDate.value || !scheduleDate.value) {
				errorMessage.value = __("Supplier and dates are required.");
				return false;
			}
			errorMessage.value = "";
			return true;
		};

		const handlePaymentSubmit = ({ payments: p, print, print_format, print_invoice }) => {
			payments.value = p;
			paymentDialog.value = false;
			submitPurchaseOrder(print, print_format, print_invoice);
		};

		const extractServerError = (error) => {
			const parseServerMessages = (raw) => {
				if (!raw) return "";
				try {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed) && parsed.length) {
						const first = parsed[0];
						if (typeof first === "string") {
							return first.replace(/<[^>]*>/g, "").trim();
						}
					}
				} catch {
					return String(raw);
				}
				return "";
			};

			return (
				parseServerMessages(error?._server_messages) ||
				parseServerMessages(error?.responseJSON?._server_messages) ||
				error?.message ||
				error?.responseJSON?.message ||
				__("Unable to create purchase order")
			);
		};

		const buildPurchaseOrderPayload = ({ submit = true } = {}) => {
			const resolvedSupplier =
				typeof supplier.value === "object" && supplier.value !== null
					? supplier.value.name || supplier.value.supplier_name || ""
					: supplier.value;

			return {
				purchase_order: purchaseOrderName.value,
				supplier: resolvedSupplier,
				company: pos_profile.value.company,
				warehouse: warehouse.value,
				currency: supplierCurrency.value,
				buying_price_list: supplierPriceList.value,
				transaction_date: normalizeDateForBackend(transactionDate.value),
				schedule_date: normalizeDateForBackend(scheduleDate.value),
				submit: submit ? 1 : 0,
				receive: submit && receiveNow.value ? 1 : 0,
				create_invoice: submit && createInvoice.value ? 1 : 0,
				pos_profile: pos_profile.value,
				payments: submit ? payments.value : [],
				items: purchaseItems.value.map((item) => ({
					item_code: item.item_code,
					item_name: item.item_name,
					stock_uom: item.stock_uom,
					uom: item.uom,
					conversion_factor: item.conversion_factor,
					qty: item.qty,
					rate: item.rate,
					received_qty: submit && receiveNow.value ? item.received_qty : undefined,
					warehouse: warehouse.value || item.warehouse,
				})),
			};
		};

		const saveDraft = async () => {
			if (!validatePurchaseOrderForm()) {
				return;
			}

			draftSaveLoading.value = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_purchase_order",
					args: { data: buildPurchaseOrderPayload({ submit: false }) },
				});
				if (message?.purchase_order) {
					const savedName = message.purchase_order;
					resetForm();
					toastStore.show({
						title: __("Purchase Order {0} saved and cleared", [savedName]),
						color: "success",
					});
				}
			} catch (error) {
				errorMessage.value = extractServerError(error);
				toastStore.show({ title: errorMessage.value, color: "error" });
			} finally {
				draftSaveLoading.value = false;
			}
		};

		const formatDateForPicker = (value) => {
			const normalized = normalizeDateForBackend(value);
			if (!normalized) return null;
			const [year, month, day] = normalized.split("-");
			return `${day}-${month}-${year}`;
		};

		const handleDraftSelected = async (draft) => {
			if (!draft) return;

			purchaseOrderName.value = draft.name || null;
			supplier.value = draft.supplier || null;
			warehouse.value =
				draft.set_warehouse ||
				(draft.items || []).find((item) => item.warehouse)?.warehouse ||
				pos_profile.value?.warehouse ||
				null;
			transactionDate.value = formatDateForPicker(draft.transaction_date);
			scheduleDate.value = formatDateForPicker(draft.schedule_date || draft.transaction_date);
			supplierCurrency.value = draft.currency || pos_profile.value?.currency || null;
			supplierPriceList.value = draft.buying_price_list || supplierPriceList.value;
			priceListCurrency.value = draft.currency || priceListCurrency.value;
			receiveNow.value = false;
			createInvoice.value = false;
			payments.value = [];
			errorMessage.value = "";

			purchaseItems.value = (draft.items || []).map((item) => {
				const conversionFactor = Number(item.conversion_factor || 1) || 1;
				const rate = Number(item.rate || 0);
				return {
					line_id: generateLineId(),
					item_code: item.item_code,
					item_name: item.item_name || item.item_code,
					stock_uom: item.stock_uom,
					item_group: item.item_group,
					item_uoms: item.item_uoms?.length
						? item.item_uoms
						: [{ uom: item.uom || item.stock_uom, conversion_factor: conversionFactor }],
					uom: item.uom || item.stock_uom,
					conversion_factor: conversionFactor,
					qty: Number(item.qty || 0),
					rate,
					stock_uom_rate: conversionFactor ? rate / conversionFactor : rate,
					standard_rate: Number(item.standard_rate || 0),
					received_qty: 0,
					receivedQtyManual: false,
					warehouse: item.warehouse,
				};
			});

			if (draft.supplier) {
				const info = await fetchSupplierInfo(draft.supplier);
				if (info?.buying_price_list) {
					await itemsStore.updatePriceList(info.buying_price_list);
				}
			}

			toastStore.show({ title: __("Purchase Order draft loaded"), color: "success" });
		};

		const submitPurchaseOrder = async (print = false, printFormat = null, printInvoice = false) => {
			if (!validatePurchaseOrderForm()) {
				return;
			}
			submitLoading.value = true;
			try {
				const payload = buildPurchaseOrderPayload({ submit: true });
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_purchase_order",
					args: { data: payload },
				});
				if (message?.purchase_order) {
					toastStore.show({ title: __("Purchase Order created"), color: "success" });
					if (print) {
						let doctype =
							printInvoice && message.purchase_invoice ? "Purchase Invoice" : "Purchase Order";
						let docname =
							printInvoice && message.purchase_invoice
								? message.purchase_invoice
								: message.purchase_order;
						const formatName =
							printFormat || pos_profile.value.print_format_for_purchase || "Standard";
						const printUrl = frappe.urllib.get_full_url(
							`/printview?doctype=${doctype}&name=${docname}&print_format=${encodeURIComponent(formatName)}`,
						);
						window.open(printUrl, "_blank")?.focus();
					}
					resetForm();
				}
			} catch (error) {
				errorMessage.value = extractServerError(error);
				toastStore.show({ title: errorMessage.value, color: "error" });
			} finally {
				submitLoading.value = false;
			}
		};

		onMounted(async () => {
			const cachedData = getOpeningStorage();
			if (cachedData?.pos_profile) pos_profile.value = cachedData.pos_profile;

			watch(
				() => uiStore.posProfile,
				(p) => {
					if (p) pos_profile.value = p;
				},
				{ immediate: true },
			);
			watch(supplier, async (val) => {
				if (val) {
					const info = await fetchSupplierInfo(val);
					if (info?.buying_price_list) {
						await itemsStore.updatePriceList(info.buying_price_list);
					}
					eventBus?.emit?.("update_buying_price_list", {
						price_list: info?.buying_price_list || null,
						supplier: val,
					});
				} else {
					supplierCurrency.value = pos_profile.value.currency;
					eventBus?.emit?.("update_buying_price_list", null);
				}
			});

			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.get_buying_price_list",
				});
				if (message) await itemsStore.updatePriceList(message);
			} catch (e) {
				console.error("Failed price list load", e);
			}

			resetForm();
			await Promise.all([searchSuppliers(""), loadSupplierGroups(), loadWarehouses()]);
		});

		onBeforeUnmount(() => {
			eventBus?.emit?.("update_buying_price_list", null);
			if (pos_profile.value?.selling_price_list)
				itemsStore.updatePriceList(pos_profile.value.selling_price_list);
		});

		return {
			pos_profile,
			receiveNow,
			purchaseItems,
			purchaseOrderName,
			supplier,
			warehouse,
			transactionDate,
			scheduleDate,
			createInvoice,
			supplierCurrency,
			supplierPriceList,
			priceListCurrency,
			totalAmount,
			totalQty,
			submitLoading,
			draftSaveLoading,
			errorMessage,
			onAddItem,
			fetchSupplierInfo,
			updateItemUom,
			updateItemQty,
			updateItemRate,
			updateItemReceivedQty,
			removeItem,
			resetForm,
			supplierOptions,
			supplierLoading,
			supplierDialog,
			paymentDialog,
			supplierGroups,
			warehouseOptions,
			warehouseLoading,
			draftDialog,
			handleSupplierSearch,
			handleSupplierCreated,
			openPaymentDialog,
			handlePaymentSubmit,
			saveDraft,
			handleDraftSelected,
			toastStore,
		};
	},
	computed: {
		allowCreateSupplier() {
			return !!this.pos_profile?.posa_allow_create_purchase_suppliers;
		},
		itemHeaders() {
			const h = [
				{ title: __("Item"), key: "item_name", align: "start", width: "35%" },
				{ title: __("UOM"), key: "uom", align: "center", width: "15%" },
				{ title: __("Qty"), key: "qty", align: "center", width: "15%" },
				{ title: __("Rate"), key: "rate", align: "center", width: "15%" },
			];
			if (this.receiveNow)
				h.push({ title: __("Received"), key: "received_qty", align: "center", width: "10%" });
			h.push(
				{ title: __("Amount"), key: "amount", align: "end", width: "10%" },
				{ title: "", key: "actions", align: "center", width: "50px" },
			);
			return h;
		},
	},
	methods: {
		formatNumber(v) {
			return this.formatFloat(v, 2);
		},
		currencySymbol(c) {
			return get_currency_symbol(c || this.pos_profile.currency);
		},
	},
};
</script>

<style scoped>
.cursor-pointer {
	cursor: pointer;
}

.purchase-action-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 14px 16px;
	border-top: 1px solid var(--pos-border);
	background: color-mix(in srgb, var(--pos-surface-raised) 94%, rgb(var(--v-theme-primary)) 6%);
}

.purchase-action-bar__totals {
	display: grid;
	gap: 2px;
	min-width: 210px;
}

.purchase-action-bar__label,
.purchase-action-bar__meta {
	font-size: 0.78rem;
	color: var(--pos-text-muted);
}

.purchase-action-bar__totals strong {
	font-size: 1.25rem;
	line-height: 1.2;
	color: var(--pos-text-primary);
}

.purchase-action-bar__buttons {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 10px;
	flex-wrap: wrap;
}

.purchase-action-bar__buttons :deep(.v-btn) {
	min-width: 132px;
}

@media (max-width: 720px) {
	.purchase-action-bar {
		align-items: stretch;
		flex-direction: column;
	}

	.purchase-action-bar__buttons {
		display: grid;
		grid-template-columns: 1fr;
	}

	.purchase-action-bar__buttons :deep(.v-btn) {
		width: 100%;
	}
}
</style>
