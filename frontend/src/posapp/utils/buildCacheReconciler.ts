declare const __BUILD_VERSION__: string;

import {
	clearDerivedOfflineCaches as clearDerivedOfflineCachesFromDb,
	memory,
	PENDING_OFFLINE_QUEUE_KEYS,
} from "../../offline/db";
import { setBootstrapLimitedMode } from "../../offline/cache";

type AnyRecord = Record<string, any>;

type DetectBuildChangeInput = {
	runtimeBuildVersion?: string | null;
	storage?: Storage | null;
	bootstrapSnapshotBuildVersion?: string | null;
	memoryState?: AnyRecord | null;
};

type DetectBuildChangeResult = {
	runtimeBuildVersion: string | null;
	currentRuntimeBuildVersion: string | null;
	lastReconciledBuildVersion: string | null;
	bootstrapSnapshotBuildVersion: string | null;
	pendingRefreshRequired: boolean;
	buildChanged: boolean;
	shouldReconcile: boolean;
	reasons: string[];
};

type ReconcileBuildChangeInput = DetectBuildChangeInput & {
	isOnline?: boolean;
	readBootstrapSnapshot?: () => { build_version?: string | null } | null;
	readMemoryState?: () => AnyRecord | null;
	purgeDerivedOfflineCaches?: () => Promise<void> | void;
	setBootstrapLimitedMode?: (state: boolean) => void;
};

type ReconcileBuildChangeResult = DetectBuildChangeResult & {
	status: "noop" | "reconciled_online" | "pending_online_reconcile";
	preservedQueues: Record<string, number>;
};

export const BUILD_RECONCILIATION_KEYS = Object.freeze({
	currentRuntimeBuildVersion: "posa_current_runtime_build_version",
	lastReconciledBuildVersion: "posa_last_reconciled_build_version",
	pendingRefreshRequired: "posa_pending_build_refresh_required",
});

function normalizeBuildVersion(value: unknown): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized.length ? normalized : null;
}

function getStorage(storage?: Storage | null): Storage | null {
	if (typeof storage !== "undefined") {
		return storage;
	}

	try {
		if (typeof window === "undefined" || !window.localStorage) {
			return null;
		}
		return window.localStorage;
	} catch {
		return null;
	}
}

