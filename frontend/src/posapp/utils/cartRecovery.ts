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
}
const PREFIX = "posa_cart_recovery_v1:";
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
) {
	if (!cartScopeIsComplete(scope)) return;
	const key = getCartRecoveryKey(scope, tabStorage);
	if (!invoice?.items?.length || Number(invoice.docstatus) > 0) {
		storage.removeItem(key);
		return;
	}
	const clean = JSON.parse(JSON.stringify(invoice));
	// Approval and offline credentials must be freshly verified after recovery.
	for (const field of [
		"_posa_offline_cashier_token",
		"_posa_authoritative_cashier",
		"posa_below_cost_override",
		"posa_below_cost_override_reason",
	])
		delete clean[field];
	storage.setItem(
		key,
		JSON.stringify({
			version: 1,
			scope,
			saved_at: new Date().toISOString(),
			invoice: clean,
		} satisfies CartRecoverySnapshot),
	);
}

export function readCartRecovery(
	scope: CartRecoveryScope,
	storage: Storage = localStorage,
	tabStorage: Storage = sessionStorage,
): CartRecoverySnapshot | null {
	if (!cartScopeIsComplete(scope)) return null;
	const raw = storage.getItem(getCartRecoveryKey(scope, tabStorage));
	if (!raw) return null;
	const record = JSON.parse(raw);
	if (
		record?.version !== 1 ||
		scopeKey(record.scope || {}) !== scopeKey(scope) ||
		!Array.isArray(record.invoice?.items) ||
		!record.invoice.items.length ||
		Number(record.invoice.docstatus) > 0
	)
		throw new Error(
			"Saved cart is incompatible. It was retained for recovery review.",
		);
	return record;
}

export function clearCartRecovery(scope: CartRecoveryScope) {
	localStorage.removeItem(getCartRecoveryKey(scope));
}
