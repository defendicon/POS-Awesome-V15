export function useTaskQueue() {
    const _ensureTaskBucket = (rowId, _itemTaskCache) => {
        if (!rowId) {
            return null;
        }
        if (!_itemTaskCache) {
            _itemTaskCache = new Map();
        }
        if (!_itemTaskCache.has(rowId)) {
            _itemTaskCache.set(rowId, {});
        }
        return _itemTaskCache.get(rowId);
    };

    const _getItemTaskPromise = (rowId, taskName, _itemTaskCache) => {
        if (!rowId || !_itemTaskCache) {
            return null;
        }
        const bucket = _itemTaskCache.get(rowId);
        return bucket ? bucket[taskName] || null : null;
    };

    const _setItemTaskPromise = (rowId, taskName, promise, _itemTaskCache) => {
        if (!rowId || !promise) {
            return promise;
        }
        const bucket = _ensureTaskBucket(rowId, _itemTaskCache);
        const trackedPromise = Promise.resolve(promise).finally(() => {
            const activeBucket = _itemTaskCache ? _itemTaskCache.get(rowId) : null;
            if (activeBucket) {
                delete activeBucket[taskName];
                if (!Object.keys(activeBucket).length) {
                    _itemTaskCache.delete(rowId);
                }
            }
        });
        bucket[taskName] = trackedPromise;
        return trackedPromise;
    };

    const resetItemTaskCache = (rowId, taskName = null, _itemTaskCache) => {
        if (!_itemTaskCache) {
            return;
        }
        if (!rowId) {
            _itemTaskCache = new Map();
            return;
        }
        if (taskName === null) {
            _itemTaskCache.delete(rowId);
            return;
        }
        const bucket = _itemTaskCache.get(rowId);
        if (!bucket) {
            return;
        }
        delete bucket[taskName];
        if (!Object.keys(bucket).length) {
            _itemTaskCache.delete(rowId);
        }
    };

    const queueItemTask = (itemOrRowId, taskName, taskFn, options = {}, _itemTaskCache) => {
        const rowId = typeof itemOrRowId === "string" ? itemOrRowId : itemOrRowId?.posa_row_id;
        const { force = false } = options;
        const executeTask = () => Promise.resolve().then(() => taskFn());

        if (!rowId) {
            return executeTask();
        }

        if (force) {
            resetItemTaskCache(rowId, taskName, _itemTaskCache);
        } else {
            const existing = _getItemTaskPromise(rowId, taskName, _itemTaskCache);
            if (existing) {
                return existing;
            }
        }

        const promise = executeTask();
        return _setItemTaskPromise(rowId, taskName, promise, _itemTaskCache);
    };

    const hasItemTaskPromise = (rowId, taskName, _itemTaskCache) => {
        return !!_getItemTaskPromise(rowId, taskName, _itemTaskCache);
    };

    const getItemTaskPromise = (rowId, taskName, _itemTaskCache) => {
        return _getItemTaskPromise(rowId, taskName, _itemTaskCache);
    };

    return {
        _ensureTaskBucket,
        _getItemTaskPromise,
        _setItemTaskPromise,
        resetItemTaskCache,
        queueItemTask,
        hasItemTaskPromise,
        getItemTaskPromise,
    };
}
