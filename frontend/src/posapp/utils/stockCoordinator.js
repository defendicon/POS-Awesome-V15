const listeners = new Set();
const baseQuantities = new Map();
const reservedQuantities = new Map();
const availabilityMap = new Map();

const normalizeCode = (code) => {
        if (code === undefined || code === null) {
                return null;
        }
        const normalized = String(code).trim();
        return normalized ? normalized : null;
};

const toNumber = (value) => {
        if (value === undefined || value === null) {
                return null;
        }
        const num = Number(value);
        if (!Number.isFinite(num)) {
                return null;
        }
        return num;
};

const computeAvailability = (code) => {
        if (!code) {
                return null;
        }
        if (!baseQuantities.has(code)) {
                availabilityMap.delete(code);
                return null;
        }
        const base = baseQuantities.get(code);
        const reserved = reservedQuantities.get(code) || 0;
        const available = base - reserved;
        availabilityMap.set(code, available);
        return available;
};

const buildSnapshot = (codes) => {
        const snapshot = {};
        codes.forEach((code) => {
                const normalized = normalizeCode(code);
                if (!normalized) {
                        return;
                }
                const base = baseQuantities.has(normalized) ? baseQuantities.get(normalized) : null;
                const reserved = reservedQuantities.get(normalized) || 0;
                const available = availabilityMap.has(normalized)
                        ? availabilityMap.get(normalized)
                        : computeAvailability(normalized);
                snapshot[normalized] = {
                        baseActual: base,
                        reserved,
                        available,
                };
        });
        return snapshot;
};

const notifyListeners = (type, codes, meta = {}) => {
        if (!Array.isArray(codes) || !codes.length) {
                return;
        }
        const snapshot = buildSnapshot(codes);
        listeners.forEach((listener) => {
                try {
                        listener({ type, codes, snapshot, meta });
                } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error("Stock listener failed", error);
                }
        });
};

const updateBaseQuantities = (entries = [], options = {}) => {
        const { silent = false, pruneMissing = false } = options;
        const changed = new Set();
        const seen = new Set();

        entries.forEach((entry) => {
                if (!entry) {
                        return;
                }
                const code = normalizeCode(entry.item_code ?? entry.code ?? entry.name);
                if (!code) {
                        return;
                }
                seen.add(code);
                const baseCandidate =
                        toNumber(
                                entry.actual_qty ??
                                        entry.available_qty ??
                                        entry.base_actual_qty ??
                                        entry.base_available_qty ??
                                        entry.base_qty ??
                                        entry.qty ??
                                        entry.stock_qty,
                        );
                if (baseCandidate === null) {
                        return;
                }
                const current = baseQuantities.get(code);
                if (current === undefined || current !== baseCandidate) {
                        baseQuantities.set(code, baseCandidate);
                        changed.add(code);
                }
        });

        if (pruneMissing) {
                Array.from(baseQuantities.keys()).forEach((code) => {
                        if (!seen.has(code)) {
                                baseQuantities.delete(code);
                                changed.add(code);
                        }
                });
        }

        const affected = Array.from(changed);
        affected.forEach((code) => computeAvailability(code));

        if (!silent && affected.length) {
                        notifyListeners("base", affected, { source: options.source });
        }

        return affected;
};

const updateReservations = (totals = {}, options = {}) => {
        const { silent = false } = options;
        const incoming = new Map();
        if (totals && typeof totals === "object") {
                Object.entries(totals).forEach(([codeValue, qtyValue]) => {
                        const code = normalizeCode(codeValue);
                        const qty = toNumber(qtyValue);
                        if (!code || qty === null) {
                                return;
                        }
                        const positive = qty > 0 ? qty : 0;
                        if (positive > 0) {
                                incoming.set(code, positive);
                        }
                });
        }

        const changed = new Set();
        const processed = new Set();

        incoming.forEach((qty, code) => {
                processed.add(code);
                const previous = reservedQuantities.get(code) || 0;
                if (previous !== qty) {
                        reservedQuantities.set(code, qty);
                        changed.add(code);
                }
        });

        Array.from(reservedQuantities.keys()).forEach((code) => {
                if (!processed.has(code)) {
                        const previous = reservedQuantities.get(code) || 0;
                        if (previous !== 0) {
                                changed.add(code);
                        }
                        reservedQuantities.delete(code);
                }
        });

        const affected = Array.from(changed);
        affected.forEach((code) => computeAvailability(code));

        if (!silent && affected.length) {
                notifyListeners("reservation", affected, { source: options.source });
        }

        return affected;
};

const clearAll = () => {
        const affected = Array.from(
                new Set([
                        ...baseQuantities.keys(),
                        ...reservedQuantities.keys(),
                        ...availabilityMap.keys(),
                ]),
        );
        baseQuantities.clear();
        reservedQuantities.clear();
        availabilityMap.clear();
        if (affected.length) {
                notifyListeners("reset", affected, {});
        }
        return affected;
};

