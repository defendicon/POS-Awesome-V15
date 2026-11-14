export interface CartRecoveryScope {
	user: string;
	cashier: string;
	profile: string;
	company: string;
	warehouse: string;
	opening: string;
}
export interface CartRecoverySnapshot {
	version: 1;
	scope: CartRecoveryScope;
	saved_at: string;
	invoice: Record<string, any>;
	/** Only snapshots written while their browser ownership lock was held. */
	restart_recoverable?: boolean;
}
const PREFIX = "posa_cart_recovery_v1:";
function sanitizeInvoice(invoice: Record<string, any>) {
	const clean = JSON.parse(JSON.stringify(invoice));
	for (const field of [
		"_posa_offline_cashier_token",
		"_posa_authoritative_cashier",
		"posa_below_cost_override",
		"posa_below_cost_override_reason",
	])
		delete clean[field];
	return clean;
}
const scopeKey = (scope: CartRecoveryScope) =>
	JSON.stringify([
		scope.user,
		scope.cashier,
		scope.profile,
		scope.company,
		scope.warehouse,
		scope.opening,
	]);
export const cartScopeIsComplete = (scope: CartRecoveryScope) =>
	Boolean(
		scope.user &&
			scope.cashier &&
			scope.profile &&
			scope.company &&
			scope.opening,
	);

export function getCartRecoveryKey(
	scope: CartRecoveryScope,
	storage: Storage = sessionStorage,
) {
	let tab = storage.getItem("posa_cart_tab_id");
	if (!tab) {
		tab = crypto.randomUUID();
		storage.setItem("posa_cart_tab_id", tab);
	}
	return PREFIX + encodeURIComponent(scopeKey(scope)) + ":" + tab;
}

export function saveCartRecovery(
	scope: CartRecoveryScope,
	invoice: Record<string, any>,
	storage: Storage = localStorage,
	tabStorage: Storage = sessionStorage,
	restartRecoverable = false,
) {
	if (!cartScopeIsComplete(scope)) return;
	const key = getCartRecoveryKey(scope, tabStorage);
	if (!invoice?.items?.length || Number(invoice.docstatus) > 0) {
		storage.removeItem(key);
		return;
	}
	// Approval and offline credentials must be freshly verified after recovery.
	const clean = sanitizeInvoice(invoice);
	storage.setItem(
		key,
		JSON.stringify({
			version: 1,
			scope,
			saved_at: new Date().toISOString(),
			invoice: clean,
			restart_recoverable: restartRecoverable,
		} satisfies CartRecoverySnapshot),
	);
}

export function readCartRecovery(
	scope: CartRecoveryScope,
	storage: Storage = localStorage,
	tabStorage: Storage = sessionStorage,
): CartRecoverySnapshot | null {
	if (!cartScopeIsComplete(scope)) return null;
	return readCartRecoveryAtKey(
		scope,
		getCartRecoveryKey(scope, tabStorage),
		storage,
	);
}

export function readCartRecoveryAtKey(
	scope: CartRecoveryScope,
	key: string,
	storage: Storage = localStorage,
): CartRecoverySnapshot | null {
	if (
		!cartScopeIsComplete(scope) ||
		!key.startsWith(PREFIX + encodeURIComponent(scopeKey(scope)) + ":")
	)
		throw new Error("Saved cart belongs to another cashier or POS scope.");
	const raw = storage.getItem(key);
	if (!raw) return null;
	const record = JSON.parse(raw);
	if (
		record?.version !== 1 ||
		scopeKey(record.scope || {}) !== scopeKey(scope) ||
		!Array.isArray(record.invoice?.items) ||
		!record.invoice.items.length ||
		!Number.isFinite(Date.parse(record.saved_at)) ||
		(record.invoice.company && record.invoice.company !== scope.company) ||
		(record.invoice.pos_profile &&
			record.invoice.pos_profile !== scope.profile) ||
		Number(record.invoice.docstatus) > 0
	)
		throw new Error(
			"Saved cart is incompatible. It was retained for recovery review.",
		);
	return { ...record, invoice: sanitizeInvoice(record.invoice) };
}

export const cartRecoveryLocksAvailable = () =>
	typeof navigator.locks?.request === "function";

const lockName = (key: string) => `posa:cart:${key}`;

/** A browser releases this lock when the document/process closes or crashes. */
export function lockCartRecovery(key: string): Promise<(() => void) | null> {
	if (!cartRecoveryLocksAvailable()) return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		navigator.locks
			.request(lockName(key), { ifAvailable: true }, async (lock) => {
				if (!lock) {
					resolve(null);
					return;
				}
				await new Promise<void>((release) => resolve(release));
			})
			.catch(reject);
	});
}

export interface RestartCartCandidate {
	key: string;
	snapshot: CartRecoverySnapshot;
}

export async function listRestartCartRecoveries(scope: CartRecoveryScope) {
	const candidates: RestartCartCandidate[] = [];
	const issues: string[] = [];
	if (!cartScopeIsComplete(scope) || !cartRecoveryLocksAvailable())
		return { candidates, issues };
	const held = new Set(
		(await navigator.locks.query()).held?.map((lock) => lock.name),
	);
	const prefix = PREFIX + encodeURIComponent(scopeKey(scope)) + ":";
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(prefix) || held.has(lockName(key))) continue;
		try {
			const record = readCartRecoveryAtKey(scope, key);
			// Older builds never held ownership locks: retain their data for export,
			// but do not risk taking a cart from a still-open older terminal tab.
			if (
				record?.restart_recoverable &&
				record.invoice.posa_client_request_id &&
				["Sales Invoice", "POS Invoice"].includes(
					record.invoice.doctype,
				) &&
				!record.invoice.is_return
			)
				candidates.push({ key, snapshot: record });
		} catch {
			issues.push(
				"A saved cart could not be read. It was retained for recovery review.",
			);
		}
	}
	return {
		candidates: candidates.sort((a, b) =>
			b.snapshot.saved_at.localeCompare(a.snapshot.saved_at),
		),
		issues,
	};
}

export function clearCartRecovery(scope: CartRecoveryScope) {
	localStorage.removeItem(getCartRecoveryKey(scope));
}
