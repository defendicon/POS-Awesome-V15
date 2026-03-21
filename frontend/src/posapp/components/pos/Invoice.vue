<template>
	<!-- Main Invoice Wrapper -->
	<div class="pa-0 invoice-shell">
		<!-- Cancel Sale Confirmation Dialog -->
		<CancelSaleDialog v-model="cancel_dialog" @confirm="cancel_invoice" />

		<!-- Main Invoice Card (contains all invoice content) -->
		<v-card
			ref="invoiceCard"
			:style="{
				height: invoiceHeight || 'var(--container-height)',
				maxHeight: invoiceHeight || 'var(--container-height)',
				resize: canResizeInvoicePanel() ? 'vertical' : 'none',
				overflow: 'auto',
			}"
			:class="[
				'cards my-0 py-0 mt-3 resizable invoice-main-card',
				'pos-themed-card',
				{ 'return-mode': isReturnInvoice },
			]"
			@mouseup="saveInvoiceHeight($refs.invoiceCard)"
			@touchend="saveInvoiceHeight($refs.invoiceCard)"
		>
			<!-- Dynamic padding wrapper -->
			<div class="dynamic-padding">
				<v-alert
					type="info"
					density="compact"
					class="invoice-status-alert mb-0"
					v-if="pos_profile.create_pos_invoice_instead_of_sales_invoice"
				>
					{{ __("Invoices saved as POS Invoices") }}
				</v-alert>
				<div class="invoice-sections">
					<div class="invoice-top-grid">
						<v-card flat class="invoice-section-card pos-themed-card">
							<div class="invoice-section-heading">
								<h3 class="invoice-section-heading__title">{{ __("Customer Details") }}</h3>
							</div>
							<InvoiceCustomerSection
								ref="customerSection"
								:pos_profile="pos_profile"
								:invoiceTypes="invoiceTypes"
								v-model="invoiceType"
							/>
						</v-card>

						<v-card
							v-if="pos_profile.posa_use_delivery_charges"
							flat
							class="invoice-section-card pos-themed-card"
						>
							<div class="invoice-section-heading">
								<h3 class="invoice-section-heading__title">{{ __("Delivery Charges") }}</h3>
							</div>
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
						</v-card>
					</div>

					<div class="invoice-meta-grid">
						<v-card
							v-if="pos_profile.posa_allow_change_posting_date"
							flat
							class="invoice-section-card pos-themed-card"
						>
							<div class="invoice-section-heading">
								<h3 class="invoice-section-heading__title">{{ __("Posting and Price List") }}</h3>
							</div>
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
						</v-card>

						<v-card
							v-if="pos_profile.posa_allow_multi_currency"
							flat
							class="invoice-section-card pos-themed-card"
						>
							<div class="invoice-section-heading">
								<h3 class="invoice-section-heading__title">{{ __("Multi Currency") }}</h3>
							</div>
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
						</v-card>
					</div>

					<v-card flat class="invoice-section-card invoice-items-card pos-themed-card">
						<div class="invoice-section-heading">
							<h3 class="invoice-section-heading__title">{{ __("Invoice Items") }}</h3>
						</div>
						<div class="items-table-wrapper">
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

							<ItemsTable
								ref="itemsTableRef"
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
								@show-drop-feedback="(isDragging) => showDropFeedback(isDragging, itemsTableRef)"
								@item-dropped="showDropFeedback(false, itemsTableRef)"
								@view-packed="openPackedItems"
							/>

							<PackedItemsDialog
								v-model="show_packed_dialog"
								:items="packed_dialog_items"
								:displayCurrency="displayCurrency"
								:formatFloat="formatFloat"
								:formatCurrency="formatCurrency"
								:currencySymbol="currencySymbol"
							/>
						</div>
					</v-card>
				</div>
			</div>
		</v-card>

		<!-- Payment Confirmation Dialog -->
		<PaymentConfirmationDialog
			ref="paymentConfirmationDialog"
			v-model="confirm_payment_dialog"
			@confirm="resolvePaymentConfirmation(true)"
			@cancel="resolvePaymentConfirmation(false)"
		/>
		<PriceListRateDialog
			v-model="price_list_rate_dialog_open"
			:initial-rate="price_list_rate_dialog_initial_rate"
			:item-label="price_list_rate_dialog_item_label"
			:currency-symbol="currencySymbol(selected_currency || pos_profile?.currency)"
			@submit="handlePriceListRateDialogSubmit"
			@cancel="handlePriceListRateDialogCancel"
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
			:return_discount_meta="return_discount_meta"
			@update:additional_discount="(val) => (additional_discount = val)"
			@update:additional_discount_percentage="(val) => (additional_discount_percentage = val)"
			@update_discount_umount="update_discount_umount"
			@save-and-clear="save_and_clear_invoice"
			@load-drafts="get_draft_invoices"
			@select-order="get_draft_orders"
			@cancel-sale="cancel_dialog = true"
			@open-invoice-management="open_invoice_management"
			@open-returns="open_returns"
			@print-draft="print_draft_invoice"
			@show-payment="handleShowPaymentRequest"
			@open-customer-display="handleOpenCustomerDisplayRequest"
		/>
	</div>
