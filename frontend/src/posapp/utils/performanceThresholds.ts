export type PerformanceThresholdName =
	| "localSnapshotManifestRead"
	| "cachedSellReadyBoot"
	| "offlineValidSnapshotSellReadyBoot"
	| "snapshotAtomicCommit"
	| "barcodeExactLookup"
	| "localItemAutocomplete"
	| "localCustomerAutocomplete"
	| "customerExactLookup25k"
	| "customerMobileExactLookup25k"
	| "customerSelectLocal25k"
	| "customerIndexHydrate25k"
	| "customerDeltaApply25k"
	| "localCustomerAutocomplete100k"
	| "customerExactLookup100k"
	| "customerMobileExactLookup100k"
	| "customerSelectLocal100k"
	| "customerDeltaApply100k"
	| "addItemToCart"
	| "cartRecalculate20Lines"
	| "cartRecalculate200Lines"
	| "offlineOutboxEnqueue"
	| "paymentDialogOpen";

export const PERFORMANCE_THRESHOLDS_MS: Record<PerformanceThresholdName, number> = {
	localSnapshotManifestRead: 50,
	cachedSellReadyBoot: 500,
	offlineValidSnapshotSellReadyBoot: 500,
	snapshotAtomicCommit: 100,
	barcodeExactLookup: 20,
	localItemAutocomplete: 50,
	localCustomerAutocomplete: 75,
	customerExactLookup25k: 15,
	customerMobileExactLookup25k: 20,
	customerSelectLocal25k: 30,
	customerIndexHydrate25k: 150,
	customerDeltaApply25k: 100,
	localCustomerAutocomplete100k: 75,
	customerExactLookup100k: 20,
	customerMobileExactLookup100k: 25,
	customerSelectLocal100k: 40,
	customerDeltaApply100k: 125,
	addItemToCart: 50,
	cartRecalculate20Lines: 40,
	cartRecalculate200Lines: 150,
	offlineOutboxEnqueue: 20,
	paymentDialogOpen: 100,
};

export function percentile(values: number[], pct: number) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((pct / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}
