type InvoiceContext = any;

/**
 * Task Management Utils
 * Handles async task queueing for invoice items to prevent race conditions.
 * 
 * Context requirements:
 * - context._itemTaskCache (Map)
 */

export function _ensureTaskBucket(context: InvoiceContext, rowId: string | null | undefined) {
    if (!rowId) {
        return null;
    }
    if (!context._itemTaskCache) {
        context._itemTaskCache = new Map();
    }
    if (!context._itemTaskCache.has(rowId)) {
        context._itemTaskCache.set(rowId, {});
    }
    return context._itemTaskCache.get(rowId);
}

export function _getItemTaskPromise(
	context: InvoiceContext,
	rowId: string | null | undefined,
	taskName: string,
) {
    if (!rowId || !context._itemTaskCache) {
        return null;
    }
    const bucket = context._itemTaskCache.get(rowId);
    return bucket ? bucket[taskName] || null : null;
}

export function _setItemTaskPromise(
	context: InvoiceContext,
	rowId: string | null | undefined,
	taskName: string,
	promise: Promise<unknown>,
) {
    if (!rowId || !promise) {
        return promise;
    }
    const bucket = _ensureTaskBucket(context, rowId);
    const trackedPromise = Promise.resolve(promise).finally(() => {
        const activeBucket = context._itemTaskCache ? context._itemTaskCache.get(rowId) : null;
        if (activeBucket) {
            delete activeBucket[taskName];
            if (!Object.keys(activeBucket).length) {
                context._itemTaskCache.delete(rowId);
            }
        }
    });
    bucket[taskName] = trackedPromise;
    return trackedPromise;
}

export function resetItemTaskCache(
	context: InvoiceContext,
	rowId: string | null | undefined,
	taskName: string | null = null,
) {
    if (!context._itemTaskCache) {
        return;
    }
    if (!rowId) {
        context._itemTaskCache = new Map();
        return;
    }
    if (taskName === null) {
        context._itemTaskCache.delete(rowId);
        return;
    }
    const bucket = context._itemTaskCache.get(rowId);
    if (!bucket) {
        return;
    }
    delete bucket[taskName];
    if (!Object.keys(bucket).length) {
        context._itemTaskCache.delete(rowId);
    }
}

export function queueItemTask(
	context: InvoiceContext,
	itemOrRowId: any,
	taskName: string,
	taskFn: () => unknown,
	options: { force?: boolean } = {},
) {
    const rowId = typeof itemOrRowId === "string" ? itemOrRowId : itemOrRowId?.posa_row_id;
    const { force = false } = options;
    const executeTask = () => Promise.resolve().then(() => taskFn());

    if (!rowId) {
        return executeTask();
    }

    if (force) {
        resetItemTaskCache(context, rowId, taskName);
    } else {
        const existing = _getItemTaskPromise(context, rowId, taskName);
        if (existing) {
            return existing;
        }
    }

    const promise = executeTask();
    return _setItemTaskPromise(context, rowId, taskName, promise);
}

export function hasItemTaskPromise(context: InvoiceContext, rowId: string, taskName: string) {
    return !!_getItemTaskPromise(context, rowId, taskName);
}

export function getItemTaskPromise(context: InvoiceContext, rowId: string, taskName: string) {
    return _getItemTaskPromise(context, rowId, taskName);
}