</template>

<script>
import format from "../../format";
import InvoiceCustomerSection from "./invoice/InvoiceCustomerSection.vue";
import DeliveryCharges from "./invoice/DeliveryCharges.vue";
import PostingDateRow from "./invoice/PostingDateRow.vue";
import MultiCurrencyRow from "./invoice/MultiCurrencyRow.vue";
import CancelSaleDialog from "./invoice/CancelSaleDialog.vue";
import InvoiceSummary from "./invoice/InvoiceSummary.vue";
import ItemsTable from "./invoice/ItemsTable.vue";
import InvoiceItemsActionToolbar from "./invoice/InvoiceItemsActionToolbar.vue";
import PackedItemsDialog from "./invoice/PackedItemsDialog.vue";
import PaymentConfirmationDialog from "./payments/PaymentConfirmationDialog.vue";
import PriceListRateDialog from "./invoice/PriceListRateDialog.vue";
import invoiceItemMethods from "./invoice/invoiceItemMethods";
import invoiceComputed from "./invoice/invoiceComputed";
import invoiceWatchers from "./invoice/invoiceWatchers";
import shortcutMethods from "./invoice/invoiceShortcuts";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { storeToRefs } from "pinia";
import stockCoordinator from "../../utils/stockCoordinator";
import { ref } from "vue";

// Composables
import { useOnlineStatus } from "../../composables/core/useOnlineStatus";
import { useInvoiceCurrency } from "../../composables/pos/invoice/useInvoiceCurrency";
import { useInvoiceItems } from "../../composables/pos/invoice/useInvoiceItems";
import { useInvoiceOffers } from "../../composables/pos/invoice/useInvoiceOffers";
import { useInvoiceUI } from "../../composables/pos/invoice/useInvoiceUI";
import { useInvoicePrinting } from "../../composables/pos/invoice/useInvoicePrinting";
import { useInvoiceStock } from "../../composables/pos/invoice/useInvoiceStock";

