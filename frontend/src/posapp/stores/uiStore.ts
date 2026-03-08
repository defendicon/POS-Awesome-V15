import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { POSProfile } from "../types/models";

const DENSITY_STORAGE_KEY = "posa_ui_density";
const DENSITY_COMPACT_CLASS = "pos-density-compact";
const DENSITY_COMFORTABLE_CLASS = "pos-density-comfortable";
const LAYOUT_PROFILE_STORAGE_KEY = "posa_layout_profile";
const LAYOUT_CASHIER_CLASS = "pos-layout-cashier";
const LAYOUT_MANAGER_CLASS = "pos-layout-manager";
const LAYOUT_KIOSK_CLASS = "pos-layout-kiosk";

type DensityMode = "comfortable" | "compact";
type LayoutProfile = "cashier" | "manager" | "kiosk";

function readDensityMode(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function persistDensityMode(mode: DensityMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, mode);
  } catch {
    // Ignore localStorage write errors
  }
}

function applyDensityClass(mode: DensityMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove(DENSITY_COMPACT_CLASS, DENSITY_COMFORTABLE_CLASS);
  root.classList.add(mode === "compact" ? DENSITY_COMPACT_CLASS : DENSITY_COMFORTABLE_CLASS);
}

function readLayoutProfile(): LayoutProfile {
  if (typeof window === "undefined") return "cashier";
  try {
    const stored = window.localStorage.getItem(LAYOUT_PROFILE_STORAGE_KEY);
    if (stored === "manager" || stored === "kiosk") return stored;
    return "cashier";
  } catch {
    return "cashier";
  }
}

function persistLayoutProfile(profile: LayoutProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_PROFILE_STORAGE_KEY, profile);
  } catch {
    // Ignore localStorage write errors
  }
}

function applyLayoutProfileClass(profile: LayoutProfile) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove(LAYOUT_CASHIER_CLASS, LAYOUT_MANAGER_CLASS, LAYOUT_KIOSK_CLASS);
  if (profile === "manager") {
    root.classList.add(LAYOUT_MANAGER_CLASS);
    return;
  }
  if (profile === "kiosk") {
    root.classList.add(LAYOUT_KIOSK_CLASS);
    return;
  }
  root.classList.add(LAYOUT_CASHIER_CLASS);
}

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
  const draftsDialog = ref(false);
  const draftsData = ref<any[]>([]);

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

  const openInvoiceManagement = () => {
    invoiceManagementDialog.value = true;
  };

  const closeInvoiceManagement = () => {
    invoiceManagementDialog.value = false;
  };

  const paymentRouteTarget = ref<any | null>(null);

  const setPaymentRouteTarget = (target: any | null) => {
    paymentRouteTarget.value = target || null;
  };

  const clearPaymentRouteTarget = () => {
    paymentRouteTarget.value = null;
  };

  const openDrafts = (data?: any[]) => {
    draftsData.value = data || [];
    draftsDialog.value = true;
  };

  const closeDrafts = () => {
    draftsDialog.value = false;
  };

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

  // UI Density
  const densityMode = ref<DensityMode>(readDensityMode());
  const setDensityMode = (mode: DensityMode) => {
    const normalized: DensityMode = mode === "compact" ? "compact" : "comfortable";
    densityMode.value = normalized;
    persistDensityMode(normalized);
    applyDensityClass(normalized);
  };
  const toggleDensityMode = () => {
    setDensityMode(densityMode.value === "compact" ? "comfortable" : "compact");
  };

  // Keyboard Shortcuts Help
  const shortcutHelpOpen = ref(false);
  const openShortcutHelp = () => {
    shortcutHelpOpen.value = true;
  };
  const closeShortcutHelp = () => {
    shortcutHelpOpen.value = false;
  };
  const toggleShortcutHelp = () => {
    shortcutHelpOpen.value = !shortcutHelpOpen.value;
  };

  // Layout Profile
  const layoutProfile = ref<LayoutProfile>(readLayoutProfile());
  const setLayoutProfile = (profile: LayoutProfile) => {
    const normalized: LayoutProfile =
      profile === "manager" || profile === "kiosk" ? profile : "cashier";
    layoutProfile.value = normalized;
    persistLayoutProfile(normalized);
    applyLayoutProfileClass(normalized);
  };
  const cycleLayoutProfile = () => {
    const next: LayoutProfile =
      layoutProfile.value === "cashier"
        ? "manager"
        : layoutProfile.value === "manager"
          ? "kiosk"
          : "cashier";
    setLayoutProfile(next);
  };

  // Workflow heatmap metrics
  const workflowStepCounts = ref<Record<string, number>>({
    item_search: 0,
    item_select: 0,
    invoice_save: 0,
    checkout_open: 0,
    payment_submit: 0,
    sync_action: 0,
    error_event: 0,
  });
  const workflowLastStepAt = ref<Record<string, number>>({});
  const workflowStepDurations = ref<Record<string, number[]>>({});
  const trackWorkflowStep = (step: string) => {
    const key = String(step || "").trim();
    if (!key) return;
    const now = Date.now();
    workflowStepCounts.value[key] = Number(workflowStepCounts.value[key] || 0) + 1;
    const prev = workflowLastStepAt.value[key];
    if (Number.isFinite(prev)) {
      const delta = Math.max(0, now - Number(prev));
      const bucket = workflowStepDurations.value[key] || [];
      bucket.push(delta);
      if (bucket.length > 100) {
        bucket.splice(0, bucket.length - 100);
      }
      workflowStepDurations.value[key] = bucket;
    }
    workflowLastStepAt.value[key] = now;
  };
  const resetWorkflowMetrics = () => {
    workflowStepCounts.value = {
      item_search: 0,
      item_select: 0,
      invoice_save: 0,
      checkout_open: 0,
      payment_submit: 0,
      sync_action: 0,
      error_event: 0,
    };
    workflowLastStepAt.value = {};
    workflowStepDurations.value = {};
  };

  watch(activeView, (view, previous) => {
    if (view === previous) return;
    if (view === "payment") {
      trackWorkflowStep("checkout_open");
      return;
    }
    if (view === "items") {
      trackWorkflowStep("item_search");
      return;
    }
    if (view === "offers" || view === "coupons") {
      trackWorkflowStep("promo_browse");
    }
  });

  // Ensure initial density class is applied at store creation time.
  applyDensityClass(densityMode.value);
  applyLayoutProfileClass(layoutProfile.value);

  return {
    isLoading,
    loadingText,
    isFrozen,
    freezeTitle,
    freezeMessage,
    activeView,
    paymentDialogOpen,
    invoiceManagementDialog,
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
    openDrafts,
    closeDrafts,
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
    densityMode,
    setDensityMode,
    toggleDensityMode,
    shortcutHelpOpen,
    openShortcutHelp,
    closeShortcutHelp,
    toggleShortcutHelp,
    layoutProfile,
    setLayoutProfile,
    cycleLayoutProfile,
    workflowStepCounts,
    workflowStepDurations,
    trackWorkflowStep,
    resetWorkflowMetrics,
  };
});
