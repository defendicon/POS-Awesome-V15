export function normalizeDate(input) {
        if (!input) return null;
        const value = Array.isArray(input) ? input[0] : input;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isBatchExpired(expiryDate, today = new Date()) {
        const expiry = normalizeDate(expiryDate);
        if (!expiry) return false;

        const reference = new Date(today);
        reference.setHours(0, 0, 0, 0);
        expiry.setHours(0, 0, 0, 0);

        return expiry < reference;
}

export function isBatchNearExpiry(expiryDate, monthsThreshold = 0, today = new Date()) {
        if (!expiryDate || !monthsThreshold) return false;
        const expiry = normalizeDate(expiryDate);
        if (!expiry) return false;

        const reference = new Date(today);
        reference.setHours(0, 0, 0, 0);
        expiry.setHours(0, 0, 0, 0);
        if (expiry < reference) return false;

        const windowEnd = new Date(reference);
        windowEnd.setMonth(windowEnd.getMonth() + Number(monthsThreshold || 0));
        return expiry <= windowEnd;
}

export function batchStatus(batch = {}, options = {}) {
        const { monthsThreshold = 0, today = new Date() } = options;
        const expired = isBatchExpired(batch.expiry_date, today);
        const nearExpiry = !expired && isBatchNearExpiry(batch.expiry_date, monthsThreshold, today);

        return { expired, nearExpiry };
}