export default {
	name: "POSInvoice",
	mixins: [format],
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const customersStore = useCustomersStore();
		const toastStore = useToastStore();
		const { isOnline } = useOnlineStatus();

		const { activeView } = storeToRefs(uiStore);
		const { selectedCustomer, refreshToken: customerRefreshToken } = storeToRefs(customersStore);
		const {
			items,
			packedItems: packed_items,
			invoiceDoc: invoice_doc,
			invoiceType,
		} = storeToRefs(invoiceStore);
		const itemsTableRef = ref(null);
		const currencyState = useInvoiceCurrency({}, {});
		const itemActions = useInvoiceItems(invoiceType);
		const offerLogic = useInvoiceOffers();

		// New composables
		const uiLogic = useInvoiceUI();
		const printingLogic = useInvoicePrinting(
			ref(uiStore.posProfile),
			(name) => uiStore.loadPrintPage(name), // Assuming this exists or passed via mixin/store
			itemActions.save_and_clear_invoice, // Need to verify if this is available
			invoice_doc,
		);
		// Note: save_and_clear_invoice might be in methods mixin, not composable.
		// We'll keep print logic partly in component if dependencies are complex.

		const stockLogic = useInvoiceStock(items, packed_items, uiStore.eventBus, () => {});

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
			itemsTableRef,
			...currencyState,
			...itemActions,
			...offerLogic,
			...uiLogic,
			...printingLogic,
			...stockLogic,
		};
	},
	data() {
		return {
			pos_profile: "",
			pos_opening_shift: "",
			stock_settings: "",
			return_doc: "",
			customer: "",
			customer_info: "",
			customer_balance: 0,
			total_tax: 0,
			packed_dialog_items: [],
			show_packed_dialog: false,
			invoiceTypes: ["Invoice", "Order", "Quotation"],
			itemsPerPage: 1000,
			itemSearch: "",
			expanded: [],
			singleExpand: true,
			cancel_dialog: false,
			available_stock_cache: {},
			item_detail_cache: {},
			item_stock_cache: {},
			brand_cache: {},
			stockUnsubscribe: null,
			invoice_posting_date: false,
			posting_date_display: "",
			_shortcutHandlers: {},
			shortcutSubmitInFlight: false,
			shortcutCycle: {
				qty: 0,
				uom: 0,
				rate: 0,
			},
			return_discount_base_total: 0,
			return_discount_base_amount: 0,
			_busHandlers: {},
			price_list_rate_dialog_open: false,
			price_list_rate_dialog_initial_rate: "",
			price_list_rate_dialog_item_label: "",
			price_list_rate_dialog_resolver: null,
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
		PriceListRateDialog,
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
			return this.activeView === "payment" || this.uiStore.paymentDialogOpen;
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
		return_discount_meta() {
			if (
				!this.isReturnInvoice ||
				!this.return_doc ||
				this.pos_profile?.posa_use_percentage_discount
			) {
				return null;
			}

			const originalDiscount = Math.abs(
				Number(this.return_discount_base_amount || 0),
			);
			if (!originalDiscount) return null;

			const originalTotal = Math.abs(
				Number(this.return_discount_base_total || 0),
			);
			if (!originalTotal) return null;

			const returnTotal = Math.abs(Number(this.Total || 0));
			if (!returnTotal) return null;

			const ratio = Math.min(1, returnTotal / originalTotal);
			const prorated = originalDiscount * ratio;

			return {
				ratio,
				original_discount: originalDiscount,
				prorated_discount: prorated,
			};
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
		...shortcutMethods,
		...invoiceItemMethods,
		focusCustomerSearchField() {
			const customerSection = this.$refs.customerSection;
			if (customerSection && typeof customerSection.focusCustomerSearch === "function") {
				customerSection.focusCustomerSearch();
			}
		},

		focusItemSearchField() {
			this.uiStore.triggerItemSearchFocus();
		},

		focusAdditionalDiscountField() {
			this.eventBus?.emit?.("focus_additional_discount");
			this.$refs.invoiceSummary?.focusAdditionalDiscountField?.();
		},

		handleStockCoordinatorUpdate(event = {}) {
			const codes = Array.isArray(event.codes) ? event.codes : [];
			if (!codes.length) return;
			this.applyStockStateToInvoiceItems(codes);
		},

		// UI methods from composable are available in scope but might need wrapping if they access 'this' context unavailable in setup
		// showDropFeedback is handled by composable

		openPackedItems(bundle_id) {
			this.packed_dialog_items = this.packed_items.filter((it) => it.bundle_id === bundle_id);
			this.show_packed_dialog = true;
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

		applyReturnDiscountProration(options = {}) {
			const { defer } = options || {};
			if (defer && typeof this.$nextTick === "function") {
				this.$nextTick(() => {
					setTimeout(() => this.applyReturnDiscountProration(), 0);
				});
				return;
			}

			if (
				!this.isReturnInvoice ||
				this.pos_profile?.posa_use_percentage_discount ||
				!this.return_doc ||
				typeof this.return_doc !== "object"
			) {
				return;
			}

			const originalDiscount = Math.abs(
				Number(this.return_discount_base_amount || 0),
			);
			const originalTotal = Math.abs(
				Number(this.return_discount_base_total || 0),
			);
			const returnTotal = Math.abs(Number(this.Total || 0));

			if (!originalDiscount || !originalTotal || !returnTotal) {
				return;
			}

			const ratio = Math.min(1, returnTotal / originalTotal);
			const prorated = -Math.abs(originalDiscount * ratio);

			console.log("[POSA][Returns] Event auto-prorate discount", {
				originalDiscount,
				originalTotal,
				returnTotal,
				ratio,
				prorated,
			});

			this.discount_amount = prorated;
			this.additional_discount = prorated;
			this.additional_discount_percentage = 0;
		},

		async set_delivery_charges(options = {}) {
			const { forceReset = false } = options;
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
					this.delivery_charges = r.message;
				}
			} catch (error) {
				console.error("Failed to fetch delivery charges", error);
			}
		},
		deliveryChargesFilter(itemText, queryText, itemRow) {
			const item = itemRow.raw;
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

		update_exchange_rate() {
			this.sync_exchange_rate();
		},

		update_conversion_rate() {
			this.sync_exchange_rate();
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

			this.eventBus.emit("update_currency", {
				currency: this.selected_currency || this.pos_profile.currency,
				exchange_rate: this.exchange_rate,
				conversion_rate: this.conversion_rate,
			});

			this.update_item_rates();
			this.update_delivery_charges(this.conversion_rate, this.currency_precision);
		},

		handleRegisterPosProfile(data) {
			this.pos_profile = data.pos_profile;
			this.company = data.company || null;
			this.customer = data.pos_profile.customer;
			this.pos_opening_shift = data.pos_opening_shift;
			this.stock_settings = data.stock_settings;

			this.invoiceType = this.pos_profile.posa_default_sales_order ? "Order" : "Invoice";

			this.fetch_price_lists();
			this.update_price_list();
			this.fetch_available_currencies();
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
		},

		calcProratedReturnDiscount(returnDoc) {
			if (!returnDoc) return 0;

			const originalDiscount = Math.abs(
				Number(returnDoc.discount_amount || 0),
			);
			if (!originalDiscount) return 0;

			const originalTotal = Math.abs(
				Number(
					returnDoc.total ??
						returnDoc.net_total ??
						returnDoc.grand_total ??
						0,
				),
			);
			if (!originalTotal) return 0;

			const returnTotal = Math.abs(Number(this.Total || 0));
			if (!returnTotal) return 0;

			const ratio = Math.min(1, returnTotal / originalTotal);
			const prorated = originalDiscount * ratio;
			console.log("[POSA][Returns] Prorate discount", {
				originalDiscount,
				originalTotal,
				returnTotal,
				ratio,
				prorated,
			});
			return -Math.abs(prorated);
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
				this.return_doc = data.return_doc;
				this.invoice_doc.return_against = data.return_doc.name;
				this.return_discount_base_amount = Math.abs(
					Number(data.return_doc.discount_amount || 0),
				);
				this.return_discount_base_total = Math.abs(
					Number(
						data.return_doc.total ??
							data.return_doc.net_total ??
							data.return_doc.grand_total ??
							0,
					),
				);
				console.log("[POSA][Returns] Loaded return doc", {
					return_against: data.return_doc.name,
					is_percentage:
						!!this.pos_profile?.posa_use_percentage_discount,
					discount_amount: data.return_doc.discount_amount,
					discount_percentage:
						data.return_doc.additional_discount_percentage,
					original_total:
						data.return_doc.total ??
						data.return_doc.net_total ??
						data.return_doc.grand_total,
					base_total: this.return_discount_base_total,
					base_discount: this.return_discount_base_amount,
				});

				if (this.pos_profile?.posa_use_percentage_discount) {
					if (
						data.return_doc.additional_discount_percentage !==
						undefined
					) {
						this.additional_discount_percentage =
							data.return_doc.additional_discount_percentage || 0;
					}
					this.update_discount_umount();
				} else {
					const prorated = this.calcProratedReturnDiscount(
						data.return_doc,
					);
					this.discount_amount = prorated;
					this.additional_discount = prorated;
					this.additional_discount_percentage = 0;
				}
			} else {
				this.discount_amount = 0;
				this.additional_discount = 0;
				this.additional_discount_percentage = 0;
			}
		},
		handleSetNewLine(data) {
			this.new_line = data;
		},
		handleShowPaymentRequest() {
			this.show_payment();
		},
		handleOpenCustomerDisplayRequest() {
			if (this.eventBus && typeof this.eventBus.emit === "function") {
				this.eventBus.emit("open_customer_display");
			}
		},
		promptPriceListRate(initialRate, item) {
			if (typeof this.price_list_rate_dialog_resolver === "function") {
				this.price_list_rate_dialog_resolver(null);
			}

			this.price_list_rate_dialog_initial_rate =
				initialRate == null ? "" : String(initialRate);
			this.price_list_rate_dialog_item_label = String(
				item?.item_name || item?.item_code || "",
			);
			this.price_list_rate_dialog_open = true;

			return new Promise((resolve) => {
				this.price_list_rate_dialog_resolver = resolve;
			});
		},
		handlePriceListRateDialogCancel() {
			if (typeof this.price_list_rate_dialog_resolver === "function") {
				this.price_list_rate_dialog_resolver(null);
			}
			this.price_list_rate_dialog_open = false;
			this.price_list_rate_dialog_initial_rate = "";
			this.price_list_rate_dialog_item_label = "";
			this.price_list_rate_dialog_resolver = null;
		},
		handlePriceListRateDialogSubmit(value) {
			if (typeof this.price_list_rate_dialog_resolver === "function") {
				this.price_list_rate_dialog_resolver(value);
			}
			this.price_list_rate_dialog_open = false;
			this.price_list_rate_dialog_initial_rate = "";
			this.price_list_rate_dialog_item_label = "";
			this.price_list_rate_dialog_resolver = null;
		},
	},

	mounted() {
		this.setUpdateItemDetail(this.update_item_detail);
		this.loadColumnPreferences();
		this.loadInvoiceHeight();

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
				}
			},
			{ deep: false },
		);

		this.$watch(
			() => this.invoiceStore.orderToLoad,
			(doc) => {
				if (doc) {
					this.handleLoadOrder(doc);
				}
			},
			{ deep: false },
		);

		this.$watch(
			() => this.uiStore.draggedItem,
			(item) => {
				this.showDropFeedback(!!item, this.itemsTableRef);
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
			add_item: this.add_item,
			clear_invoice: this.handleClearInvoice,
			apply_pricing_rules: () => {
				if (typeof this.schedulePricingRuleApplication === "function") {
					this.schedulePricingRuleApplication();
				}
			},
			update_invoice_offers: this.handleUpdateInvoiceOffers,
			update_invoice_coupons: this.handleUpdateInvoiceCoupons,
			set_all_items: this.handleSetAllItems,
			load_return_invoice: this.handleLoadReturnInvoice,
			set_new_line: this.handleSetNewLine,
			calc_uom: this.calc_uom,
			recalculate_return_discount: (payload) =>
				this.applyReturnDiscountProration(payload),
			reset_invoice_type_to_invoice: () => {
				this.invoiceType = "Invoice";
				this.invoiceTypes = ["Invoice", "Order", "Quotation"];
			},
		};

		Object.entries(this._busHandlers).forEach(([eventName, handler]) => {
			this.eventBus.on(eventName, handler);
		});

		this.stockUnsubscribe = stockCoordinator.subscribe(this.handleStockCoordinatorUpdate);

		this.emitCartQuantities();
		this.$nextTick(() => {
			this.primeInvoiceStockState();
		});
	},
	beforeUnmount() {
		if (typeof this.price_list_rate_dialog_resolver === "function") {
			this.price_list_rate_dialog_resolver(null);
			this.price_list_rate_dialog_resolver = null;
		}

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
					setTimeout(() => {
						this.$refs.paymentConfirmationDialog?.focus?.();
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
	background-color: var(--pos-surface-muted) !important;
}

.invoice-shell {
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm);
	flex: 1 1 auto;
	min-height: 0;
	overflow: auto;
}

@media (max-width: 1099px) {
	.invoice-shell {
		padding-bottom: calc(var(--bottom-safe-space) + var(--dynamic-xs));
	}
}

.invoice-main-card {
	display: flex;
	flex-direction: column;
	flex: 0 0 auto;
	overflow: auto !important;
	min-width: 0;
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
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm);
	flex: 1 1 auto;
	min-height: 0;
	overflow: visible;
}

