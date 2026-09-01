<template>
	<div
		class="pos-main-container dynamic-container"
		:class="[rtlClasses, { 'pos-main-container--counter-grid': counterGridActive }]"
		:style="[responsiveStyles, layoutStyleOverrides, rtlStyles]"
	>
		<Drafts></Drafts>
		<InvoiceManagement></InvoiceManagement>
		<SalesOrders></SalesOrders>
		<Returns></Returns>
		<NewAddress></NewAddress>
		<MpesaPayments></MpesaPayments>
		<Variants></Variants>
		<OpeningDialog
			v-if="dialog"
			:dialog="dialog"
			@close="closeOpeningDialog"
			@register="handleRegisterPosData"
		></OpeningDialog>
		<v-dialog
			v-if="usePaymentDialog"
			v-model="paymentDialogOpen"
			:retain-focus="false"
			width="96vw"
			max-width="1480"
			scrim="rgba(15, 23, 42, 0.55)"
			class="payment-dialog"
			@update:model-value="handlePaymentDialogUpdate"
			@after-leave="handlePaymentDialogAfterLeave"
		>
			<Payments dialog-mode :counter-grid-mode="counterGridActive" />
		</v-dialog>
		<v-dialog
			v-if="counterGridActive"
			v-model="counterItemSearchOpen"
			eager
			:retain-focus="true"
			width="calc(100vw - 32px)"
			max-width="1500"
			class="counter-item-search-dialog"
			@after-enter="handleCounterItemSearchAfterEnter"
			@after-leave="handleCounterItemSearchAfterLeave"
		>
			<section class="counter-item-search-surface" aria-label="Item search">
				<header class="counter-item-search-header">
					<div class="counter-item-search-header__copy">
						<strong>{{ counterItemSearchTitle }}</strong>
						<span>{{ counterItemSearchSubtitle }}</span>
					</div>
					<v-select
						v-if="counterAlternateSources.length > 1"
						:model-value="counterAlternateSourceRowId"
						:items="counterAlternateSources"
						item-title="label"
						item-value="row_id"
						:label="__('Unavailable cart item')"
						density="compact"
						variant="outlined"
						hide-details
						class="counter-item-search-header__source"
						@update:model-value="counterAlternateSourceRowId = $event"
					/>
					<v-btn
						icon="mdi-close"
						variant="text"
						:aria-label="__('Close item search')"
						@click="closeCounterItemSearch"
					/>
				</header>
				<ItemsSelector
					ref="counterItemsSelector"
					context="pos"
					presentation="counter-grid-dialog"
					:initial-search="counterItemSearchQuery"
					:alternate-request="counterAlternateRequest"
					@item-added="handleCounterItemAdded"
					@alternates-cancelled="handleCounterAlternatesCancelled"
				/>
			</section>
		</v-dialog>
		<v-dialog
			v-if="counterGridActive"
			:model-value="counterAuxiliaryOpen"
			width="calc(100vw - 32px)"
			max-width="1380"
			@update:model-value="handleCounterAuxiliaryUpdate"
			@after-leave="handleCounterAuxiliaryAfterLeave"
		>
			<section class="counter-auxiliary-surface" :data-testid="`counter-grid-${activeView}`">
				<PosOffers v-if="activeView === 'offers'" />
				<PosCoupons v-else-if="activeView === 'coupons'" />
			</section>
		</v-dialog>
		<v-row
			v-if="!counterGridActive"
			v-show="!dialog"
			dense
			class="ma-0 dynamic-main-row"
			:class="{ 'dynamic-main-row--phone': isPhone }"
		>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'items'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col dynamic-col--selector"
			>
				<ItemsSelector context="pos" />
			</v-col>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'offers'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col dynamic-col--selector"
			>
				<PosOffers></PosOffers>
			</v-col>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'coupons'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col dynamic-col--selector"
			>
				<PosCoupons></PosCoupons>
			</v-col>
			<v-col
				v-if="
					(!useCompactPosSwitcher || compactPanel === 'selector') &&
					activeView === 'payment' &&
					!usePaymentDialog
				"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col dynamic-col--selector"
			>
				<Payments></Payments>
			</v-col>

			<v-col
				v-show="!useCompactPosSwitcher || compactPanel === 'invoice'"
				:xl="useCompactPosSwitcher ? 12 : 7"
				:lg="useCompactPosSwitcher ? 12 : 7"
				:md="useCompactPosSwitcher ? 12 : 7"
				:sm="useCompactPosSwitcher ? 12 : 7"
				cols="12"
				class="pos dynamic-col dynamic-col--invoice"
			>
				<Invoice ref="invoicePanel"></Invoice>
			</v-col>
		</v-row>
		<section v-else v-show="!dialog" class="counter-grid-pos" data-testid="counter-grid-pos">
			<Invoice ref="invoicePanel" presentation="counter-grid" />
			<CounterGridHealthStrip
				:warehouse="posProfile?.warehouse"
				:price-list="posProfile?.selling_price_list"
			/>
		</section>
		<div v-if="showBottomDock" ref="mobileDock" class="mobile-pos-stack">
			<div class="mobile-sale-dock">
				<div class="mobile-sale-dock__copy">
					<span class="mobile-sale-dock__eyebrow">{{ __("Active sale") }}</span>
					<strong class="mobile-sale-dock__amount">{{ formattedCartTotal }}</strong>
					<div class="mobile-sale-dock__meta">
						<span>{{ cartMetaLabel }}</span>
						<span>{{ formattedDiscountTotal }}</span>
					</div>
				</div>
				<div class="mobile-sale-dock__field">
					<v-text-field
						v-if="!posProfile?.posa_use_percentage_discount"
						ref="additionalDiscountField"
						v-model="additionalDiscountDisplay"
						name="pos-mobile-additional-discount"
						autocomplete="transaction-amount"
						inputmode="decimal"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						@update:model-value="handleAdditionalDiscountUpdate"
						@focus="handleAdditionalDiscountFocus"
						@blur="handleAdditionalDiscountBlur"
						:label="__('Additional Discount')"
						prepend-inner-icon="mdi-cash-minus"
						variant="solo"
						density="compact"
						color="warning"
						:prefix="getCurrencySymbol(posProfile?.currency)"
						:disabled="
							!posProfile?.posa_allow_user_to_edit_additional_discount ||
							!!discountPercentageOfferName
						"
						hide-details
					/>
					<v-text-field
						v-else
						ref="additionalDiscountField"
						v-model="additionalDiscountPercentageDisplay"
						name="pos-mobile-additional-discount-percent"
						autocomplete="transaction-amount"
						inputmode="decimal"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						@update:model-value="handleAdditionalDiscountPercentageUpdate"
						@focus="handleAdditionalDiscountPercentageFocus"
						@blur="handleAdditionalDiscountPercentageBlur"
						@change="commitAdditionalDiscountPercentage"
						:label="__('Additional Discount %')"
						suffix="%"
						prepend-inner-icon="mdi-percent"
						variant="solo"
						density="compact"
						color="warning"
						:disabled="
							!posProfile?.posa_allow_user_to_edit_additional_discount ||
							!!discountPercentageOfferName
						"
						hide-details
					/>
				</div>
			</div>
			<div class="mobile-pos-dock">
				<button
					type="button"
					class="mobile-pos-dock__item"
					:class="{ 'mobile-pos-dock__item--active': isSelectorViewActive('items') }"
					@click="setSelectorView('items')"
				>
					<v-icon icon="mdi-magnify" size="20" />
					<span>{{ __("Browse") }}</span>
				</button>
				<button
					type="button"
					class="mobile-pos-dock__item"
					:class="{ 'mobile-pos-dock__item--active': activeView === 'offers' }"
					@click="setSelectorView('offers')"
				>
					<v-icon icon="mdi-tag-outline" size="20" />
					<span>{{ __("Offers") }}</span>
				</button>
				<button
					type="button"
					class="mobile-pos-dock__item mobile-pos-dock__item--cart"
					:class="{ 'mobile-pos-dock__item--active': compactPanel === 'invoice' }"
					@click="showInvoicePanel"
				>
					<span class="mobile-pos-dock__pill">{{ itemsCount }}</span>
					<v-icon icon="mdi-cart-outline" size="22" />
					<span>{{ __("Cart") }}</span>
				</button>
				<button
					type="button"
					class="mobile-pos-dock__item"
					:class="{ 'mobile-pos-dock__item--active': activeView === 'coupons' }"
					@click="setSelectorView('coupons')"
				>
					<v-icon icon="mdi-ticket-percent-outline" size="20" />
					<span>{{ __("Coupons") }}</span>
				</button>
				<button
					type="button"
					class="mobile-pos-dock__item mobile-pos-dock__item--pay"
					:class="{ 'mobile-pos-dock__item--active': activeView === 'payment' }"
					@click="triggerInvoicePay"
				>
					<v-icon icon="mdi-credit-card-outline" size="20" />
					<span>{{ __("Pay") }}</span>
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import ItemsSelector from "../items/ItemsSelector.vue";
import Invoice from "../Invoice.vue";
import CounterGridHealthStrip from "./CounterGridHealthStrip.vue";
import OpeningDialog from "../shift/OpeningDialog.vue";
import Payments from "../Payments.vue";
import PosOffers from "../offers/PosOffers.vue";
import PosCoupons from "../offers/PosCoupons.vue";
import Drafts from "../flows/Drafts.vue";
import InvoiceManagement from "../flows/InvoiceManagement.vue";
import SalesOrders from "../flows/SalesOrders.vue";
import NewAddress from "../customer/NewAddress.vue";
import Variants from "../items/Variants.vue";
import Returns from "../flows/Returns.vue";
import MpesaPayments from "../payments/Mpesa-Payments.vue";
import { inject, ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import { usePosShift } from "../../../composables/pos/shared/usePosShift";
import { useOffers } from "../../../composables/pos/shared/useOffers";
// Import the cache cleanup function
import { clearExpiredCustomerBalances } from "../../../../offline/index";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useRtl } from "../../../composables/core/useRtl";
import { useUIStore } from "../../../stores/uiStore.js";
import { useInvoiceStore } from "../../../stores/invoiceStore.js";
import { useToastStore } from "../../../stores/toastStore";
import { storeToRefs } from "pinia";
import { useCustomerDisplayPublisher } from "../../../composables/pos/shared/useCustomerDisplayPublisher";
import { isCounterGridTemplate } from "../../../utils/posUiTemplate";
import { collectUnavailableCartItems } from "../../../utils/alternateCart";
import { shouldRedirectPosTabToItemSearch } from "../../../utils/keyboardNavigation";
import { shouldFocusCartQtyAfterItemAdd } from "../../../utils/cartFocusSettings";

