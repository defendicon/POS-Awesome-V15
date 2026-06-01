export type PerformanceThresholdName =
	| "localSnapshotManifestRead"
	| "cachedSellReadyBoot"
	| "offlineValidSnapshotSellReadyBoot"
	| "snapshotAtomicCommit"
	| "barcodeExactLookup"
	| "localItemAutocomplete"
	| "localCustomerAutocomplete"
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