.invoice-status-alert {
	border-radius: 14px;
	flex: 0 0 auto;
}

.invoice-sections {
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm);
	flex: 1 1 auto;
	min-height: 0;
	overflow: visible;
	align-items: stretch;
}

.invoice-top-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--dynamic-sm);
	flex: 0 0 auto;
}

.invoice-meta-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--dynamic-sm);
	flex: 0 0 auto;
}

.invoice-section-card {
	background: var(--pos-card-bg) !important;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	border-radius: var(--pos-radius-md, 18px);
	box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
	overflow: hidden;
	flex: 0 0 auto;
	min-height: fit-content;
}

.invoice-section-heading {
	padding: 14px 16px 0;
}

.invoice-section-heading__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	line-height: 1.25;
	color: var(--pos-text-primary);
}

.invoice-items-card {
	padding-bottom: var(--dynamic-xs);
	display: flex;
	flex-direction: column;
	flex: 0 0 auto;
	min-height: 320px;
	overflow: visible;
}

/* Responsive breakpoints */
@media (max-width: 768px) {
	.invoice-shell {
		gap: var(--dynamic-xs);
	}

	.invoice-main-card {
		height: auto !important;
		max-height: none !important;
		resize: none !important;
		overflow: visible !important;
	}

	.dynamic-padding {
		/* Smaller uniform padding on tablets */
		padding: var(--dynamic-xs);
		overflow: visible;
	}

	.dynamic-padding .v-row {
		margin: 0 -2px;
	}

	.dynamic-padding .v-col {
		padding: 2px 4px;
	}

	.invoice-meta-grid {
		grid-template-columns: 1fr;
	}

	.invoice-top-grid {
		grid-template-columns: 1fr;
	}

	.invoice-sections {
		overflow: visible;
	}

	.invoice-items-card {
		flex: 0 0 auto;
		min-height: 320px;
	}

	.items-table-wrapper {
		/* Adjust for smaller padding on tablets */
		margin-left: 0;
		margin-right: 0;
		width: 100%;
		max-width: 100%;
		min-height: 280px;
	}

	.item-search-field {
		max-width: 100%;
	}
}