export default {
	setup() {
		const eventBus = inject("eventBus");
		const dialog = ref(false);
		const invoicePanel = ref(null);
		const additionalDiscountField = ref(null);
		const mobileDock = ref(null);
		const responsive = useResponsive();
		const rtl = useRtl();
		const shift = usePosShift(() => {
			dialog.value = true;
		});
		const offers = useOffers();
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const toastStore = useToastStore();
		const __ = window.__;
		const { activeView, posProfile, paymentDialogOpen, stockSettings } = storeToRefs(uiStore);
		const {
			invoiceDoc,
			items: invoiceItems,
			itemsCount,
			totalQty,
			grossTotal,
			discountTotal,
			additionalDiscount,
			additionalDiscountPercentage,
			invoiceType,
		} = storeToRefs(invoiceStore);
		const usePaymentDialog = computed(() => responsive.windowWidth.value >= 992);
		const counterGridActive = computed(() =>
			isCounterGridTemplate(posProfile.value, responsive.windowWidth.value),
		);
		const useCompactPosSwitcher = computed(() => responsive.windowWidth.value < 1100);
		const compactPanel = ref("selector");
		const isPhone = computed(() => responsive.isPhone.value);
		const showBottomDock = computed(
			() => !counterGridActive.value && !dialog.value && responsive.windowWidth.value < 1100,
		);
		const counterItemSearchOpen = ref(false);
		const counterDirectEntryPending = ref(false);
		const counterItemSearchQuery = ref("");
		const counterItemsSelector = ref(null);
		const pendingCounterAddedLine = ref(null);
		const counterAlternateSources = ref([]);
		const counterAlternateSourceRowId = ref("");
		const counterAlternateRequest = computed(() => {
			if (!counterAlternateSourceRowId.value) return null;
			return (
				counterAlternateSources.value.find(
					(source) => source.row_id === counterAlternateSourceRowId.value,
				) || null
			);
		});
		const counterItemSearchTitle = computed(() =>
			counterAlternateRequest.value ? __("Choose an alternate item") : __("Find an item"),
		);
		const counterItemSearchSubtitle = computed(() => {
			const source = counterAlternateRequest.value;
			if (!source) return __("Search name, code, barcode, generic, company, pack or rack");
			return `${source.item_name || source.item_code} | ${__("Requested quantity")} ${source.qty}`;
		});
		const counterAuxiliaryOpen = computed(
			() => counterGridActive.value && ["offers", "coupons"].includes(activeView.value),
		);
		const bottomDockHeight = ref(0);
		let mobileDockObserver = null;
		const isEditingAdditionalDiscount = ref(false);
		const isEditingAdditionalDiscountPercentage = ref(false);
		const invoiceTotal = computed(() => {
			const liveSubtotal = Number(invoicePanel.value?.subtotal);
			if (Number.isFinite(liveSubtotal)) {
				return liveSubtotal;
			}

			const doc = invoiceDoc.value || {};
			const fallbackTotal = Number(grossTotal.value || 0);
			const rawValue = doc.rounded_total ?? doc.grand_total ?? doc.total ?? fallbackTotal;
			const numericValue = Number(rawValue);
			return Number.isFinite(numericValue) ? numericValue : fallbackTotal;
		});
		const activeCurrency = computed(() => invoiceDoc.value?.currency || posProfile.value?.currency || "");
		const formatCompactNumber = (value) =>
			new Intl.NumberFormat(undefined, {
				maximumFractionDigits: value % 1 === 0 ? 0 : 2,
			}).format(Number(value || 0));
		const getCurrencySymbol = (currency) => {
			const resolver = window.get_currency_symbol || globalThis.get_currency_symbol;
			if (typeof resolver === "function") {
				return resolver(currency || activeCurrency.value || "") || "";
			}
			return currency ? `${currency} ` : "";
		};
		const formattedCartTotal = computed(() => {
			const symbol = getCurrencySymbol(activeCurrency.value);
			return `${symbol}${formatCompactNumber(invoiceTotal.value)}`.trim();
		});
		const formattedDiscountTotal = computed(() => {
			const symbol = getCurrencySymbol(activeCurrency.value);
			return `${symbol}${formatCompactNumber(discountTotal.value || 0)} ${__("discount")}`.trim();
		});
		const cartMetaLabel = computed(() => {
			const qty = formatCompactNumber(totalQty.value || 0);
			const itemCount = formatCompactNumber(itemsCount.value || 0);
			return `${itemCount} ${__("lines")} | ${qty} ${__("qty")}`;
		});

		const discountPercentageOfferName = computed(
			() => invoicePanel.value?.discount_percentage_offer_name || null,
		);
		const showUnsignedReturnDiscount = computed(
			() =>
				!!invoicePanel.value?.return_discount_meta && !posProfile.value?.posa_use_percentage_discount,
		);
		const normalizeDiscountDisplay = (value) => {
			if (value === 0 || value === "0") {
				return "";
			}
			return value;
		};
		const normalizeAdditionalDiscountDisplay = (value) => {
			if (value === 0 || value === "0") {
				return "";
			}
			if (showUnsignedReturnDiscount.value) {
				const proratedValue = Number(invoicePanel.value?.return_discount_meta?.prorated_discount);
				if (Number.isFinite(proratedValue)) {
					return Math.abs(proratedValue);
				}
				const numericValue = Number(value);
				if (Number.isFinite(numericValue)) {
					return Math.abs(numericValue);
				}
			}
			return value;
		};
		const normalizeAdditionalDiscountInput = (value) => {
			if (showUnsignedReturnDiscount.value) {
				const numericValue = Number(value);
				if (Number.isFinite(numericValue)) {
					const originalStoredValue = Number(additionalDiscount.value);
					const sign = Math.sign(
						Number.isFinite(originalStoredValue) && originalStoredValue !== 0
							? originalStoredValue
							: -1,
					);
					return sign * Math.abs(numericValue);
				}
			}
			return value;
		};
		const additionalDiscountDisplay = ref(normalizeAdditionalDiscountDisplay(additionalDiscount.value));
		const additionalDiscountPercentageDisplay = ref(
			normalizeDiscountDisplay(additionalDiscountPercentage.value),
		);

		watch(
			() => [
				additionalDiscount.value,
				invoicePanel.value?.return_discount_meta?.prorated_discount,
				posProfile.value?.posa_use_percentage_discount,
			],
			([value]) => {
				if (!isEditingAdditionalDiscount.value) {
					additionalDiscountDisplay.value = normalizeAdditionalDiscountDisplay(value);
				}
			},
		);

		watch(additionalDiscountPercentage, (value) => {
			if (!isEditingAdditionalDiscountPercentage.value) {
				additionalDiscountPercentageDisplay.value = normalizeDiscountDisplay(value);
			}
		});

		const focusItemSearchField = () => {
			nextTick(() => {
				uiStore.triggerItemSearchFocus();
				eventBus?.emit?.("focus_item_search");
			});
		};

		const handlePaymentDialogUpdate = (value) => {
			if (value || !usePaymentDialog.value) {
				return;
			}
			uiStore.closePaymentDialog();
		};

		const handlePaymentDialogAfterLeave = () => {
			if (!usePaymentDialog.value) {
				return;
			}
			if (counterGridActive.value) {
				nextTick(() => invoicePanel.value?.focusCounterGridEntry?.());
				return;
			}
			focusItemSearchField();
		};

		const setCompactPanel = (panel) => {
			compactPanel.value = panel;
			if (panel === "selector" && activeView.value === "items") {
				focusItemSearchField();
			}
		};
		const setSelectorView = (view) => {
			compactPanel.value = "selector";
			uiStore.setActiveView(view);
			if (view === "items") {
				focusItemSearchField();
			}
		};
		const showInvoicePanel = () => {
			compactPanel.value = "invoice";
			if (activeView.value === "payment" && !usePaymentDialog.value) {
				uiStore.setActiveView("items");
			}
		};
		const showPaymentPanel = () => {
			compactPanel.value = "selector";
			if (usePaymentDialog.value) {
				uiStore.openPaymentDialog();
				uiStore.setActiveView("items");
				return;
			}
			uiStore.setActiveView("payment");
		};
		const triggerInvoicePay = () => {
			if (typeof invoicePanel.value?.handleShowPaymentRequest === "function") {
				invoicePanel.value.handleShowPaymentRequest();
				return;
			}
			if (typeof invoicePanel.value?.show_payment === "function") {
				invoicePanel.value.show_payment();
				return;
			}
			showPaymentPanel();
		};
		const resetCounterAlternateState = () => {
			counterAlternateSources.value = [];
			counterAlternateSourceRowId.value = "";
		};
		const closeCounterItemSearch = () => {
			counterItemSearchOpen.value = false;
		};
		const openCounterItemSearch = async (payload = {}) => {
			if (!counterGridActive.value) return;
			const query = typeof payload === "string" ? payload : payload?.query;
			const normalizedQuery = String(query || "").trim();
			if (!normalizedQuery || counterDirectEntryPending.value) return;

			counterDirectEntryPending.value = true;
			try {
				const directResult =
					await counterItemsSelector.value?.tryDirectCounterGridEntry?.(normalizedQuery);
				if (directResult?.handled) {
					if (directResult.addedLine) {
						invoicePanel.value?.clearCounterGridEntry?.();
						if (!shouldFocusCartQtyAfterItemAdd(posProfile.value)) {
							nextTick(() => invoicePanel.value?.focusCounterGridEntry?.());
						}
					} else {
						nextTick(() => invoicePanel.value?.focusCounterGridEntry?.());
					}
					return;
				}
			} finally {
				counterDirectEntryPending.value = false;
			}

			pendingCounterAddedLine.value = null;
			resetCounterAlternateState();
			counterItemSearchQuery.value = normalizedQuery;
			counterItemSearchOpen.value = true;
		};
		const openCartAlternates = () => {
			if (!counterGridActive.value) return;
			const sources = collectUnavailableCartItems(invoiceItems.value, {
				isReturn: Boolean(invoiceDoc.value?.is_return),
				translate: __,
				posProfile: posProfile.value,
				stockSettings: stockSettings.value,
				blockSaleBeyondAvailableQty: posProfile.value?.posa_block_sale_beyond_available_qty,
				deferStockValidationToPayment:
					invoiceType.value === "Order" || invoiceType.value === "Quotation",
			});
			if (!sources.length) {
				toastStore.show({
					title: invoiceItems.value?.length
						? __("All cart items have enough stock")
						: __("The cart is empty"),
					color: "info",
				});
				return;
			}
			pendingCounterAddedLine.value = null;
			counterItemSearchQuery.value = "";
			counterAlternateSources.value = sources;
			counterAlternateSourceRowId.value = sources[0].row_id;
			counterItemSearchOpen.value = true;
		};
		const handleCounterItemAdded = (line, alternateSelection = null) => {
			if (alternateSelection?.origin === "cart" && alternateSelection?.rowId) {
				invoiceStore.removeItemByRowId(alternateSelection.rowId);
				eventBus?.emit?.("apply_pricing_rules");
			}
			pendingCounterAddedLine.value = line || null;
			invoicePanel.value?.clearCounterGridEntry?.();
			counterItemSearchOpen.value = false;
		};
		const handleCounterAlternatesCancelled = () => {
			pendingCounterAddedLine.value = null;
			counterItemSearchOpen.value = false;
		};
		const handleCounterItemSearchAfterEnter = () => {
			nextTick(() => counterItemsSelector.value?.focusSearchInput?.());
		};
		const handleCounterItemSearchAfterLeave = () => {
			// A fast cashier can start the next lookup while the previous dialog is
			// still leaving. Do not let that stale transition erase the new query.
			if (counterItemSearchOpen.value) return;
			const line = pendingCounterAddedLine.value;
			pendingCounterAddedLine.value = null;
			counterItemSearchQuery.value = "";
			resetCounterAlternateState();
			if (line && shouldFocusCartQtyAfterItemAdd(posProfile.value)) {
				eventBus?.emit("focus_cart_item_qty", {
					item: line,
					rowId: line?.posa_row_id,
					itemCode: line?.item_code,
				});
				return;
			}
			invoicePanel.value?.focusCounterGridEntry?.();
		};
		const handleCounterAuxiliaryUpdate = (open) => {
			if (!open) uiStore.setActiveView("items");
		};
		const handleCounterAuxiliaryAfterLeave = () => {
			nextTick(() => invoicePanel.value?.focusCounterGridEntry?.());
		};
		const isSelectorViewActive = (view) => compactPanel.value === "selector" && activeView.value === view;
		const getFallbackBottomSpace = () => {
			const rawValue = responsive.responsiveStyles.value["--bottom-safe-space"];
			const parsed = Number.parseFloat(String(rawValue || "0"));
			return Number.isFinite(parsed) ? parsed : 24;
		};
		const updateBottomDockHeight = () => {
			const dockElement = mobileDock.value;
			if (!showBottomDock.value || !dockElement) {
				bottomDockHeight.value = 0;
				return;
			}
			bottomDockHeight.value = dockElement.offsetHeight + 20;
		};
		const layoutStyleOverrides = computed(() => {
			const fallbackBottomSpace = getFallbackBottomSpace();
			const effectiveBottomSpace = showBottomDock.value
				? Math.max(bottomDockHeight.value, fallbackBottomSpace)
				: fallbackBottomSpace;
			return {
				"--bottom-safe-space": `${effectiveBottomSpace}px`,
			};
		});
		const handleAdditionalDiscountUpdate = (value) => {
			invoiceStore.setAdditionalDiscount(normalizeAdditionalDiscountInput(value));
		};
		const handleAdditionalDiscountFocus = () => {
			isEditingAdditionalDiscount.value = true;
		};
		const handleAdditionalDiscountBlur = () => {
			isEditingAdditionalDiscount.value = false;
		};
		const handleAdditionalDiscountPercentageUpdate = (value) => {
			invoiceStore.setAdditionalDiscountPercentage(value);
		};
		const handleAdditionalDiscountPercentageFocus = () => {
			isEditingAdditionalDiscountPercentage.value = true;
		};
		const commitAdditionalDiscountPercentage = () => {
			invoicePanel.value?.update_discount_umount?.();
		};
		const handleAdditionalDiscountPercentageBlur = () => {
			isEditingAdditionalDiscountPercentage.value = false;
			commitAdditionalDiscountPercentage();
		};
		const focusAdditionalDiscountField = () => {
			const field = additionalDiscountField.value;
			field?.focus?.();
			field?.$el?.querySelector?.("input")?.focus?.();
		};
		const handlePosTabFocus = (event) => {
			if (
				!shouldRedirectPosTabToItemSearch(event, {
					counterGridActive: counterGridActive.value,
				})
			) {
				return;
			}

			event.preventDefault();
			focusItemSearchField();
		};

		useCustomerDisplayPublisher({
			posProfile,
			eventBus,
		});

		onMounted(() => {
			document.addEventListener("keydown", handlePosTabFocus, true);
			if (typeof window !== "undefined" && "ResizeObserver" in window) {
				mobileDockObserver = new ResizeObserver(() => {
					updateBottomDockHeight();
				});
			}
			if (eventBus) {
				eventBus.on("submit_closing_pos", (data) => {
					shift.submit_closing_pos(data);
				});
				eventBus.on("focus_additional_discount", focusAdditionalDiscountField);
				eventBus.on("set_compact_panel", setCompactPanel);
				eventBus.on("open_counter_item_search", openCounterItemSearch);
				eventBus.on("open_cart_alternates", openCartAlternates);
			}
			nextTick(() => {
				updateBottomDockHeight();
				if (mobileDockObserver && mobileDock.value) {
					mobileDockObserver.observe(mobileDock.value);
				}
				if (counterGridActive.value) {
					invoicePanel.value?.focusCounterGridEntry?.();
				}
			});
		});

		onBeforeUnmount(() => {
			document.removeEventListener("keydown", handlePosTabFocus, true);
			if (mobileDockObserver) {
				mobileDockObserver.disconnect();
				mobileDockObserver = null;
			}
			if (eventBus) {
				eventBus.off("submit_closing_pos");
				eventBus.off("focus_additional_discount", focusAdditionalDiscountField);
				eventBus.off("set_compact_panel", setCompactPanel);
				eventBus.off("open_counter_item_search", openCounterItemSearch);
				eventBus.off("open_cart_alternates", openCartAlternates);
			}
		});

		watch(usePaymentDialog, (enabled) => {
			if (enabled && activeView.value === "payment") {
				uiStore.openPaymentDialog();
				uiStore.setActiveView("items");
				return;
			}

			if (!enabled && paymentDialogOpen.value) {
				uiStore.closePaymentDialog();
				uiStore.setActiveView("payment");
			}
		});

		watch(counterGridActive, (enabled, wasEnabled) => {
			if (enabled && !wasEnabled) {
				nextTick(() => invoicePanel.value?.focusCounterGridEntry?.());
			}
		});

		watch(activeView, (view) => {
			if (!useCompactPosSwitcher.value) {
				return;
			}

			if (["items", "offers", "coupons", "payment"].includes(view)) {
				compactPanel.value = "selector";
			}
		});

		watch(useCompactPosSwitcher, (enabled) => {
			if (!enabled) {
				compactPanel.value = "selector";
				return;
			}

			if (["offers", "coupons", "payment"].includes(activeView.value)) {
				compactPanel.value = "selector";
			}
		});

		watch(counterGridActive, (enabled) => {
			if (!enabled) {
				counterItemSearchOpen.value = false;
				counterItemSearchQuery.value = "";
				pendingCounterAddedLine.value = null;
				resetCounterAlternateState();
			}
		});

		watch(
			[showBottomDock, () => responsive.windowWidth.value, () => responsive.windowHeight.value],
			() => {
				nextTick(() => {
					if (mobileDockObserver) {
						mobileDockObserver.disconnect();
						if (showBottomDock.value && mobileDock.value) {
							mobileDockObserver.observe(mobileDock.value);
						}
					}
					updateBottomDockHeight();
				});
			},
			{ immediate: true },
		);

		return {
			...responsive,
			...rtl,
			...shift,
			...offers,
			uiStore,
			invoiceStore,
			__,
			invoiceDoc,
			itemsCount,
			totalQty,
			formattedCartTotal,
			formattedDiscountTotal,
			cartMetaLabel,
			posProfile,
			additionalDiscountField,
			additionalDiscountDisplay,
			additionalDiscountPercentageDisplay,
			activeView,
			paymentDialogOpen,
			isPhone,
			usePaymentDialog,
			counterGridActive,
			counterItemSearchOpen,
			counterItemSearchQuery,
			counterAlternateSources,
			counterAlternateSourceRowId,
			counterAlternateRequest,
			counterItemSearchTitle,
			counterItemSearchSubtitle,
			counterAuxiliaryOpen,
			useCompactPosSwitcher,
			showBottomDock,
			layoutStyleOverrides,
			compactPanel,
			mobileDock,
			setCompactPanel,
			setSelectorView,
			showInvoicePanel,
			showPaymentPanel,
			triggerInvoicePay,
			isSelectorViewActive,
			handleAdditionalDiscountUpdate,
			handleAdditionalDiscountFocus,
			handleAdditionalDiscountBlur,
			handleAdditionalDiscountPercentageUpdate,
			handleAdditionalDiscountPercentageFocus,
			handleAdditionalDiscountPercentageBlur,
			commitAdditionalDiscountPercentage,
			handlePaymentDialogUpdate,
			handlePaymentDialogAfterLeave,
			handleCounterItemAdded,
			handleCounterAlternatesCancelled,
			handleCounterItemSearchAfterEnter,
			handleCounterItemSearchAfterLeave,
			closeCounterItemSearch,
			handleCounterAuxiliaryUpdate,
			handleCounterAuxiliaryAfterLeave,
			discountPercentageOfferName,
			getCurrencySymbol,
			invoicePanel,
			counterItemsSelector,
			eventBus,
			dialog,
		};
	},
	data: function () {
		return {};
	},

	components: {
		ItemsSelector,
		Invoice,
		CounterGridHealthStrip,
		OpeningDialog,
		Payments,
		Drafts,
		InvoiceManagement,

		Returns,
		PosOffers,
		PosCoupons,
		NewAddress,
		Variants,
		MpesaPayments,
		SalesOrders,
	},

	methods: {
		create_opening_voucher() {
			this.dialog = true;
		},
		get_pos_setting() {
			frappe.db.get_doc("POS Settings", undefined).then((_doc) => {
				// Update store directly instead of emitting event
				// If Payments.vue or others need this, they should watch uiStore.posSettings
				// For now, we assume uiStore.setStockSettings or similar is sufficient,
				// or we add a new generic settings store.
				// However, the original code used eventBus.emit("set_pos_settings", doc);
				// We'll attach it to uiStore if a suitable method exists, or just log for now as
				// clean separation implies components fetch what they need or use a centralized config store.
				// Assuming uiStore handles global config:
				// this.uiStore.setPosSettings(doc); // We might need to implement this if it doesn't exist
			});
		},
		// handleAddItem removed as ItemsSelector handles pos addition internally
		handleRegisterPosData(data) {
			this.pos_profile = data.pos_profile;
			this.get_offers(this.pos_profile.name, this.pos_profile);
			this.pos_opening_shift = data.pos_opening_shift;

			// Update Store
			this.uiStore.setRegisterData(data);
		},
		closeOpeningDialog() {
			this.dialog = false;
		},
	},

	mounted: function () {
		this.$nextTick(function () {
			this.check_opening_entry();
			this.get_pos_setting();

			// Watch store for updates
			this.$watch(
				() => this.uiStore.posProfile,
				(newProfile) => {
					if (newProfile && newProfile.name) {
						this.pos_profile = newProfile;
						this.get_offers(newProfile.name, newProfile);
					}
				},
				{ deep: true, immediate: true },
			);
		});
	},
	// In the created() or mounted() lifecycle hook
	created() {
		// Clean up expired customer balance cache on POS load
		clearExpiredCustomerBalances();
	},
};
</script>

