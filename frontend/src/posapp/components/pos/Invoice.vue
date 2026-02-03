<template>
	<!-- Main Invoice Wrapper -->
	<div class="pa-0">
		<!-- Cancel Sale Confirmation Dialog -->
		<CancelSaleDialog v-model="cancel_dialog" @confirm="cancel_invoice" />

		<!-- Main Invoice Card (contains all invoice content) -->
		<v-card
			ref="invoiceCard"
			:style="{
				height: invoiceHeight || 'var(--container-height)',
				maxHeight: invoiceHeight || 'var(--container-height)',
				resize: 'vertical',
				overflow: 'auto',
			}"
			:class="['cards my-0 py-0 mt-3 resizable', 'pos-themed-card', { 'return-mode': isReturnInvoice }]"
			@mouseup="saveInvoiceHeight"
			@touchend="saveInvoiceHeight"
		>
			<!-- Dynamic padding wrapper -->
			<div class="dynamic-padding">
				<v-alert
					type="info"
					density="compact"
					class="mb-2"
					v-if="pos_profile.create_pos_invoice_instead_of_sales_invoice"
				>
					{{ __("Invoices saved as POS Invoices") }}
				</v-alert>
				<!-- Top Row: Customer Selection and Invoice Type -->
				<InvoiceCustomerSection
					ref="customerSection"
					:pos_profile="pos_profile"
					:invoiceTypes="invoiceTypes"
					v-model="invoiceType"
				/>

				<!-- Delivery Charges Section (Only if enabled in POS profile) -->
				<DeliveryCharges
					ref="deliveryChargesComponent"
					:pos_profile="pos_profile"
					:delivery_charges="delivery_charges"
					:selected_delivery_charge="selected_delivery_charge"
					:delivery_charges_rate="delivery_charges_rate"
					:deliveryChargesFilter="deliveryChargesFilter"
					:formatCurrency="formatCurrency"
					:currencySymbol="currencySymbol"
					:readonly="readonly"
					@update:selected_delivery_charge="
						(val) => {
							selected_delivery_charge = val;
							update_delivery_charges(conversion_rate, currency_precision);
						}
					"
				/>

				<!-- Posting Date and Customer Balance Section -->
				<PostingDateRow
					ref="postingDateComponent"
					:pos_profile="pos_profile"
					:posting_date_display="posting_date_display"
					:customer_balance="customer_balance"
					:price-list="selected_price_list"
					:price-lists="price_lists"
					:formatCurrency="formatCurrency"
					@update:posting_date_display="
						(val) => {
							posting_date_display = val;
						}
					"
					@update:priceList="
						(val) => {
							selected_price_list = val;
						}
					"
				/>

				<!-- Multi-Currency Section (Only if enabled in POS profile) -->
				<MultiCurrencyRow
					:pos_profile="pos_profile"
					:selected_currency="selected_currency"
					:plc_conversion_rate="exchange_rate"
					:conversion_rate="conversion_rate"
					:available_currencies="available_currencies"
					:isNumber="isNumber"
					:price_list_currency="price_list_currency"
					@update:selected_currency="
						(val) => {
							selected_currency = val;
							update_currency(val);
						}
					"
					@update:plc_conversion_rate="
						(val) => {
							exchange_rate = val;
							update_exchange_rate();
						}
					"
					@update:conversion_rate="
						(val) => {
							conversion_rate = val;
							update_conversion_rate();
						}
					"
				/>

				<!-- Items Table Section (Main items list for invoice) -->
				<div class="items-table-wrapper">
					<!-- Refactored Action Toolbar -->
					<InvoiceItemsActionToolbar
						ref="actionToolbar"
						:itemSearch="itemSearch"
						:availableColumns="available_columns"
						:selectedColumns="selected_columns"
						@update:itemSearch="itemSearch = $event"
						@update:selectedColumns="
							(cols) => {
								selected_columns = cols;
								saveColumnPreferences();
							}
						"
					/>

					<!-- ItemsTable component with reorder event handler -->
					<ItemsTable
						ref="itemsTable"
						:headers="items_headers"
						v-model:expanded="expanded"
						:itemsPerPage="itemsPerPage"
						:itemSearch="itemSearch"
						:pos_profile="pos_profile"
						:invoiceType="invoiceType"
						:stock_settings="stock_settings"
						:displayCurrency="displayCurrency"
						:formatFloat="formatFloat"
						:formatCurrency="formatCurrency"
						:currencySymbol="currencySymbol"
						:isNumber="isNumber"
						:setFormatedQty="setFormatedQty"
						:setFormatedCurrency="setFormatedCurrency"
						:calcPrices="calc_prices"
						:calcUom="calc_uom"
						:setSerialNo="set_serial_no"
						:setBatchQty="set_batch_qty"
						:validateDueDate="validate_due_date"
						:removeItem="remove_item"
						:subtractOne="subtract_one"
						:addOne="add_one"
						:toggleOffer="toggleOffer"
						:changePriceListRate="change_price_list_rate"
						:isNegative="isNegative"
						@update:expanded="handleExpandedUpdate"
						@reorder-items="handleItemReorder"
						@add-item-from-drag="handleItemDrop"
						@show-drop-feedback="showDropFeedback"
						@item-dropped="showDropFeedback(false)"
						@view-packed="openPackedItems"
					/>
					
					<!-- Refactored Packed Items Dialog -->
					<PackedItemsDialog
						v-model="show_packed_dialog"
						:items="packed_dialog_items"
						:displayCurrency="displayCurrency"
						:formatFloat="formatFloat"
						:formatCurrency="formatCurrency"
						:currencySymbol="currencySymbol"
					/>
				</div>
			</div>
		</v-card>

		<!-- Payment Confirmation Dialog -->
		<PaymentConfirmationDialog
			v-model="confirm_payment_dialog"
			@confirm="resolvePaymentConfirmation(true)"
			@cancel="resolvePaymentConfirmation(false)"
		/>

		<!-- Payment Section -->
		<InvoiceSummary
			ref="invoiceSummary"
			:pos_profile="pos_profile"
			:total_qty="total_qty"
			:additional_discount="additional_discount"
			:additional_discount_percentage="additional_discount_percentage"
			:total_items_discount_amount="total_items_discount_amount"
			:subtotal="subtotal"
			:displayCurrency="displayCurrency"
			:formatFloat="formatFloat"
			:formatCurrency="formatCurrency"
			:currencySymbol="currencySymbol"
			:discount_percentage_offer_name="discount_percentage_offer_name"
			:isNumber="isNumber"
			@update:additional_discount="(val) => (additional_discount = val)"
			@update:additional_discount_percentage="(val) => (additional_discount_percentage = val)"
			@update_discount_umount="update_discount_umount"
			@save-and-clear="save_and_clear_invoice"
			@load-drafts="get_draft_invoices"
			@select-order="get_draft_orders"
			@select-purchase-order="open_purchase_orders"
			@cancel-sale="cancel_dialog = true"
			@open-returns="open_returns"
			@print-draft="print_draft_invoice"
			@apply-offers="apply_offers_and_reload"
			@show-payment="handleShowPaymentRequest"
		/>
	</div>
