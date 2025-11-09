import { memory, persist } from "./cache.js";

const SNAPSHOT_KEY = "pricing_rules_snapshot";

function cloneSnapshot(snapshot) {
        if (!snapshot) {
                return { rules: [], lastSyncedAt: null, contextHash: null };
        }
        try {
                return JSON.parse(JSON.stringify(snapshot));
        } catch (error) {
                console.error("Failed to clone pricing rules snapshot", error);
                return { rules: [], lastSyncedAt: null, contextHash: null };
        }
}

export function savePricingRulesSnapshot(snapshot) {
        const clean = cloneSnapshot(snapshot);
        memory.pricing_rules_snapshot = clean;
        persist(SNAPSHOT_KEY, clean);
}

export function getCachedPricingRulesSnapshot() {
        return memory.pricing_rules_snapshot || { rules: [], lastSyncedAt: null, contextHash: null };
}

export function clearPricingRulesSnapshot() {
        memory.pricing_rules_snapshot = { rules: [], lastSyncedAt: null, contextHash: null };
        persist(SNAPSHOT_KEY, memory.pricing_rules_snapshot);
}