<style scoped>
.payment-dialog :deep(.v-overlay__content) {
	max-height: calc(100dvh - 24px);
}

.dynamic-container {
	transition: padding 160ms ease;
	padding-bottom: calc(var(--bottom-safe-space) + var(--dynamic-xs));
	min-width: 0;
}

.pos-main-container--counter-grid {
	--counter-rugged-navy: #09253d;
	--counter-rugged-navy-raised: #174a70;
	--counter-rugged-blue: #0f70d7;
	--counter-rugged-cyan: #38bdf8;
	--counter-rugged-green: #079b55;
	--counter-rugged-red: #dc343d;
	--counter-rugged-line: var(--pos-outline);
	--counter-rugged-soft-line: var(--pos-border);
	--counter-rugged-surface: var(--pos-card-bg);
	--counter-rugged-muted: var(--pos-surface-muted);
	padding: 0;
	height: calc(100vh - 64px);
	height: calc(100dvh - 64px);
	min-height: 0;
	overflow: hidden;
}

.counter-grid-pos {
	display: grid;
	grid-template-rows: minmax(0, 1fr) 34px;
	height: 100%;
	min-height: 0;
	background: var(--pos-surface-muted);
}

.counter-item-search-surface,
.counter-auxiliary-surface {
	--counter-rugged-navy: #09253d;
	--counter-rugged-navy-raised: #174a70;
	--counter-rugged-blue: #0f70d7;
	--counter-rugged-cyan: #38bdf8;
	--counter-rugged-line: var(--pos-outline);
	--counter-rugged-surface: var(--pos-card-bg);
	--counter-rugged-muted: var(--pos-surface-muted);
	display: flex;
	flex-direction: column;
	width: 100%;
	max-height: calc(100vh - 24px);
	max-height: calc(100dvh - 24px);
	min-height: 0;
	overflow: hidden;
	border: 3px solid var(--counter-rugged-navy);
	border-radius: 5px;
	background: var(--counter-rugged-muted);
	box-shadow: 0 5px 14px rgba(4, 22, 37, 0.34);
}