</template>

<script>
/* global frappe, __ */
import format from "../../format";
import InvoiceCustomerSection from "./InvoiceCustomerSection.vue";
import DeliveryCharges from "./DeliveryCharges.vue";
import PostingDateRow from "./PostingDateRow.vue";
import MultiCurrencyRow from "./MultiCurrencyRow.vue";
import CancelSaleDialog from "./CancelSaleDialog.vue";
import InvoiceSummary from "./InvoiceSummary.vue";
import ItemsTable from "./ItemsTable.vue";
import InvoiceItemsActionToolbar from "./InvoiceItemsActionToolbar.vue";
import PackedItemsDialog from "./PackedItemsDialog.vue";
import PaymentConfirmationDialog from "./PaymentConfirmationDialog.vue";
import invoiceItemMethods from "./invoiceItemMethods";
import invoiceComputed from "./invoiceComputed";
import invoiceWatchers from "./invoiceWatchers";
import { useInvoiceOffers } from "../../composables/useInvoiceOffers";
import shortcutMethods from "./invoiceShortcuts";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { storeToRefs } from "pinia";
import stockCoordinator from "../../utils/stockCoordinator.js";
import { parseBooleanSetting } from "../../utils/stock.js";
import { ref } from "vue";
import { isOffline } from "../../../offline/index.js";
import { useOnlineStatus } from "../../composables/useOnlineStatus";
import { useInvoiceCurrency } from "../../composables/useInvoiceCurrency";
import { useInvoiceItems } from "../../composables/useInvoiceItems";

