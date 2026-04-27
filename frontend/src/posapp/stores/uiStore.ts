/**
 * Central UI state bus for the POS main view.
 *
 * **Loading vs. freeze overlays**
 * Two distinct blocking states exist:
 * - `isLoading` / `loadingText` — non-blocking spinner shown during async work.
 * - `isFrozen` / `freezeTitle` / `freezeMessage` — blocks all user interaction
 *   (e.g. during payment submission). Managed via `freeze()` / `unfreeze()`.
 *
 * **Active view**
 * `activeView` drives the main content panel: `"items"` | `"payment"` |
 * `"offers"` | `"coupons"`. Updated via `setActiveView()`.
 *
 * **POS session data**
 * `posProfile`, `stockSettings`, `companyDoc`, and `posOpeningShift` are set once
 * at register boot through `setRegisterData()`. `currency` and `company` are
 * derived computed properties from `posProfile`.
 *
 * **Dialog triggers**
 * Dialogs are opened and closed through dedicated action pairs:
 * `openPaymentDialog` / `closePaymentDialog`, `openInvoiceManagement` /
 * `closeInvoiceManagement`, `openDrafts` / `closeDrafts`, `openOrders` /
 * `closeOrders`, `openNewAddress` / `closeNewAddress`, `openMpesaPayments` /
 * `closeMpesaPayments`, `openVariants` / `closeVariants`.
 *
 * **Counter-based triggers**
 * Some side effects are driven by incrementing a counter ref rather than emitting
 * events, to avoid Vue event-bus coupling:
 * - `searchFocusTrigger` (via `triggerItemSearchFocus()`) — focuses the item search input.
 * - `forceReloadTrigger` (via `triggerForceReloadItems()`) — forces the item list to reload.
 * - `triggerTopItemSelection` (via `selectTopItem()`) — selects the first item in the list.
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { POSProfile } from "../types/models";

export const useUIStore = defineStore("ui", () => {
  // Loading Overlay State
  const isLoading = ref(false);
  const loadingText = ref("Loading...");

  // Freeze Dialog State (Blocking UI)
  const isFrozen = ref(false);
  const freezeTitle = ref("");
  const freezeMessage = ref("");

  // Main POS View State (Active View)
  const activeView = ref<string>("items"); // 'items', 'payment', 'offers', 'coupons'
  const paymentDialogOpen = ref(false);

  const invoiceManagementDialog = ref(false);
  const invoiceManagementTargetTab = ref<string>("history");
  const invoiceManagementDraftSource = ref<string>("invoice");
  const draftsDialog = ref(false);
  const draftsData = ref<any[]>([]);
  const parkedOrders = ref<any[]>([]);
  const draftSource = ref<string>("invoice");

  const ordersDialog = ref(false);
  const ordersData = ref<any[]>([]);

  const setActiveView = (view: string) => {
    activeView.value = view;
  };

  const openPaymentDialog = () => {
    paymentDialogOpen.value = true;
  };

  const closePaymentDialog = () => {
    paymentDialogOpen.value = false;
  };

  const openInvoiceManagement = (targetTab: string = "history", draftSourceKey: string = "invoice") => {
    invoiceManagementTargetTab.value = targetTab || "history";
    invoiceManagementDraftSource.value = draftSourceKey || "invoice";
    invoiceManagementDialog.value = true;
  };

  const closeInvoiceManagement = () => {
    invoiceManagementDialog.value = false;
    invoiceManagementTargetTab.value = "history";
    invoiceManagementDraftSource.value = "invoice";
  };

  const paymentRouteTarget = ref<any | null>(null);

  const setPaymentRouteTarget = (target: any | null) => {
    paymentRouteTarget.value = target || null;
  };

  const clearPaymentRouteTarget = () => {
    paymentRouteTarget.value = null;
  };

  const openDrafts = (data?: any[], sourceKey: string = "invoice") => {
    const nextDrafts = Array.isArray(data) ? data : [];
    draftSource.value = sourceKey || "invoice";
    draftsData.value = nextDrafts;
    parkedOrders.value = nextDrafts;
    draftsDialog.value = true;
  };

  const closeDrafts = () => {
    draftsDialog.value = false;
  };

  const setDraftsData = (data?: any[]) => {
    draftsData.value = Array.isArray(data) ? data : [];
  };

  const setParkedOrders = (data?: any[]) => {
    parkedOrders.value = Array.isArray(data) ? data : [];
  };

  const setDraftSource = (sourceKey?: string) => {
    draftSource.value = sourceKey || "invoice";
  };

  const setInvoiceManagementDraftSource = (sourceKey?: string) => {
    invoiceManagementDraftSource.value = sourceKey || "invoice";
  };

  const parkedOrdersCount = computed(() => parkedOrders.value.length);
  const hasParkedOrders = computed(() => parkedOrdersCount.value > 0);

  const openOrders = (data?: any[]) => {
    ordersData.value = data || [];
    ordersDialog.value = true;
  };

  const closeOrders = () => {
    ordersDialog.value = false;
  };

  function setLoading(active: boolean, text: string = "Loading...") {
    isLoading.value = active;
    loadingText.value = text;
  }

  function freeze(title?: string, message?: string) {
    freezeTitle.value = title || "Processing";
    freezeMessage.value = message || "Please wait...";
    isFrozen.value = true;
  }

  function unfreeze() {
    isFrozen.value = false;
    freezeTitle.value = "";
    freezeMessage.value = "";
  }

  // POS Profile & Settings
  const posProfile = ref<POSProfile | null>(null);
  const stockSettings = ref<Record<string, any>>({});
  const companyDoc = ref<any>(null);
  const posOpeningShift = ref<any>(null);

  const currency = computed(() => posProfile.value?.currency || "");
  const company = computed(() => posProfile.value?.company || "");

  function setPosProfile(profile: POSProfile) {
    posProfile.value = profile;
  }

  function setStockSettings(settings: Record<string, any>) {
    stockSettings.value = settings || {};
  }

  function setCompanyDoc(doc: any) {
    companyDoc.value = doc;
  }

  function setRegisterData(data: { pos_profile?: POSProfile; stock_settings?: any; company?: any; pos_opening_shift?: any }) {
    if (data.pos_profile) posProfile.value = data.pos_profile;
    if (data.stock_settings) stockSettings.value = data.stock_settings;
    if (data.company) companyDoc.value = data.company;
    if (data.pos_opening_shift) posOpeningShift.value = data.pos_opening_shift;
  }

  const lastInvoiceId = ref<string | null>(null);
  function setLastInvoice(id: string | null) {
    lastInvoiceId.value = id;
  }

  const lastStockAdjustment = ref<any>(null);
  function setLastStockAdjustment(doc: any) {
    lastStockAdjustment.value = doc;
  }

  const offers = ref<any[]>([]);
  function setOffers(data: any[]) {
    offers.value = data || [];
  }
  const applicableOffers = ref<any[]>([]);
  function setApplicableOffers(data: any[]) {
    applicableOffers.value = data || [];
  }

  // Dialogs & Focus Triggers
  const searchFocusTrigger = ref(0);
  const newAddressDialog = ref(false);
  const newAddressCustomer = ref<any>(null);

  const mpesaDialog = ref(false);
  const mpesaData = ref<any>(null);

  const variantsDialog = ref(false);
  const variantsData = ref<any>(null);

  function triggerItemSearchFocus() {
    searchFocusTrigger.value++;
  }

  function openNewAddress(customer: any) {
    newAddressCustomer.value = customer;
    newAddressDialog.value = true;
  }

  function closeNewAddress() {
    newAddressDialog.value = false;
    newAddressCustomer.value = null;
  }

  function openMpesaPayments(data: any) {
    mpesaData.value = data;
    mpesaDialog.value = true;
  }

  function closeMpesaPayments() {
    mpesaDialog.value = false;
    mpesaData.value = null;
  }

  function openVariants(data: any) {
    variantsData.value = data;
    variantsDialog.value = true;
  }

  function closeVariants() {
    variantsDialog.value = false;
    variantsData.value = null;
  }

  const draggedItem = ref<any>(null);
  function setDraggedItem(item: any) {
    draggedItem.value = item;
  }

  const offersCount = ref(0);
  const appliedOffersCount = ref(0);
  function setOfferCounts(total: number, applied: number) {
    offersCount.value = total;
    appliedOffersCount.value = applied;
  }

  const couponsCount = ref(0);
  const appliedCouponsCount = ref(0);
  function setCouponCounts(total: number, applied: number) {
    couponsCount.value = total;
    appliedCouponsCount.value = applied;
  }

  const showItemSettings = ref(false);
  function toggleItemSettings() {
    showItemSettings.value = !showItemSettings.value;
  }
  function setItemSettings(value: boolean) {
    showItemSettings.value = value;
  }

  const triggerTopItemSelection = ref(0);
  function selectTopItem() {
    triggerTopItemSelection.value++;
  }

  const forceReloadTrigger = ref(0);
  function triggerForceReloadItems() {
    forceReloadTrigger.value++;
  }

  return {
    isLoading,
    loadingText,
    isFrozen,
    freezeTitle,
    freezeMessage,
    activeView,
    paymentDialogOpen,
    invoiceManagementDialog,
    invoiceManagementTargetTab,
    invoiceManagementDraftSource,
    paymentRouteTarget,
    setActiveView,
    openPaymentDialog,
    closePaymentDialog,
    openInvoiceManagement,
    closeInvoiceManagement,
    setPaymentRouteTarget,
    clearPaymentRouteTarget,
    draftsDialog,
    draftsData,
    parkedOrders,
    draftSource,
    parkedOrdersCount,
    hasParkedOrders,
    openDrafts,
    closeDrafts,
    setDraftsData,
    setParkedOrders,
    setDraftSource,
    setInvoiceManagementDraftSource,
    ordersDialog,
    ordersData,
    openOrders,
    closeOrders,
    posProfile,
    stockSettings,
    companyDoc,
    posOpeningShift,
    lastInvoiceId,
    offers,
    applicableOffers,
    currency,
    company,
    setLoading,
    freeze,
    unfreeze,
    setPosProfile,
    setStockSettings,
    setCompanyDoc,
    setRegisterData,
    setLastInvoice,
    setOffers,
    setApplicableOffers,
    searchFocusTrigger,
    triggerItemSearchFocus,
    newAddressDialog,
    newAddressCustomer,
    openNewAddress,
    closeNewAddress,
    mpesaDialog,
    mpesaData,
    openMpesaPayments,
    closeMpesaPayments,
    variantsDialog,
    variantsData,
    openVariants,
    closeVariants,
    draggedItem,
    setDraggedItem,
    offersCount,
    appliedOffersCount,
    setOfferCounts,
    couponsCount,
    appliedCouponsCount,
    setCouponCounts,
    showItemSettings,
    toggleItemSettings,
    setItemSettings,
    triggerTopItemSelection,
    selectTopItem,
    forceReloadTrigger,
    triggerForceReloadItems,
    lastStockAdjustment,
    setLastStockAdjustment,
  };
});