@media (max-width: 480px) {
	.invoice-main-card {
		margin-top: var(--dynamic-xs) !important;
	}

	.dynamic-padding {
		padding: var(--dynamic-xs);
	}

	.dynamic-padding .v-row {
		margin: 0 -1px;
	}

	.dynamic-padding .v-col {
		padding: 1px 2px;
	}

	.invoice-meta-grid {
		grid-template-columns: 1fr;
	}

	.invoice-top-grid {
		grid-template-columns: 1fr;
	}

	.items-table-wrapper {
		/* Adjust for smallest screens */
		margin-left: 0;
		margin-right: 0;
		width: 100%;
		max-width: 100%;
		min-height: 240px;
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
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	flex: 0 0 auto;
	min-height: 320px;
	min-width: 0;
}

:deep(.items-table-wrapper .column-selector-container) {
	position: sticky;
	top: 0;
	z-index: 3;
	background: var(--pos-card-bg);
}

:deep(.items-table-wrapper .posa-items-table-container) {
	flex: 0 0 auto;
	min-height: 320px;
	height: auto !important;
	max-height: none !important;
	overflow: visible !important;
}

:deep(.items-table-wrapper .posa-cart-table),
:deep(.items-table-wrapper .v-data-table__wrapper),
:deep(.items-table-wrapper .v-table__wrapper) {
	height: auto !important;
	max-height: none !important;
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