export default {
	name: "POSInvoice",
	mixins: [format],
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const customersStore = useCustomersStore();
		const toastStore = useToastStore();
		// Extract specific state as refs if needed in template without `uiStore.` prefix
		// But usually better to return the store or use storeToRefs
		const { isOnline } = useOnlineStatus();

		const { activeView } = storeToRefs(uiStore);
		const { selectedCustomer, refreshToken: customerRefreshToken } = storeToRefs(customersStore);

		const invoiceType = ref("Invoice");
		const currencyState = useInvoiceCurrency({}, {});
		const itemActions = useInvoiceItems(invoiceType);
		const offerLogic = useInvoiceOffers();

		return {
			uiStore,
			activeView,
			isOnline,
			toastStore,
			invoiceStore,
			customersStore,
			selectedCustomer,
			customerRefreshToken,
			invoiceType,
			...currencyState,
			...itemActions,
			...offerLogic,
		};
	},
	data() {
		return {
			// POS profile settings
			pos_profile: "",
			pos_opening_shift: "",
			stock_settings: "",
			return_doc: "",
			customer: "",
			customer_info: "",
			customer_balance: 0,
			total_tax: 0,
			packed_dialog_items: [], // Packed items displayed in dialog
			show_packed_dialog: false, // Packing list dialog visibility

			invoiceTypes: ["Invoice", "Order", "Quotation"], // Types of invoices
			// invoiceType moved to setup
			itemsPerPage: 1000, // Items per page in table
			itemSearch: "", // Search query for added items
			expanded: [], // Array of expanded row IDs
			singleExpand: true, // Only one row expanded at a time
			cancel_dialog: false, // Cancel dialog visibility
			available_stock_cache: {},
			item_detail_cache: {},
			item_stock_cache: {},
			brand_cache: {},
			stockUnsubscribe: null,
			invoice_posting_date: false, // Posting date dialog
			posting_date_display: "", // Display value for date picker
			_shortcutHandlers: {},
			shortcutCycle: {
				qty: 0,
				uom: 0,
				rate: 0,
			},
			invoiceHeight: null,
			// paymentVisible state moved to computed property from uiStore
			confirm_payment_dialog: false,
			payment_confirmation_resolver: null,
			_busHandlers: {},
		};
	},

	components: {
		InvoiceCustomerSection,
		DeliveryCharges,
		PostingDateRow,
		MultiCurrencyRow,
		InvoiceSummary,
		CancelSaleDialog,
		ItemsTable,
		InvoiceItemsActionToolbar,
		PackedItemsDialog,
		PaymentConfirmationDialog,
	},
	computed: {
		items: {
			get() {
				return this.invoiceStore.items;
			},
			set(value) {
				this.invoiceStore.setItems(value);
			},
		},
		invoice_doc: {
			get() {
				return this.invoiceStore.invoiceDoc;
			},
			set(value) {
				this.invoiceStore.setInvoiceDoc(value);
			},
		},
		packed_items: {
			get() {
				return this.invoiceStore.packedItems;
			},
			set(value) {
				this.invoiceStore.setPackedItems(value);
			},
		},
		paymentVisible() {
			return this.activeView === "payment";
		},
		discount_amount: {
			get() {
				return this.invoiceStore.discountAmount;
			},
			set(val) {
				this.invoiceStore.setDiscountAmount(val);
			},
		},
		additional_discount: {
			get() {
				return this.invoiceStore.additionalDiscount;
			},
			set(val) {
				this.invoiceStore.setAdditionalDiscount(val);
			},
		},
		additional_discount_percentage: {
			get() {
				return this.invoiceStore.additionalDiscountPercentage;
			},
			set(val) {
				this.invoiceStore.setAdditionalDiscountPercentage(val);
			},
		},
		posting_date: {
			get() {
				return this.invoiceStore.postingDate;
			},
			set(val) {
				this.invoiceStore.setPostingDate(val);
			},
		},
		...invoiceComputed,
	},

	methods: {
		formatDateForDisplay(date) {
			if (!date) return "";
			const parts = date.split("-");
			if (parts.length === 3) {
				return `${parts[2]}-${parts[1]}-${parts[0]}`;
			}
			return date;
		},
		confirmPaymentSubmission() {
			this.confirm_payment_dialog = true;
			return new Promise((resolve) => {
				this.payment_confirmation_resolver = resolve;
			});
		},

		resolvePaymentConfirmation(result) {
			this.confirm_payment_dialog = false;
			if (this.payment_confirmation_resolver) {
				this.payment_confirmation_resolver(result);
				this.payment_confirmation_resolver = null;
			}
		},
		...shortcutMethods,

		...invoiceItemMethods,
		focusCustomerSearchField() {
			const customerSection = this.$refs.customerSection;
			if (!customerSection) {
				return;
			}

			const focusFn = customerSection.focusCustomerSearch;
			if (typeof focusFn === "function") {
				focusFn();
			}
		},

		focusItemSearchField() {
			this.uiStore.triggerItemSearchFocus();
		},

		focusAdditionalDiscountField() {
			this.$refs.invoiceSummary?.focusAdditionalDiscountField?.();
		},

		emitCartQuantities() {
			const totals = {};
			const normalizeNumber = (value) => {
				const num = Number(value);
				return Number.isFinite(num) ? num : null;
			};
			const accumulate = (line) => {
				if (!line || !line.item_code) {
					return;
				}

				const code = String(line.item_code).trim();
				if (!code) {
					return;
				}

				let stockQty = normalizeNumber(line.stock_qty);
				if (stockQty === null) {
					const qty = normalizeNumber(line.qty);
					if (qty !== null) {
						const conversion = normalizeNumber(line.conversion_factor);
						const factor = conversion !== null && conversion !== 0 ? conversion : 1;
						stockQty = qty * factor;
					}
				}

				if (stockQty === null) {
					return;
				}

				const positiveQty = Math.max(0, stockQty);
				if (!positiveQty) {
					return;
				}

				totals[code] = (totals[code] || 0) + positiveQty;
			};

			(Array.isArray(this.items) ? this.items : []).forEach(accumulate);
			(Array.isArray(this.packed_items) ? this.packed_items : []).forEach(accumulate);

			const impacted = stockCoordinator.updateReservations(totals, {
				source: "invoice",
			});
			if (impacted.length) {
				this.applyStockStateToInvoiceItems(impacted);
			}

			this.eventBus.emit("cart_quantities_updated", totals);
		},
		// Handle item dropped from ItemsSelector to ItemsTable
		handleItemDrop(item) {
			console.log("Item dropped:", item);

			// Use the logic-heavy addItem method (from invoiceItemMethods alias) 
			// to handle bundles, merging, and stock checks.
			this.addItem(item);
		},

		applyStockStateToInvoiceItems(codes = null) {
			const collections = [];
			if (Array.isArray(this.items)) {
				collections.push(this.items);
			}
			if (Array.isArray(this.packed_items)) {
				collections.push(this.packed_items);
			}
			if (!collections.length) {
				return;
			}
			const codesSet = (() => {
				if (codes === null) {
					return null;
				}
				const iterable = Array.isArray(codes)
					? codes
					: codes instanceof Set || (codes && typeof codes[Symbol.iterator] === "function")
						? Array.from(codes)
						: [codes];
				return new Set(
					iterable
						.map((code) => (code !== undefined && code !== null ? String(code).trim() : ""))
						.filter(Boolean),
				);
			})();

			collections.forEach((items) => {
				stockCoordinator.applyAvailabilityToCollection(items, codesSet, {
					updateBaseAvailable: false,
				});
			});

			this.$forceUpdate();
		},
		primeInvoiceStockState(source = "invoice") {
			const baseItems = [];
			if (Array.isArray(this.items)) {
				baseItems.push(...this.items);
			}
			if (Array.isArray(this.packed_items)) {
				baseItems.push(...this.packed_items);
			}
			if (!baseItems.length) {
				return;
			}

			stockCoordinator.primeFromItems(baseItems, { silent: true, source });
			const codes = baseItems
				.map((item) => (item && item.item_code !== undefined ? String(item.item_code).trim() : null))
				.filter(Boolean);
			this.applyStockStateToInvoiceItems(codes);
		},
		handleStockCoordinatorUpdate(event = {}) {
			const codes = Array.isArray(event.codes) ? event.codes : [];
			if (!codes.length) {
				return;
			}
			this.applyStockStateToInvoiceItems(codes);
		},

		// Show visual feedback when item is being dragged over drop zone
		showDropFeedback(isDragging) {
			// Add visual feedback class to the items table
			const itemsTable = this.$el.querySelector(".modern-items-table");
			if (itemsTable) {
				if (isDragging) {
					itemsTable.classList.add("drag-over");
				} else {
					itemsTable.classList.remove("drag-over");
				}
			}
		},
		openPackedItems(bundle_id) {
			this.packed_dialog_items = this.packed_items.filter((it) => it.bundle_id === bundle_id);
			this.show_packed_dialog = true;
		},

		saveInvoiceHeight() {
			if (this.$refs.invoiceCard) {
				this.invoiceHeight = this.$refs.invoiceCard.clientHeight + "px";
				try {
					localStorage.setItem("posawesome_invoice_height", this.invoiceHeight);
				} catch (e) {
					console.error("Failed to save invoice height:", e);
				}
			}
		},

		loadInvoiceHeight() {
			try {
				const saved = localStorage.getItem("posawesome_invoice_height");
				if (saved) {
					this.invoiceHeight = saved;
				} else {
					this.invoiceHeight =
						getComputedStyle(document.documentElement).getPropertyValue("--container-height") ||
						"68vh";
				}
			} catch (e) {
				console.error("Failed to load invoice height:", e);
				this.invoiceHeight =
					getComputedStyle(document.documentElement).getPropertyValue("--container-height") ||
					"68vh";
			}
		},
		makeid(length) {
			let result = "";
			const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
			const charactersLength = characters.length;
			for (var i = 0; i < length; i++) {
				result += characters.charAt(Math.floor(Math.random() * charactersLength));
			}
			return result;
		},

		handleExpandedUpdate(ids) {
			this.expanded = Array.isArray(ids) ? ids.slice(-1) : [];
		},

		async print_draft_invoice() {
			if (!this.pos_profile.posa_allow_print_draft_invoices) {
				this.toastStore.show({
					title: __(`You are not allowed to print draft invoices`),
					color: "error",
				});
				return;
			}

			let invoice_name = this.invoice_doc?.name || null;
			try {
				const invoice_doc = await this.save_and_clear_invoice();
				if (invoice_doc?.name) {
					invoice_name = invoice_doc.name;
				}

				if (!invoice_name) {
					throw new Error("Invoice could not be saved before printing");
				}

				this.load_print_page(invoice_name);
			} catch (error) {
				console.error("Failed to print draft invoice:", error);
				this.toastStore.show({
					title: __("Unable to print draft invoice"),
					color: "error",
				});
			}
		},
		async set_delivery_charges(options = {}) {
			const { forceReset = false } = options;
			var vm = this;
			if (!this.pos_profile || !this.customer || !this.pos_profile.posa_use_delivery_charges) {
				this.delivery_charges = [];
				this.base_delivery_charges_rate = 0;
				this.delivery_charges_rate = 0;
				this.selected_delivery_charge = "";
				return;
			}

			if (forceReset) {
				this.base_delivery_charges_rate = 0;
				this.delivery_charges_rate = 0;
				this.selected_delivery_charge = "";
			}
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.offers.get_applicable_delivery_charges",
					args: {
						company: this.pos_profile.company,
						pos_profile: this.pos_profile.name,
						customer: this.customer,
					},
				});
				if (r.message && r.message.length) {
					console.log(r.message);
					vm.delivery_charges = r.message;
				}
			} catch (error) {
				console.error("Failed to fetch delivery charges", error);
			}
		},
		deliveryChargesFilter(itemText, queryText, itemRow) {
			const item = itemRow.raw;
			console.log("dl charges", item);
			const textOne = item.name.toLowerCase();
			const searchText = queryText.toLowerCase();
			return textOne.indexOf(searchText) > -1;
		},
		updatePostingDate(date) {
			if (!date) return;
			this.posting_date = date;
			this.invoiceStore.setPostingDate(date);
			this.$forceUpdate();
		},



		formatCurrency(value, precision = null) {
			const prec = precision != null ? precision : this.currency_precision;
			return this.$options.mixins[0].methods.formatCurrency.call(this, value, prec);
		},

		flt(value, precision = null) {
			// Enhanced float handling for small numbers
			if (precision === null) {
				precision = this.float_precision;
			}

			const _value = Number(value);
			if (isNaN(_value)) {
				return 0;
			}

			// Handle very small numbers to prevent them from becoming 0
			if (Math.abs(_value) < 0.000001) {
				return _value;
			}

			return Number((_value || 0).toFixed(precision));
		},



		async update_exchange_rate_on_server() {
			if (this.conversion_rate) {
				if (!this.items.length) {
					this.sync_exchange_rate();
					return;
				}

				const doc = this.get_invoice_doc();
				doc.conversion_rate = this.conversion_rate;
				doc.plc_conversion_rate = this._getPlcConversionRate();
				try {
					const resp = await this.update_invoice(doc);
					if (resp && resp.exchange_rate_date) {
						this.exchange_rate_date = resp.exchange_rate_date;
						const posting_backend = this.formatDateForBackend(this.posting_date_display);
						if (posting_backend !== this.exchange_rate_date) {
							this.toastStore.show({
								title: __(
									"Exchange rate date " +
										this.exchange_rate_date +
										" differs from posting date " +
										posting_backend,
								),
								color: "warning",
							});
						}
					}
					this.sync_exchange_rate();
				} catch (error) {
					console.error("Error updating exchange rate:", error);
					this.toastStore.show({
						title: "Error updating exchange rate",
						color: "error",
					});
				}
			}
		},

		sync_exchange_rate() {
			if (!this.exchange_rate || this.exchange_rate <= 0) {
				this.exchange_rate = 1;
			}
			if (!this.conversion_rate || this.conversion_rate <= 0) {
				this.conversion_rate = 1;
			}

			// Emit currency update
			this.eventBus.emit("update_currency", {
				currency: this.selected_currency || this.pos_profile.currency,
				exchange_rate: this.exchange_rate,
				conversion_rate: this.conversion_rate,
			});

			this.update_item_rates();
			this.update_delivery_charges_rate();
		},

		// Add new rounding function
		roundAmount(amount) {
			// Respect POS Profile setting to disable rounding
			if (this.pos_profile.disable_rounded_total) {
				// Use configured precision without applying rounding
				return this.flt(amount, this.currency_precision);
			}
			// If multi-currency is enabled and selected currency is different from base currency
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.pos_profile.posa_allow_multi_currency && this.selected_currency !== baseCurrency) {
				// For multi-currency, just keep 2 decimal places without rounding to nearest integer
				return this.flt(amount, 2);
			}
			// For base currency or when multi-currency is disabled, round to nearest integer
			return Math.round(amount);
		},


		// Handle item reordering from drag and drop
		handleItemReorder(reorderData) {
			const { fromIndex, toIndex } = reorderData;

			if (fromIndex === toIndex) return;

			// Create a copy of the items array
			const newItems = [...this.items];

			// Remove the item from its original position
			const [movedItem] = newItems.splice(fromIndex, 1);

			// Insert the item at its new position
			newItems.splice(toIndex, 0, movedItem);

			// Update the items array
			this.items = newItems;

			// Show success feedback
			this.toastStore.show({
				title: __("Item order updated"),
				color: "success",
			});

			// Optionally, you can also update the idx field for each item
			this.items.forEach((item, index) => {
				item.idx = index + 1;
			});
		},
		handleRegisterPosProfile(data) {
			this.pos_profile = data.pos_profile;
			this.company = data.company || null;
			this.customer = data.pos_profile.customer;
			this.pos_opening_shift = data.pos_opening_shift;
			this.stock_settings = data.stock_settings;

			this.invoiceType = this.pos_profile.posa_default_sales_order ? "Order" : "Invoice";

			// Pricing list initialization
			this.fetch_price_lists();
			this.update_price_list();
		},
		handleClearInvoice() {
			this.clear_invoice();
			this.uiStore.triggerItemSearchFocus();
		},
		handleLoadInvoice(data) {
			this.load_invoice(data, { preserveStickies: true });
		},
		handleLoadOrder(data) {
			this.new_order(data);
			// this.eventBus.emit("set_pos_coupons", data.posa_coupons);
		},

		handleSetAllItems(data) {
			this.allItems = data;
			this.items.forEach((item) => {
				if (item._detailSynced !== true) {
					this.update_item_detail(item);
				}
			});
			this.primeInvoiceStockState();
		},
		handleLoadReturnInvoice(data) {
			console.log("Invoice component received load_return_invoice event with data:", data);
			this.load_invoice(data.invoice_doc);
			this.invoiceType = "Return";
			this.invoiceTypes = ["Return"];
			this.invoice_doc.is_return = 1;
			if (this.items && this.items.length) {
				this.items.forEach((item) => {
					if (item.qty > 0) item.qty = -Math.abs(item.qty);
					if (item.stock_qty > 0) item.stock_qty = -Math.abs(item.stock_qty);
				});
			}
			if (data.return_doc) {
				console.log("Return against existing invoice:", data.return_doc.name);
				this.discount_amount = data.return_doc.discount_amount || 0;
				this.additional_discount = data.return_doc.discount_amount || 0;
				this.return_doc = data.return_doc;
				this.invoice_doc.return_against = data.return_doc.name;
			} else {
				console.log("Return without invoice reference");
				this.discount_amount = 0;
				this.additional_discount = 0;
				this.additional_discount_percentage = 0;
			}
			console.log("Invoice state after loading return:", {
				invoiceType: this.invoiceType,
				is_return: this.invoice_doc.is_return,
				items: this.items.length,
				customer: this.customer,
			});
		},
		handleSetNewLine(data) {
			this.new_line = data;
		},
		// handleResetPostingDate removed - handled by store
		handleItemDragStart() {
			this.showDropFeedback(true);
		},
		handleItemDragEnd() {
			this.showDropFeedback(false);
		},
		// handleShowPayment removed - state managed by uiStore/computed
		handleShowPaymentRequest() {
			this.show_payment();
		},
	},

	mounted() {
		this.setUpdateItemDetail(this.update_item_detail);
		// Load saved column preferences via useInvoiceItems composable
		this.loadColumnPreferences();
		// Restore saved invoice height
		this.loadInvoiceHeight();

		// Watch UI Store for Profile
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile && profile.name) {
					this.handleRegisterPosProfile({
						pos_profile: profile,
						stock_settings: this.uiStore.stockSettings,
						company: this.uiStore.companyDoc,
						pos_opening_shift: this.uiStore.posOpeningShift,
					});
				}
			},
			{ deep: true, immediate: true },
		);

		this.$watch(
			() => this.uiStore.offers,
			(offers) => {
				if (offers) {
					this.handleSetOffers(offers);
				}
			},
			{ deep: true, immediate: true },
		);

		this.$watch(
			() => this.invoiceStore.invoiceToLoad,
			(doc) => {
				if (doc) {
					this.handleLoadInvoice(doc);
					// Reset the trigger so it can be triggered again even with same doc?
					// Or assume it's one-off. Best to reset it to null to avoid double loading if not handled.
					// But `invoiceToLoad` might be part of state.
					// Let's reset it in next tick or just rely on change.
					// Actually, if we set it to null here, we might trigger watcher again.
					// Better: handleLoadInvoice should check if doc is valid.
				}
			},
			{ deep: true },
		);

		this.$watch(
			() => this.invoiceStore.orderToLoad,
			(doc) => {
				if (doc) {
					this.handleLoadOrder(doc);
				}
			},
			{ deep: true },
		);

		this.$watch(
			() => this.uiStore.draggedItem,
			(item) => {
				this.showDropFeedback(!!item);
			},
		);

		this.$watch(
			() => this.invoiceStore.postingDate,
			(val) => {
				if (val) this.posting_date = val;
			},
			{ immediate: true },
		);

		this._busHandlers = {
			// "item-drag-start": this.handleItemDragStart, // Handled by watcher
			// "item-drag-end": this.handleItemDragEnd, // Handled by watcher
			// register_pos_profile: this.handleRegisterPosProfile, // Handled by store watcher
			add_item: this.add_item,
			// clear_invoice: this.handleClearInvoice, // Handled by invoiceStore.clear()
			// load_invoice: this.handleLoadInvoice, // Handled by store watcher
			// load_order: this.handleLoadOrder, // Handled by store watcher
			// set_offers: this.handleSetOffers, // Handled by store watcher
			update_invoice_offers: this.handleUpdateInvoiceOffers,
			update_invoice_coupons: this.handleUpdateInvoiceCoupons,
			set_all_items: this.handleSetAllItems,
			load_return_invoice: this.handleLoadReturnInvoice,
			set_new_line: this.handleSetNewLine,
			// reset_posting_date: this.handleResetPostingDate, // Handled by invoiceStore.postingDate
			calc_uom: this.calc_uom,
			// show_payment: this.handleShowPayment, // Removed
		};

		Object.entries(this._busHandlers).forEach(([eventName, handler]) => {
			this.eventBus.on(eventName, handler);
		});

		this.stockUnsubscribe = stockCoordinator.subscribe(this.handleStockCoordinatorUpdate);

		// Removed multi-currency initialization from mounted hook.
		// It's now handled within handleRegisterPosProfile.

		this.emitCartQuantities();
		this.$nextTick(() => {
			this.primeInvoiceStockState();
		});
	},
	// Cleanup event listeners before component is destroyed
	beforeUnmount() {
		if (typeof this.stockUnsubscribe === "function") {
			this.stockUnsubscribe();
			this.stockUnsubscribe = null;
		}

		Object.entries(this._busHandlers || {}).forEach(([eventName, handler]) => {
			this.eventBus.off(eventName, handler);
		});
		this._busHandlers = {};
		if (typeof this.cancelScheduledOfferRefresh === "function") {
			this.cancelScheduledOfferRefresh();
		}
		if (this._suppressClosePaymentsTimer) {
			clearTimeout(this._suppressClosePaymentsTimer);
			this._suppressClosePaymentsTimer = null;
		}
	},
	// Register global keyboard shortcuts when component is created
	created() {
		this.invoiceStore.clear();
		this.$watch(
			() => this.selectedCustomer,
			(newCustomer) => {
				if (newCustomer) {
					if (this.customer !== newCustomer) {
						this.customer = newCustomer;
					}
				} else if (this.customer) {
					this.customer = "";
				}
			},
			{ immediate: true },
		);
		this.$watch(
			() => this.customerRefreshToken,
			() => {
				if (this.customer) {
					this.fetch_customer_details();
				}
			},
		);
		this._shortcutHandlers = this._shortcutHandlers || {};

		this._shortcutHandlers.handleInvoiceShortcut = this.handleInvoiceShortcut.bind(this);
		document.addEventListener("keydown", this._shortcutHandlers.handleInvoiceShortcut);
	},
	// Remove global keyboard shortcuts when component is unmounted
	unmounted() {
		if (!this._shortcutHandlers) {
			return;
		}

		document.removeEventListener("keydown", this._shortcutHandlers.handleInvoiceShortcut);

		this._shortcutHandlers = {};
	},
	watch: {
		...invoiceWatchers,
		confirm_payment_dialog(val) {
			if (val) {
				this.$nextTick(() => {
					// Add a small delay for the dialog animation
					setTimeout(() => {
						this.$refs.confirmPaymentBtn?.$el?.focus();
					}, 100);
				});
			}
		},
	},
};
</script>

