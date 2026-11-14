export const SAFE_REFRESH_REQUEST = "posa:request-safe-refresh";
export const SAFE_REFRESH_PREPARE = "posa:prepare-safe-refresh";
export interface RefreshPreparation {
	hasCart: boolean;
	reasons: string[];
}
export interface RefreshRequest {
	action?: () => unknown;
	update?: boolean;
	onCancel?: () => void;
}

/** Only the mounted ERP dialog may accept a refresh request. Never bypass it. */
export function requestSafeRefresh(request: RefreshRequest = {}) {
	return !window.dispatchEvent(
		new CustomEvent(SAFE_REFRESH_REQUEST, {
			detail: request,
			cancelable: true,
		}),
	);
}

export function flushCartForRefresh() {
	const detail: RefreshPreparation = { hasCart: false, reasons: [] };
	if (
		!window.dispatchEvent(
			new CustomEvent(SAFE_REFRESH_PREPARE, { detail, cancelable: true }),
		)
	)
		throw new Error(
			detail.reasons.join("\n") ||
				"The current cart could not be saved. Refresh was cancelled.",
		);
	return detail;
}

export async function prepareSafeRefresh(isBusy: () => boolean) {
	if (isBusy())
		throw new Error("Finish the current operation before refreshing.");
	const cart = flushCartForRefresh();
	const { db, flushPersistQueue } = await import("../../offline/db");
	const { ensureOfflineQueueReady, SYNCING_LEASE_MS } = await import(
		"../../offline/writeQueue"
	);
	const { getPendingInvoiceRecoveryCount } = await import(
		"../../offline/invoiceRecovery"
	);
	const { useSyncCoordinator } = await import(
		"../../offline/sync/useSyncCoordinator"
	);
	await ensureOfflineQueueReady();
	await flushPersistQueue();
	const [writes, outbox, syncStates, pendingInvoices] = await Promise.all([
		db.table("write_queue").toArray(),
		db.table("invoice_outbox").toArray(),
		db.table("sync_state").toArray(),
		getPendingInvoiceRecoveryCount(),
	]);
	const activeLease = (row: any) => {
		if (row.status !== "syncing") return false;
		const started = Date.parse(
			row.last_attempt_at ||
				row.lastAttemptAt ||
				row.value?.lastAttemptAt ||
				row.updated_at ||
				"",
		);
		// Match durable delivery's five-minute lease. A crashed, expired worker
		// must not permanently prevent an offline terminal from refreshing.
		return !Number.isFinite(started) || Date.now() - started < SYNCING_LEASE_MS;
	};
	if (
		isBusy() ||
		useSyncCoordinator().hasActiveRuns() ||
		writes.some(activeLease) ||
		outbox.some(activeLease) ||
		syncStates.some(activeLease)
	)
		throw new Error(
			"A submission or sync is running. Wait for it to finish, then retry Safe Refresh.",
		);
	const latestCart = flushCartForRefresh();
	await flushPersistQueue();
	if (isBusy() || useSyncCoordinator().hasActiveRuns())
		throw new Error(
			"A POS operation started during refresh checks. Wait and retry.",
		);
	return {
		hasCart: cart.hasCart || latestCart.hasCart,
		pendingInvoices,
		pendingOtherWrites: writes.filter(
			(row) => row.entity_type !== "invoice" && row.status !== "synced",
		).length,
	};
}
