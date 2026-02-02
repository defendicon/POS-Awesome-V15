<template>
	<div
		ref="tableContainer"
		class="my-0 py-0 overflow-y-auto items-table-container responsive-table-container pos-themed-card"
		:style="containerStyles"
		:class="containerClasses"
		@dragover="onDragOverFromSelector($event)"
		@drop="onDropFromSelector($event)"
		@dragenter="onDragEnterFromSelector"
		@dragleave="onDragLeaveFromSelector"
	>
		<v-data-table-virtual
			:headers="responsiveHeaders"
			:items="items"
			:expanded="expanded"
			show-expand
			item-value="posa_row_id"
			class="pos-table elevation-2 pos-themed-card"
			:class="tableClasses"
			:items-per-page="virtualScrollConfig.itemsPerPage"
			:item-height="virtualScrollConfig.itemHeight"
			:buffer-size="virtualScrollConfig.bufferSize"
			expand-on-click
			fixed-header
			:density="tableDensity"
			hide-default-footer
			:single-expand="true"
			:header-props="dynamicHeaderProps"
			:no-data-text="__('No items in cart')"
			@update:expanded="handleExpandedUpdate"
			:search="itemSearch"
			:custom-filter="customItemFilter"
		>
			<template v-slot:item="{ item, toggleExpand, internalItem }">
				<CartItemRow
					:item="item"
					:posProfile="pos_profile"
					:isReturnInvoice="isReturnInvoice"
					:invoiceType="invoiceType"
					:displayCurrency="displayCurrency"
					:formatFloat="memoizedFormatFloat"
					:formatCurrency="memoizedFormatCurrency"
					:currencySymbol="currencySymbol"
					:isNumber="isNumber"
					:isNegative="memoizedIsNegative"
					:hideQtyDecimals="hide_qty_decimals"
					:isRTL="isRTL"
					:showUom="isColumnVisible('uom')"
					:showPriceListRate="isColumnVisible('price_list_rate')"
					:showDiscountPercent="isColumnVisible('discount_value')"
					:showDiscountAmount="isColumnVisible('discount_amount')"
					:showOffer="isColumnVisible('posa_is_offer')"
					@update-qty="handleQtyUpdate"
					@minus-click="handleMinusClick"
					@add-one="addOne"
					@calc-uom="calcUom"
					@update-rate="handleRateUpdate"
					@update-discount-percent="handleDiscountPercentUpdate"
					@update-discount-amount="handleDiscountAmountUpdate"
					@open-name-dialog="openNameDialog"
					@reset-item-name="resetItemName"
					@toggle-offer="toggleOffer"
					@remove-item="removeItem"
					@click="handleRowClick($event, item, toggleExpand, internalItem)"
				/>
			</template>

			<!-- Expanded row -->
			<template v-slot:expanded-row="{ item }">
				<ItemsTableExpandedRow
					:item="item"
					:is-expanded="isItemExpanded(item.posa_row_id)"
					:colspan="responsiveHeaders.length + 1"
					:pos_profile="pos_profile"
					:invoice-type="invoiceType"
					:is-return-invoice="isReturnInvoice"
					:invoice_doc="invoice_doc"
					:hide_qty_decimals="hide_qty_decimals"
					:expanded-content-classes="expandedContentClasses"
					:format-float="memoizedFormatFloat"
					:format-currency="memoizedFormatCurrency"
					:currency-symbol="currencySymbol"
					:is-number="isNumber"
					:set-formated-currency="setFormatedCurrency"
					:calc-prices="calcPrices"
					:calc-uom="calcUom"
					:change-price-list-rate="changePriceListRate"
					:get-serial-options="getSerialOptions"
					:set-serial-no="setSerialNo"
					:set-batch-qty="setBatchQty"
					:validate-due-date="validateDueDate"
					@qty-change="handleQtyChange"
				/>
			</template>
		</v-data-table-virtual>

		<!-- Edit name dialog -->
		<v-dialog v-model="editNameDialog" max-width="400">
			<v-card>
				<v-card-title>{{ __("Item Name") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="editedName" :maxlength="140" />
				</v-card-text>
				<v-card-actions>
					<v-btn
						v-if="editNameTarget && editNameTarget.name_overridden"
						variant="text"
						@click="resetItemName(editNameTarget)"
						>{{ __("Reset") }}</v-btn
					>
					<v-spacer></v-spacer>
					<v-btn variant="text" @click="editNameDialog = false">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="text" @click="saveItemName">{{ __("Save") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script>
/* global process */
import _ from "lodash";
import { logComponentRender } from "../../utils/perf.js";
import { getCurrentInstance, ref, computed, onBeforeUnmount } from "vue";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { parseBooleanSetting } from "../../utils/stock.js";
import { loadItemSelectorSettings } from "../../utils/itemSelectorSettings.js";
import CartItemRow from "./CartItemRow.vue";
import ItemsTableExpandedRow from "./ItemsTableExpandedRow.vue";

import { useItemsTableSearch } from "../../composables/useItemsTableSearch";
import { useItemsTableDragDrop } from "../../composables/useItemsTableDragDrop";
import { useItemsTableResponsive } from "../../composables/useItemsTableResponsive";
import { useItemsTableMerge } from "../../composables/useItemsTableMerge";
import { useItemsTableNameEdit } from "../../composables/useItemsTableNameEdit";
import "./items-table-styles.css";

export default {
	name: "ItemsTable",
	components: {
		CartItemRow,
		ItemsTableExpandedRow,
	},
	setup(props, { emit }) {
		const { proxy } = getCurrentInstance();
		const tableContainer = ref(null);
		const eventBus = proxy?.eventBus;
		const invoiceStore = useInvoiceStore();
		
		const { customItemFilter: searchFilter } = useItemsTableSearch();
		const dragDropHandlers = useItemsTableDragDrop(emit, eventBus);
		
		const items = computed(() => invoiceStore.items);
		const headers = computed(() => props.headers || []);
		
		const responsive = useItemsTableResponsive(
			tableContainer,
			headers
		);
		
		const merge = useItemsTableMerge(items);
		const nameEdit = useItemsTableNameEdit();

		// Cleanup merge cache on unmount
		onBeforeUnmount(() => {
			merge.clearMergeCache();
		});

		return { 
			invoiceStore, 
			eventBus, 
			searchFilter, 
			dragDropHandlers,
			tableContainer,
			items,
			...responsive,
			...merge,
			...nameEdit
		};
	},
	props: {
		headers: Array,
		expanded: Array,
		itemsPerPage: Number,
		itemSearch: String,
		pos_profile: Object,
		invoiceType: String,
		stock_settings: Object,
		displayCurrency: String,
		formatFloat: Function,
		formatCurrency: Function,
		currencySymbol: Function,
		isNumber: Function,
		setFormatedQty: Function,
		setFormatedCurrency: Function,
		calcPrices: Function,
		calcUom: Function,
		setSerialNo: Function,
		setBatchQty: Function,
		validateDueDate: Function,
		removeItem: Function,
		subtractOne: Function,
		addOne: Function,
		isReturnInvoice: Boolean,
		toggleOffer: Function,
		changePriceListRate: Function,
		isNegative: Function,
	},
	data() {
		return {
			draggedItem: null,
			draggedIndex: null,
			dragOverIndex: null,
			isDragging: false,
			pendingAdd: null,
			// Performance optimization caches
			expandedCache: new Map(),
			lastUpdateTime: 0,
		};
	},
	created() {
		// Non-reactive cache for performance
		this.formatCache = new Map();
		this.qtyLengthCache = new Map();
		// PERF: cache search normalization once per query to avoid repeating string ops for every row render
		this._searchCache = { raw: null, normalized: "", terms: [] };
	},
	watch: {
		displayCurrency() {
			if (this.formatCache) this.formatCache.clear();
		},
		pos_profile: {
			handler() {
				if (this.formatCache) this.formatCache.clear();
			},
			deep: true,
		},
	},
	computed: {
		memoizedFormatFloat() {
			return (value, precision) => {
				if (value === null || value === undefined) return "";
				const key = `f_${value}_${precision ?? "def"}`;
				if (this.formatCache.has(key)) return this.formatCache.get(key);
				const result = this.formatFloat(value, precision);
				this.formatCache.set(key, result);
				if (this.formatCache.size > 5000) this.formatCache.clear();
				return result;
			};
		},
		memoizedFormatCurrency() {
			return (value, precision) => {
				if (value === null || value === undefined) return "";
				const key = `c_${value}_${precision ?? "def"}`;
				if (this.formatCache.has(key)) return this.formatCache.get(key);
				const result = this.formatCurrency(value, precision);
				this.formatCache.set(key, result);
				if (this.formatCache.size > 5000) this.formatCache.clear();
				return result;
			};
		},
		memoizedIsNegative() {
			return (value) => {
				if (typeof value === "number") return value < 0;
				return this.isNegative(value);
			};
		},
		invoice_doc() {
			return this.invoiceStore.invoiceDoc || {};
		},
		blockSaleBeyondAvailableQty() {
			if (["Order", "Quotation"].includes(this.invoiceType)) return false;
			return parseBooleanSetting(this.pos_profile?.posa_block_sale_beyond_available_qty);
		},

		// Enhanced header props with responsive behavior
		dynamicHeaderProps() {
			return {
				class: `responsive-header container-${this.breakpoint}`,
			};
		},

		// Virtual scrolling configuration for optimal performance
		virtualScrollConfig() {
			const itemCount = this.items?.length || 0;
			const containerHeight = this.containerHeight;

			// Dynamic configuration based on dataset size and container
			return {
				itemHeight:
					this.tableDensity === "compact" ? 48 : this.tableDensity === "comfortable" ? 72 : 60,
				itemsPerPage: Math.max(20, Math.ceil(containerHeight / 60) + 5),
				bufferSize: itemCount > 1000 ? 20 : itemCount > 500 ? 15 : 10,
			};
		},

		// Memoized quantity display length calculation with cache management
		memoizedQtyLength() {
			return (qty) => {
				if (this.qtyLengthCache.has(qty)) return this.qtyLengthCache.get(qty);
				const length = String(Math.abs(qty || 0)).replace(".", "").length;
				this.qtyLengthCache.set(qty, length);

				// Limit cache size to prevent memory leaks
				if (this.qtyLengthCache.size > 1000) {
					const firstKey = this.qtyLengthCache.keys().next().value;
					this.qtyLengthCache.delete(firstKey);
				}

				return length;
			};
		},

		// Lazy loading helper for expanded content with cache
		isItemExpanded() {
			return (itemId) => {
				const cacheKey = `${itemId}_${this.expanded.length}`;

				if (this.expandedCache.has(cacheKey)) {
					return this.expandedCache.get(cacheKey);
				}

				const isExpanded = this.expanded.includes(itemId);
				this.expandedCache.set(cacheKey, isExpanded);

				// Clear cache periodically to prevent memory bloat
				if (this.expandedCache.size > 100) {
					this.expandedCache.clear();
				}

				return isExpanded;
			};
		},
		hide_qty_decimals() {
			const opts = loadItemSelectorSettings();
			return !!opts?.hide_qty_decimals;
		},
		isRTL() {
			if (this._rtlComputed !== undefined) {
				return this._rtlComputed;
			}

			const htmlDir = document.documentElement.getAttribute("dir");
			const bodyDir = document.body.getAttribute("dir");
			const computedDir = window.getComputedStyle(document.documentElement).direction;
			const lang = document.documentElement.getAttribute("lang") || navigator.language;
			const rtlLanguages = ["ar", "he", "fa", "ur", "yi"];
			const isRTLLanguage = rtlLanguages.some((rtlLang) => lang.startsWith(rtlLang));

			this._rtlComputed =
				htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl" || isRTLLanguage;

			return this._rtlComputed;
		},
	},
	methods: {
		getSerialOptions(item) {
			if (Array.isArray(item?.filtered_serial_no_data)) {
				return item.filtered_serial_no_data;
			}
			return Array.isArray(item?.serial_no_data) ? item.serial_no_data : [];
		},
		focusItemField(index, field) {
			const rows = this.$el?.querySelectorAll?.("tr.cart-item-row");
			const row = rows?.[index];
			if (!row) {
				return false;
			}

			row.scrollIntoView({ block: "center" });

			const findCell = (key) => row.querySelector(`td[data-column-key='${key}']`);
			const cell = findCell(field);
			if (!cell) {
				return false;
			}

			if (field === "qty") {
				cell.querySelector(".pos-table__qty-display")?.click();
				this.$nextTick(() => {
					cell.querySelector(".pos-table__qty-input input")?.focus?.();
				});
				return true;
			}

			if (field === "uom") {
				const input = cell.querySelector(".uom-select input") || cell.querySelector("input");
				if (input) {
					input.focus();
					return true;
				}
				cell.querySelector(".uom-select")?.click?.();
				return true;
			}

			if (field === "rate") {
				cell.querySelector(".pos-table__editor-display")?.click();
				this.$nextTick(() => {
					cell.querySelector(".pos-table__editor-input input")?.focus?.();
				});
				return true;
			}

			return false;
		},

		customItemFilter(value, search, item) {
			// Delegated to composable via setup
			return this.searchFilter(value, search, item);
		},

		// Drag and Drop methods delegated to composable
		onDragOverFromSelector(event) {
			this.dragDropHandlers.onDragOverFromSelector(event);
		},

		onDragEnterFromSelector() {
			this.dragDropHandlers.onDragEnterFromSelector();
		},

		onDragLeaveFromSelector(event) {
			this.dragDropHandlers.onDragLeaveFromSelector(event);
		},

		onDropFromSelector(event) {
			this.dragDropHandlers.onDropFromSelector(event);
		},

		handleQtyChange(item, event) {
			const newQty = parseFloat(event.target.value) || 0;
			if (newQty === 0) {
				this.removeItem(item);
			} else {
				this.setFormatedQty(item, "qty", null, false, event.target.value);
			}
		},
		handleMinusClick(item) {
			if (this.isReturnInvoice) {
				if (item.is_free_item || item.posa_is_offer || item.posa_is_replace) {
					this.removeItem(item);
					return;
				}
				if (item.qty < 0) {
					this.addOne(item);
				} else {
					this.removeItem(item);
				}
			} else {
				if (item.qty <= 1) {
					this.removeItem(item);
				} else {
					this.subtractOne(item);
				}
			}
		},

		getQtyDisplayLength(qty) {
			return this.memoizedQtyLength(qty);
		},

		handleExpandedUpdate(val) {
			const mappedValues = val.map((v) => (typeof v === "object" ? v.posa_row_id : v));
			this.$emit("update:expanded", mappedValues);
		},

		isColumnVisible(key) {
			// responsiveHeaders already filters by visibility in useItemsTableResponsive
			return this.responsiveHeaders.some((h) => h.key === key);
		},

		handleQtyUpdate(item, newQty) {
			this.setFormatedQty(item, "qty", null, false, newQty);
		},

		handleRateUpdate(item, newRate) {
			this.setFormatedCurrency(item, "rate", null, false, { target: { value: newRate } });
			this.calcPrices(item, newRate, { target: { id: "rate" } });
		},

		handleDiscountPercentUpdate(item, newDiscount) {
			this.setFormatedCurrency(item, "discount_percentage", null, false, {
				target: { value: newDiscount },
			});
			this.calcPrices(item, newDiscount, { target: { id: "discount_percentage" } });
		},

		handleDiscountAmountUpdate(item, newDiscount) {
			this.setFormatedCurrency(item, "discount_amount", null, false, {
				target: { value: newDiscount },
			});
			this.calcPrices(item, newDiscount, { target: { id: "discount_amount" } });
		},

		handleRowClick(event, item, toggleExpand, internalItem) {
			if (toggleExpand) {
				toggleExpand(internalItem);
			}
		},
	},

	mounted() {
		logComponentRender(this, "ItemsTable", "mounted", {
			rows: (this.items && this.items.length) || 0,
		});

		// Log performance metrics in development
		if (process.env.NODE_ENV === "development") {
			console.log("ItemsTable Modernization Phase 1.1 Complete", {
				itemCount: (this.items && this.items.length) || 0,
				breakpoint: this.breakpoint
			});
		}
	},
};
</script>

<style>
/* Global styles for ItemsTable and its children */
@import "./items-table-styles.css";
</style>

<style scoped>
/* Scoped styles for ItemsTable component specific logic */
.items-table-container {
	position: relative;
	transition: all 0.3s ease;
}
</style>