<style scoped>
/* Card background adjustments */
.cards {
	background-color: var(--surface-secondary) !important;
}

/* Style for selected checkbox button */
.v-checkbox-btn.v-selected {
	background-color: var(--submit-start) !important;
	color: white;
}

/* Bottom border for elements */
.border_line_bottom {
	border-bottom: 1px solid var(--field-border);
}

/* Disable pointer events for elements */
.disable-events {
	pointer-events: none;
}

/* Style for customer balance field */
:deep(.balance-field) {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: nowrap;
}

/* Style for balance value text */
:deep(.balance-value) {
	font-size: 1.5rem;
	font-weight: bold;
	color: var(--primary-start);
	margin-left: var(--dynamic-xs);
}

/* Red border and label for return mode card */

/* Red border and label for return mode card */

.return-mode {
	border: 2px solid rgb(var(--v-theme-error)) !important;
	position: relative;
}

/* Label for return mode card */
.return-mode::before {
	content: "RETURN";
	position: absolute;
	top: 0;
	right: 0;
	background-color: rgb(var(--v-theme-error));
	color: white;
	padding: 4px 12px;
	font-weight: bold;
	border-bottom-left-radius: 8px;
	z-index: 1;
}

/* Dynamic padding for responsive layout */
.dynamic-padding {
	/* Uniform spacing for better alignment */
	padding: var(--dynamic-sm);
}

