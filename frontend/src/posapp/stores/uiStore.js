import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useUIStore = defineStore("ui", () => {
	// Loading Overlay State
	const isLoading = ref(false);
	const loadingText = ref("Loading...");

	// Freeze Dialog State (Blocking UI)
	const isFrozen = ref(false);
	const freezeTitle = ref("");
	const freezeMessage = ref("");

	// Main POS View State	// Active View (for handling back button)
	const activeView = ref("items"); // 'items', 'payment', 'offers', 'coupons'

	const draftsDialog = ref(false);
	const draftsData = ref([]);

	const ordersDialog = ref(false);
	const ordersData = ref([]);

	const setActiveView = (view) => {
		activeView.value = view;
	};

	const openDrafts = (data) => {
		draftsData.value = data || [];
		draftsDialog.value = true;
	};

	const closeDrafts = () => {
		draftsDialog.value = false;
	};

	const openOrders = (data) => {
		ordersData.value = data || [];
		ordersDialog.value = true;
	};

	const closeOrders = () => {
		ordersDialog.value = false;
	};

	function setLoading(active, text = "Loading...") {
		isLoading.value = active;
		loadingText.value = text;
	}

	function freeze(title, message) {
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
	const posProfile = ref(null);
	const stockSettings = ref({});
	const companyDoc = ref(null);
	const posOpeningShift = ref(null);

	const currency = computed(() => posProfile.value?.currency || "");
	const company = computed(() => posProfile.value?.company || "");

	function setPosProfile(profile) {
		posProfile.value = profile;
	}

	function setStockSettings(settings) {
		stockSettings.value = settings || {};
	}

	function setCompanyDoc(doc) {
		companyDoc.value = doc;
	}

	function setRegisterData(data) {
		if (data.pos_profile) posProfile.value = data.pos_profile;
		if (data.stock_settings) stockSettings.value = data.stock_settings;
		if (data.company) companyDoc.value = data.company;
		if (data.pos_opening_shift) posOpeningShift.value = data.pos_opening_shift;
	}

	const lastInvoiceId = ref(null);
	function setLastInvoice(id) {
		lastInvoiceId.value = id;
	}

	const lastStockAdjustment = ref(null);
	function setLastStockAdjustment(doc) {
		lastStockAdjustment.value = doc;
	}

	const offers = ref([]);
	function setOffers(data) {
		offers.value = data || [];
	}

	// Dialogs & Focus Triggers
	const searchFocusTrigger = ref(0); // Increment to trigger focus
	const newAddressDialog = ref(false);
	const newAddressCustomer = ref(null);

	const mpesaDialog = ref(false);
	const mpesaData = ref(null);

	const variantsDialog = ref(false);
	const variantsData = ref(null);

	function triggerItemSearchFocus() {
		searchFocusTrigger.value++;
	}

	function openNewAddress(customer) {
		newAddressCustomer.value = customer;
		newAddressDialog.value = true;
	}

	function closeNewAddress() {
		newAddressDialog.value = false;
		newAddressCustomer.value = null;
	}

	function openMpesaPayments(data) {
		mpesaData.value = data;
		mpesaDialog.value = true;
	}

	function closeMpesaPayments() {
		mpesaDialog.value = false;
		mpesaData.value = null;
	}

	function openVariants(data) {
		variantsData.value = data; // { item, items, profile, attrsMeta }
		variantsDialog.value = true;
	}

	function closeVariants() {
		variantsDialog.value = false;
		variantsData.value = null;
	}

	const draggedItem = ref(null);
	function setDraggedItem(item) {
		draggedItem.value = item;
	}

	const offersCount = ref(0);
	const appliedOffersCount = ref(0);
	function setOfferCounts(total, applied) {
		offersCount.value = total;
		appliedOffersCount.value = applied;
	}

	const couponsCount = ref(0);
	const appliedCouponsCount = ref(0);
	function setCouponCounts(total, applied) {
		couponsCount.value = total;
		appliedCouponsCount.value = applied;
	}

	const showItemSettings = ref(false);
	function toggleItemSettings() {
		showItemSettings.value = !showItemSettings.value;
	}
	function setItemSettings(value) {
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
		setActiveView,
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
		// New additions
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