const getAvailability = (code) => {
        const normalized = normalizeCode(code);
        if (!normalized) {
                return null;
        }
        if (availabilityMap.has(normalized)) {
                return availabilityMap.get(normalized);
        }
        return computeAvailability(normalized);
};

const getReserved = (code) => {
        const normalized = normalizeCode(code);
        if (!normalized) {
                return 0;
        }
        return reservedQuantities.get(normalized) || 0;
};

const getBase = (code) => {
        const normalized = normalizeCode(code);
        if (!normalized) {
                return null;
        }
        return baseQuantities.has(normalized) ? baseQuantities.get(normalized) : null;
};

const getSnapshot = (codes) => {
        if (!codes) {
                return buildSnapshot([
                        ...new Set([
                                ...baseQuantities.keys(),
                                ...reservedQuantities.keys(),
                                ...availabilityMap.keys(),
                        ]),
                ]);
        }
        return buildSnapshot(Array.isArray(codes) ? codes : [codes]);
};

const applyAvailabilityToItem = (item, options = {}) => {
        if (!item || item.item_code === undefined || item.item_code === null) {
                return;
        }
        const code = normalizeCode(item.item_code);
        if (!code) {
                return;
        }

        if (!baseQuantities.has(code)) {
                const fallbackBase = toNumber(
                        item._base_actual_qty ??
                                item._base_available_qty ??
                                item.actual_qty ??
                                item.available_qty ??
                                item.stock_qty,
                );
                if (fallbackBase !== null) {
                        baseQuantities.set(code, fallbackBase);
                }
        }

        const base = baseQuantities.has(code) ? baseQuantities.get(code) : null;
        if (base !== null && options.updateBase !== false) {
                item._base_actual_qty = base;
                if (options.updateBaseAvailable !== false) {
                        item._base_available_qty = base;
                }
        }

        const available = getAvailability(code);
        if (available !== null) {
                if (options.updateActual !== false) {
                        item.actual_qty = available;
                }
                if (options.updateAvailable !== false && item.available_qty !== undefined) {
                        item.available_qty = available;
                }
        } else if (base !== null && options.updateActual !== false) {
                item.actual_qty = base;
        }
};

const applyAvailabilityToCollection = (items, codesSet = null, options = {}) => {
        if (!Array.isArray(items) || !items.length) {
                return;
        }
        items.forEach((item) => {
                if (!item || item.item_code === undefined || item.item_code === null) {
                        return;
                }
                const code = normalizeCode(item.item_code);
                if (!code) {
                        return;
                }
                if (codesSet && !codesSet.has(code)) {
                        return;
                }
                applyAvailabilityToItem(item, options);
        });
};

const primeFromItems = (items = [], options = {}) => {
        const entries = [];
        items.forEach((item) => {
                if (!item || item.item_code === undefined || item.item_code === null) {
                        return;
                }
                const code = normalizeCode(item.item_code);
                if (!code) {
                        return;
                }
                const baseCandidate = toNumber(
                        item._base_actual_qty ??
                                item._base_available_qty ??
                                item.actual_qty ??
                                item.available_qty ??
                                item.stock_qty,
                );
                if (baseCandidate === null) {
                        return;
                }
                entries.push({ item_code: code, actual_qty: baseCandidate });
        });
        if (!entries.length) {
                return [];
        }
        return updateBaseQuantities(entries, { silent: options.silent !== false, source: options.source });
};

const applyInvoiceConsumption = (items = [], options = {}) => {
        const { silent = false } = options;
        const changed = new Set();
        items.forEach((entry) => {
                if (!entry) {
                        return;
                }
                const code = normalizeCode(entry.item_code);
                if (!code) {
                        return;
                }
                if (!baseQuantities.has(code)) {
                        return;
                }
                const stockQty = toNumber(entry.stock_qty);
                let consumption = stockQty;
                if (consumption === null) {
                        const qty = toNumber(entry.qty);
                        const factor = toNumber(entry.conversion_factor);
                        if (qty !== null) {
                                const multiplier = factor !== null && factor !== 0 ? factor : 1;
                                consumption = qty * multiplier;
                        }
                }
                if (consumption === null) {
                        return;
                }
                const current = baseQuantities.get(code);
                const next = current - consumption;
                if (next !== current) {
                        baseQuantities.set(code, next);
                        changed.add(code);
                }
        });
        const affected = Array.from(changed);
        affected.forEach((code) => computeAvailability(code));
        if (!silent && affected.length) {
                notifyListeners("base", affected, { source: options.source || "invoice" });
        }
        return affected;
};

const subscribe = (listener) => {
        if (typeof listener !== "function") {
                return () => {};
        }
        listeners.add(listener);
        return () => {
                listeners.delete(listener);
        };
};

export default {
        updateBaseQuantities,
        updateReservations,
        clearAll,
        getAvailability,
        getReserved,
        getBase,
        getSnapshot,
        applyAvailabilityToItem,
        applyAvailabilityToCollection,
        primeFromItems,
        applyInvoiceConsumption,
        subscribe,
};