function safeStorageGet(storage: Storage | null, key: string): string | null {
	if (!storage) {
		return null;
	}

	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

function safeStorageSet(storage: Storage | null, key: string, value: string) {
	if (!storage) {
		return;
	}

	try {
		storage.setItem(key, value);
	} catch {
		// Storage writes may fail in private or restricted browser contexts.
	}
}

function readBooleanFlag(storage: Storage | null, key: string) {
	const value = safeStorageGet(storage, key);
	return value === "1" || value === "true";
}

function hasEntries(value: unknown) {
	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (value && typeof value === "object") {
		return Object.keys(value as Record<string, unknown>).length > 0;
	}

	return Boolean(value);
}

function hasLegacyDerivedState(memoryState: AnyRecord = {}) {
	return Boolean(
		memoryState.cache_ready ||
			memoryState.stock_cache_ready ||
			memoryState.bootstrap_snapshot ||
			memoryState.bootstrap_snapshot_status ||
			memoryState.bootstrap_limited_mode ||
			hasEntries(memoryState.item_details_cache) ||
			hasEntries(memoryState.local_stock_cache) ||
			hasEntries(memoryState.customer_storage) ||
			hasEntries(memoryState.offers_cache) ||
			hasEntries(memoryState.price_list_cache) ||
			hasEntries(memoryState.pricing_rules_snapshot) ||
			hasEntries(memoryState.translation_cache),
	);
}

function writeBuildState(
	storage: Storage | null,
	input: {
		currentRuntimeBuildVersion?: string | null;
		lastReconciledBuildVersion?: string | null;
		pendingRefreshRequired?: boolean;
	},
) {
	if (input.currentRuntimeBuildVersion) {
		safeStorageSet(
			storage,
			BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			input.currentRuntimeBuildVersion,
		);
	}

	if (input.lastReconciledBuildVersion) {
		safeStorageSet(
			storage,
			BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			input.lastReconciledBuildVersion,
		);
	}

	if (typeof input.pendingRefreshRequired === "boolean") {
		safeStorageSet(
			storage,
			BUILD_RECONCILIATION_KEYS.pendingRefreshRequired,
			input.pendingRefreshRequired ? "1" : "0",
		);
	}
}

function getRuntimeBuildVersion(explicitBuildVersion?: string | null) {
	if (typeof explicitBuildVersion !== "undefined") {
		return normalizeBuildVersion(explicitBuildVersion);
	}

	if (typeof __BUILD_VERSION__ !== "undefined") {
		return normalizeBuildVersion(__BUILD_VERSION__);
	}

	return null;
}

export function preservePendingOfflineQueues(memoryState: AnyRecord = memory) {
	return Object.fromEntries(
		PENDING_OFFLINE_QUEUE_KEYS.map((key) => [key, memoryState?.[key]?.length || 0]),
	) as Record<string, number>;
}

export function detectBuildChange(
	input: DetectBuildChangeInput = {},
): DetectBuildChangeResult {
	const storage = getStorage(input.storage);
	const runtimeBuildVersion = getRuntimeBuildVersion(input.runtimeBuildVersion);
	const currentRuntimeBuildVersion = normalizeBuildVersion(
		safeStorageGet(storage, BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion),
	);
	const lastReconciledBuildVersion = normalizeBuildVersion(
		safeStorageGet(storage, BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion),
	);
	const bootstrapSnapshotBuildVersion = normalizeBuildVersion(
		input.bootstrapSnapshotBuildVersion,
	);
	const pendingRefreshRequired = readBooleanFlag(
		storage,
		BUILD_RECONCILIATION_KEYS.pendingRefreshRequired,
	);
	const reasons: string[] = [];

	if (!runtimeBuildVersion) {
		return {
			runtimeBuildVersion: null,
			currentRuntimeBuildVersion,
			lastReconciledBuildVersion,
			bootstrapSnapshotBuildVersion,
			pendingRefreshRequired,
			buildChanged: false,
			shouldReconcile: false,
			reasons: ["missing_runtime_build_version"],
		};
	}

	if (
		currentRuntimeBuildVersion &&
		currentRuntimeBuildVersion !== runtimeBuildVersion
	) {
		reasons.push("runtime_build_changed");
	}

	if (
		lastReconciledBuildVersion &&
		lastReconciledBuildVersion !== runtimeBuildVersion
	) {
		reasons.push("last_reconciled_build_changed");
	}

	if (
		bootstrapSnapshotBuildVersion &&
		bootstrapSnapshotBuildVersion !== runtimeBuildVersion
	) {
		reasons.push("bootstrap_snapshot_build_changed");
	}

	if (pendingRefreshRequired) {
		reasons.push("pending_refresh_required");
	}

	if (
		!currentRuntimeBuildVersion &&
		!lastReconciledBuildVersion &&
		hasLegacyDerivedState(input.memoryState || {})
	) {
		reasons.push("legacy_build_metadata_missing");
	}

	return {
		runtimeBuildVersion,
		currentRuntimeBuildVersion,
		lastReconciledBuildVersion,
		bootstrapSnapshotBuildVersion,
		pendingRefreshRequired,
		buildChanged: reasons.some((reason) => reason !== "pending_refresh_required"),
		shouldReconcile: reasons.length > 0,
		reasons,
	};
}

async function purgeDerivedOfflineCaches() {
	await clearDerivedOfflineCachesFromDb();
}

export async function reconcileBuildChangeOnStartup(
	input: ReconcileBuildChangeInput = {},
): Promise<ReconcileBuildChangeResult> {
	const storage = getStorage(input.storage);
	const runtimeBuildVersion = getRuntimeBuildVersion(input.runtimeBuildVersion);
	const memoryState = input.readMemoryState?.() || memory;
	const snapshot = input.readBootstrapSnapshot?.() || memoryState.bootstrap_snapshot;
	const detection = detectBuildChange({
		runtimeBuildVersion,
		storage,
		bootstrapSnapshotBuildVersion: snapshot?.build_version || null,
		memoryState,
	});
	const preservedQueues = preservePendingOfflineQueues(memoryState);

	if (!detection.runtimeBuildVersion) {
		return {
			...detection,
			status: "noop",
			preservedQueues,
		};
	}

	if (!detection.shouldReconcile) {
		writeBuildState(storage, {
			currentRuntimeBuildVersion: detection.runtimeBuildVersion,
			lastReconciledBuildVersion:
				detection.lastReconciledBuildVersion || detection.runtimeBuildVersion,
			pendingRefreshRequired: false,
		});
		return {
			...detection,
			status: "noop",
			preservedQueues,
		};
	}

	await (input.purgeDerivedOfflineCaches || purgeDerivedOfflineCaches)();
	writeBuildState(storage, {
		currentRuntimeBuildVersion: detection.runtimeBuildVersion,
	});

	if (input.isOnline) {
		writeBuildState(storage, {
			lastReconciledBuildVersion: detection.runtimeBuildVersion,
			pendingRefreshRequired: false,
		});
		(input.setBootstrapLimitedMode || setBootstrapLimitedMode)?.(false);
		return {
			...detection,
			status: "reconciled_online",
			preservedQueues,
		};
	}

	writeBuildState(storage, {
		pendingRefreshRequired: true,
	});
	(input.setBootstrapLimitedMode || setBootstrapLimitedMode)?.(true);
	return {
		...detection,
		status: "pending_online_reconcile",
		preservedQueues,
	};
}