.counter-item-search-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	min-height: 62px;
	padding: 8px 10px 8px 16px;
	border-bottom: 2px solid var(--counter-rugged-cyan);
	background: var(--counter-rugged-navy);
}

.counter-item-search-header__copy {
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-width: 0;
}

.counter-item-search-header strong {
	font-size: 1rem;
	color: #ffffff;
}

.counter-item-search-header__copy span {
	overflow: hidden;
	color: #d6e7f3;
	font-size: 0.78rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.counter-item-search-header :deep(.v-btn) {
	border-radius: 3px !important;
	color: #ffffff !important;
}

.counter-item-search-header :deep(.v-btn:hover) {
	background: #174a70 !important;
}

.counter-item-search-header__source {
	flex: 0 1 420px;
	max-width: 420px;
}

.counter-item-search-header__source :deep(.v-field) {
	border-radius: 3px;
	background: var(--pos-input-bg);
	color: var(--pos-text-primary);
}

.counter-item-search-surface :deep(.items-selector-shell) {
	flex: 1 1 auto;
	min-height: 0;
	height: min(760px, calc(100vh - 96px));
	height: min(760px, calc(100dvh - 96px));
	overflow: hidden;
}

.counter-item-search-surface :deep(.selection-card) {
	height: 100% !important;
	max-height: 100% !important;
	margin-top: 0 !important;
	border: 0;
	border-radius: 0;
	box-shadow: none;
	resize: none !important;
	background: var(--counter-rugged-muted) !important;
}

.dynamic-main-row {
	padding: 4px;
	margin: 0;
}

.dynamic-main-row--phone {
	align-items: stretch;
}

.dynamic-col {
	padding: clamp(6px, 0.8vw, 12px);
	transition: padding 160ms ease;
	margin-top: 0;
}

.dynamic-col--selector,
.dynamic-col--invoice {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
}

.mobile-pos-stack {
	position: fixed;
	left: max(10px, env(safe-area-inset-left));
	right: max(10px, env(safe-area-inset-right));
	bottom: max(10px, env(safe-area-inset-bottom));
	display: flex;
	flex-direction: column;
	gap: 10px;
	z-index: 20;
}

.mobile-sale-dock,
.mobile-pos-dock {
	padding: 10px;
	border-radius: var(--pos-radius-lg);
	background: color-mix(in srgb, var(--pos-card-bg) 94%, transparent);
	backdrop-filter: blur(16px);
	box-shadow: var(--pos-elevation-3);
	border: 1px solid var(--pos-border);
}

.mobile-sale-dock {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
	gap: 12px;
	align-items: center;
}

.mobile-sale-dock__copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.mobile-sale-dock__eyebrow {
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.mobile-sale-dock__amount {
	font-size: clamp(1.05rem, 2vw, 1.5rem);
	line-height: 1.1;
	color: var(--pos-text-primary);
}

.mobile-sale-dock__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 12px;
	font-size: 0.82rem;
	color: var(--pos-text-secondary);
}

.mobile-sale-dock__field :deep(.v-field) {
	background: rgba(var(--v-theme-surface), 0.92);
}

.mobile-pos-dock {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 8px;
}

.mobile-pos-dock__item {
	position: relative;
	border: 0;
	border-radius: 18px;
	background: transparent;
	min-width: 0;
	min-height: 58px;
	padding: 8px 4px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	font: inherit;
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--pos-text-secondary);
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		color 0.18s ease,
		transform 0.18s ease;
}

