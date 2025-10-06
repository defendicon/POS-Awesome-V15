// Main entry point - re-exports all functions for backward compatibility

// Core exports
export {
	db,
	initPromise,
	persist,
	addToPersistQueue,
	checkDbHealth,
	initPersistWorker,
	terminatePersistWorker,
} from "./core.js";

// Cache exports
export {
        memory,
        memoryInitPromise,
        getStoredItems,
        getStoredItemsCount,
        saveItems,
        clearStoredItems,
	getCustomerStorage,
	setCustomerStorage,
	getItemsLastSync,
	setItemsLastSync,
	getCustomersLastSync,
	setCustomersLastSync,
	getSalesPersonsStorage,
	setSalesPersonsStorage,
	getOpeningStorage,
	setOpeningStorage,
	clearOpeningStorage,
        getOpeningDialogStorage,
        setOpeningDialogStorage,
        getTaxTemplate,
        setTaxTemplate,
        getPrintTemplate,
        setPrintTemplate,
        getTermsAndConditions,
        setTermsAndConditions,
        setLastSyncTotals,
        getLastSyncTotals,
        getTaxInclusiveSetting,
        setTaxInclusiveSetting,
        isManualOffline,
	setManualOffline,
	toggleManualOffline,
	queueHealthCheck,
	purgeOldQueueEntries,
	MAX_QUEUE_ITEMS,
	resetOfflineState,
	reduceCacheUsage,
	clearAllCache,
	forceClearAllCache,
	getCacheUsageEstimate,
	isCacheReady,
} from "./cache.js";

// Stock exports
export {
	initializeStockCache,
	isStockCacheReady,
	setStockCacheReady,
	validateStockForOfflineInvoice,
	updateLocalStock,
	getLocalStock,
	updateLocalStockCache,
	clearLocalStockCache,
	getLocalStockCache,
	setLocalStockCache,
	fetchItemStockQuantities,
	updateLocalStockWithActualQuantities,
} from "./stock.js";

// Sync exports
export {
	isOffline,
	saveOfflineInvoice,
	getOfflineInvoices,
	clearOfflineInvoices,
	deleteOfflineInvoice,
	getPendingOfflineInvoiceCount,
	saveOfflinePayment,
	getOfflinePayments,
	clearOfflinePayments,
	deleteOfflinePayment,
	getPendingOfflinePaymentCount,
	saveOfflineCustomer,
	updateOfflineInvoicesCustomer,
	getOfflineCustomers,
	clearOfflineCustomers,
	syncOfflineInvoices,
	syncOfflineCustomers,
	syncOfflinePayments,
} from "./sync.js";

// Items exports
export {
	saveItemUOMs,
	getItemUOMs,
	saveOffers,
	getCachedOffers,
	savePriceListItems,
	getCachedPriceListItems,
	clearPriceListCache,
	saveItemDetailsCache,
	getCachedItemDetails,
	saveItemsBulk,
	getAllStoredItems,
	searchStoredItems,
} from "./items.js";

export { saveItemGroups, getCachedItemGroups, clearItemGroups } from "./item_groups.js";

// Customers exports
export {
	saveCustomerBalance,
	getCachedCustomerBalance,
	clearCustomerBalanceCache,
	clearExpiredCustomerBalances,
} from "./customers.js";

// Coupons exports
export { saveCoupons, getCachedCoupons, clearCoupons } from "./coupons.js";

// Translation cache exports
export { getTranslationsCache, saveTranslationsCache } from "./cache.js";
