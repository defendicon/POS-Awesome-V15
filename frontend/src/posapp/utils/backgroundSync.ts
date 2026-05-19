/**
 * Background sync validation utilities.
 */

/**
 * Normalizes the background sync interval to a valid value.
 */
export const normalizeBackgroundSyncInterval = (
    value: any,
    defaultValue: number = 60,
    minValue: number = 30
): number => {
    // Defaults raised 2026-05-09 (default 30→60s, floor 10→30s) after
    // ops report main-thread jank on low-end Android (Moto E15) — the
    // 30s cadence kept rebuilding reactive item arrays while operators
    // were typing in the search box. Operator-set higher intervals on
    // POS Profile still win.
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return defaultValue;
    }
    return Math.max(minValue, parsed);
};

/**
 * Interface for background sync validation parameters.
 */
export interface BackgroundSyncParams {
    posProfile: any;
    enableBackgroundSync: boolean;
    backgroundSyncInFlight: boolean;
    isOffline: boolean;
    usesLimitSearch: boolean;
}

/**
 * Determines whether background sync should run based on current state.
 */
export const shouldRunBackgroundSync = ({
    posProfile,
    enableBackgroundSync,
    backgroundSyncInFlight,
    isOffline,
    usesLimitSearch,
}: BackgroundSyncParams): boolean => {
    if (!posProfile || !posProfile.name) {
        return false;
    }
    if (!enableBackgroundSync) {
        return false;
    }
    if (backgroundSyncInFlight) {
        return false;
    }
    if (isOffline) {
        return false;
    }
    if (usesLimitSearch) {
        return false;
    }
    return true;
};