.mobile-pos-dock__item span {
	display: block;
	width: 100%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	text-align: center;
}

.mobile-pos-dock__item--active {
	background: rgba(var(--v-theme-primary), 0.12);
	color: rgb(var(--v-theme-primary));
}

.mobile-pos-dock__item--pay.mobile-pos-dock__item--active {
	background: rgba(var(--v-theme-success), 0.16);
	color: rgb(var(--v-theme-success));
}

:deep(.v-theme--dark) .mobile-sale-dock,
:deep(.v-theme--dark) .mobile-pos-dock,
:deep([data-theme="dark"]) .mobile-sale-dock,
:deep([data-theme="dark"]) .mobile-pos-dock,
:deep([data-theme-mode="dark"]) .mobile-sale-dock,
:deep([data-theme-mode="dark"]) .mobile-pos-dock {
	background: color-mix(in srgb, var(--pos-card-bg) 94%, transparent);
	box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
	border-color: rgba(255, 255, 255, 0.08);
}

:deep(.v-theme--dark) .mobile-pos-dock__item--active,
:deep([data-theme="dark"]) .mobile-pos-dock__item--active,
:deep([data-theme-mode="dark"]) .mobile-pos-dock__item--active {
	background: rgba(var(--v-theme-primary), 0.2);
}