/* Responsive breakpoints */
@media (max-width: 768px) {
	.dynamic-padding {
		/* Smaller uniform padding on tablets */
		padding: var(--dynamic-xs);
	}

	.dynamic-padding .v-row {
		margin: 0 -2px;
	}

	.dynamic-padding .v-col {
		padding: 2px 4px;
	}

	.items-table-wrapper {
		/* Adjust for smaller padding on tablets */
		margin-left: calc(-1 * var(--dynamic-xs));
		margin-right: calc(-1 * var(--dynamic-xs));
		width: calc(100% + 2 * var(--dynamic-xs));
		max-width: calc(100% + 2 * var(--dynamic-xs));
	}

	.item-search-field {
		max-width: 100%;
	}
}

@media (max-width: 480px) {
	.dynamic-padding {
		padding: var(--dynamic-xs);
	}

	.dynamic-padding .v-row {
		margin: 0 -1px;
	}

	.dynamic-padding .v-col {
		padding: 1px 2px;
	}

	.items-table-wrapper {
		/* Adjust for smallest screens */
		margin-left: calc(-1 * var(--dynamic-xs));
		margin-right: calc(-1 * var(--dynamic-xs));
		width: calc(100% + 2 * var(--dynamic-xs));
		max-width: calc(100% + 2 * var(--dynamic-xs));
	}

	.item-search-field {
		flex-basis: 100%;
		max-width: 100%;
		margin-right: 0;
	}
}

.column-selector-container {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
	padding: 8px 16px;
	background-color: var(--pos-card-bg);
	border-radius: 8px 8px 0 0;
	box-sizing: border-box;
	margin-bottom: 8px;
}

.item-search-field {
	width: 100%;
	max-width: 320px;
	flex: 1 1 240px;
	margin-right: auto;
}

.column-selector-btn {
	font-size: 0.875rem;
}

.items-table-wrapper {
	position: relative;
	margin-top: var(--dynamic-sm);
	/* Override parent padding to make table full-width */
	margin-left: calc(-1 * var(--dynamic-sm));
	margin-right: calc(-1 * var(--dynamic-sm));
	width: calc(100% + 2 * var(--dynamic-sm));
	max-width: calc(100% + 2 * var(--dynamic-sm));
	box-sizing: border-box;
}

/* New styles for improved column switches */
:deep(.column-switch) {
	margin: 0;
	padding: 0;
}

:deep(.column-switch .v-switch__track) {
	opacity: 0.7;
}

:deep(.column-switch .v-switch__thumb) {
	transform: scale(0.8);
}

:deep(.column-switch .v-label) {
	opacity: 0.9;
	font-size: 0.95rem;
}
</style>
