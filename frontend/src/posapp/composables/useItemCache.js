const ITEM_DETAIL_CACHE_TTL = 5000;
const STOCK_CACHE_TTL = 5000;

export function useItemCache() {
    const _getItemDetailCacheKey = (item, pos_profile) => {
        const code = item?.item_code;
        const warehouse = item?.warehouse || pos_profile?.warehouse;
        if (!code || !warehouse) {
            return null;
        }
        return `${code}::${warehouse}`;
    };

    const _getCachedItemDetail = (key, item_detail_cache) => {
        if (!key) {
            return null;
        }
        const cache = item_detail_cache || {};
        const entry = cache[key];
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.ts > ITEM_DETAIL_CACHE_TTL) {
            delete cache[key];
            return null;
        }
        return entry.data;
    };

    const _storeItemDetailCache = (key, data, item_detail_cache) => {
        if (!key || !data) {
            return;
        }
        if (!item_detail_cache) {
            item_detail_cache = {};
        }
        item_detail_cache[key] = {
            ts: Date.now(),
            data: JSON.parse(JSON.stringify(data)),
        };
        return item_detail_cache;
    };

    const clearItemDetailCache = () => {
        return {};
    };

    const _getStockCacheKey = (item, pos_profile) => {
        const code = item?.item_code;
        const warehouse = item?.warehouse || pos_profile?.warehouse;
        if (!code || !warehouse) {
            return null;
        }
        return `${code}::${warehouse}`;
    };

    const _getCachedStockQty = (key, item_stock_cache) => {
        if (!key) {
            return null;
        }
        const cache = item_stock_cache || {};
        const entry = cache[key];
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.ts > STOCK_CACHE_TTL) {
            delete cache[key];
            return null;
        }
        return entry.qty;
    };

    const _storeStockQty = (key, qty, item_stock_cache) => {
        if (!key) {
            return;
        }
        if (!item_stock_cache) {
            item_stock_cache = {};
        }
        item_stock_cache[key] = { ts: Date.now(), qty };
        return item_stock_cache;
    };

    const clearItemStockCache = () => {
        return {};
    };

    return {
        _getItemDetailCacheKey,
        _getCachedItemDetail,
        _storeItemDetailCache,
        clearItemDetailCache,
        _getStockCacheKey,
        _getCachedStockQty,
        _storeStockQty,
        clearItemStockCache,
    };
}