:deep(.v-theme--dark) .mobile-pos-dock__item--pay.mobile-pos-dock__item--active,
:deep([data-theme="dark"]) .mobile-pos-dock__item--pay.mobile-pos-dock__item--active,
:deep([data-theme-mode="dark"]) .mobile-pos-dock__item--pay.mobile-pos-dock__item--active {
	background: rgba(var(--v-theme-success), 0.22);
}

.mobile-pos-dock__item:active {
	transform: scale(0.98);
}

.mobile-pos-dock__pill {
	position: absolute;
	top: 4px;
	right: 10px;
	min-width: 18px;
	height: 18px;
	padding: 0 5px;
	border-radius: 999px;
	background: rgb(var(--v-theme-primary));
	color: #fff;
	font-size: 0.68rem;
	line-height: 18px;
	text-align: center;
}

@media (max-width: 768px) {
	.dynamic-container {
		padding-top: var(--dynamic-xs);
		padding-bottom: calc(var(--bottom-safe-space) + 4px);
	}

	.dynamic-col {
		padding: var(--dynamic-xs);
		margin-top: var(--dynamic-xs);
	}
}

@media (max-width: 560px) {
	.mobile-sale-dock {
		grid-template-columns: 1fr;
	}

	.mobile-sale-dock,
	.mobile-pos-dock {
		padding: 8px;
	}

	.mobile-pos-dock {
		gap: 6px;
	}

	.mobile-pos-dock__item {
		min-height: 52px;
		font-size: 0.65rem;
	}
}
</style>
