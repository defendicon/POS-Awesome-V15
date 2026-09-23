export const EXCHANGE_SESSION_STORAGE_KEY = "posawesome:item-exchange:v1";
export const EXCHANGE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type ExchangeStage = "return" | "sale";

export interface PersistedExchangeSession {
	version: 1;
	stage: ExchangeStage;
	clientRequestId: string;
	posProfile: string;
	company: string;
	openingShift: string;
	user: string;
	originalInvoice: any | null;
	returnDraft: any | null;
	returnDoc: any | null;
	saleDraft: any | null;
	returnTotal: number;
	savedAt: number;
}

export interface ExchangeSessionScope {
	posProfile?: string | null;
	company?: string | null;
	openingShift?: string | null;
	user?: string | null;
}

const asText = (value: unknown) => String(value || "").trim();

const getSessionStorage = (storage?: Storage | null): Storage | null => {
	if (storage !== undefined) return storage;
	try {
		return typeof window !== "undefined" ? window.sessionStorage : null;
	} catch {
		return null;
	}
};

const isValidSession = (value: any): value is PersistedExchangeSession =>
	value?.version === 1 &&
	(value?.stage === "return" || value?.stage === "sale") &&
	Boolean(asText(value?.clientRequestId)) &&
	Boolean(asText(value?.posProfile)) &&
	Boolean(asText(value?.company)) &&
	Boolean(asText(value?.openingShift)) &&
	Boolean(asText(value?.user)) &&
	Number.isFinite(Number(value?.savedAt));

export function readExchangeSession(
	storage?: Storage | null,
	now = Date.now(),
): PersistedExchangeSession | null {
	const target = getSessionStorage(storage);
	if (!target) return null;

	try {
		const raw = target.getItem(EXCHANGE_SESSION_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (
			!isValidSession(parsed) ||
			now - Number(parsed.savedAt) > EXCHANGE_SESSION_MAX_AGE_MS ||
			Number(parsed.savedAt) > now + 60_000
		) {
			target.removeItem(EXCHANGE_SESSION_STORAGE_KEY);
			return null;
		}
		return parsed;
	} catch {
		try {
			target.removeItem(EXCHANGE_SESSION_STORAGE_KEY);
		} catch {
			// Storage cleanup is best-effort in restricted browser contexts.
		}
		return null;
	}
}

export function writeExchangeSession(
	session:
		| Omit<PersistedExchangeSession, "version" | "savedAt">
		| PersistedExchangeSession,
	storage?: Storage | null,
	now = Date.now(),
): boolean {
	const target = getSessionStorage(storage);
	if (!target) return false;

	try {
		target.setItem(
			EXCHANGE_SESSION_STORAGE_KEY,
			JSON.stringify({ ...session, version: 1, savedAt: now }),
		);
		return true;
	} catch {
		return false;
	}
}

export function clearStoredExchangeSession(storage?: Storage | null): void {
	const target = getSessionStorage(storage);
	if (!target) return;
	try {
		target.removeItem(EXCHANGE_SESSION_STORAGE_KEY);
	} catch {
		// Storage cleanup is best-effort in restricted browser contexts.
	}
}

export function exchangeSessionMatchesScope(
	session: PersistedExchangeSession,
	scope: ExchangeSessionScope,
): boolean {
	const comparisons: Array<[string, unknown]> = [
		[session.user, scope.user],
		[session.posProfile, scope.posProfile],
		[session.company, scope.company],
		[session.openingShift, scope.openingShift],
	];

	return comparisons.every(
		([stored, current]) => asText(stored) === asText(current),
	);
}
