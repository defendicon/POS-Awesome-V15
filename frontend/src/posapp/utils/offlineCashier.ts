import type { TerminalEmployee } from "../stores/employeeStore";

interface OfflineAccess {
	version: number;
	iterations: number;
	salt: string;
	iv: string;
	ciphertext: string;
	expires_at: number;
}
type CachedCashier = TerminalEmployee & { offline_access?: OfflineAccess };

const cacheKey = (profile: string) => {
	const user = globalThis.frappe?.session?.user || "";
	if (!user || user === "Guest" || !profile)
		throw new Error("An existing POS session is required.");
	return `posa_offline_cashiers_v1:${encodeURIComponent(user)}:${encodeURIComponent(profile)}`;
};

export function cacheOfflineCashiers(
	profile: string,
	employees: CachedCashier[],
) {
	localStorage.setItem(
		cacheKey(profile),
		JSON.stringify(
			employees.map((row) => ({
				user: row.user,
				full_name: row.full_name,
				pin_length: row.pin_length,
				offline_access: row.offline_access,
			})),
		),
	);
}

export function loadOfflineCashiers(profile: string): CachedCashier[] {
	try {
		const rows = JSON.parse(
			localStorage.getItem(cacheKey(profile)) || "[]",
		);
		return Array.isArray(rows)
			? rows.filter(
					(row) =>
						row?.user &&
						row.offline_access?.version === 1 &&
						row.offline_access.expires_at * 1000 > Date.now(),
				)
			: [];
	} catch (error) {
		console.warn("Unable to read offline cashier cache", error);
		return [];
	}
}

const bytes = (value: string) =>
	Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export function assertOfflineCashierAccess(
	token: string,
	profile: string,
	user: string,
) {
	const claims = JSON.parse(
		new TextDecoder().decode(
			bytes(
				(token.split(".")[0] || "")
					.replace(/-/g, "+")
					.replace(/_/g, "/"),
			),
		),
	);
	if (
		claims.cashier !== user ||
		claims.pos_profile !== profile ||
		claims.session_user !== globalThis.frappe?.session?.user ||
		claims.expires_at * 1000 <= Date.now() ||
		claims.issued_at * 1000 > Date.now()
	) {
		throw new Error(
			"Offline cashier access is expired or belongs to another session. Verify the cashier PIN again.",
		);
	}
}

export async function unlockOfflineCashier(
	profile: string,
	user: string,
	pin: string,
) {
	const employee = loadOfflineCashiers(profile).find(
		(row) => row.user === user,
	);
	const access = employee?.offline_access;
	if (!access)
		throw new Error(
			"Offline cashier access is unavailable or expired. Load this POS Profile online first.",
		);
	if (!globalThis.crypto?.subtle)
		throw new Error(
			"Offline cashier access requires HTTPS on this device.",
		);
	const keyName = `${cacheKey(profile)}:attempts:${encodeURIComponent(user)}`;
	const attempts = JSON.parse(localStorage.getItem(keyName) || "{}");
	if (Number(attempts.locked_until || 0) > Date.now())
		throw new Error("Too many incorrect PINs. Try again in five minutes.");
	if (access.iterations !== 600_000)
		throw new Error("Unsupported offline cashier cache. Refresh online.");
	try {
		const material = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(pin),
			"PBKDF2",
			false,
			["deriveKey"],
		);
		const key = await crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				hash: "SHA-256",
				salt: bytes(access.salt),
				iterations: access.iterations,
			},
			material,
			{ name: "AES-GCM", length: 256 },
			false,
			["decrypt"],
		);
		const plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: bytes(access.iv) },
			key,
			bytes(access.ciphertext),
		);
		const token = new TextDecoder().decode(plaintext);
		assertOfflineCashierAccess(token, profile, user);
		localStorage.removeItem(keyName);
		return { user: employee.user, full_name: employee.full_name, token };
	} catch {
		const failures = Number(attempts.failures || 0) + 1;
		localStorage.setItem(
			keyName,
			JSON.stringify({
				failures: failures >= 5 ? 0 : failures,
				locked_until: failures >= 5 ? Date.now() + 300_000 : 0,
			}),
		);
		throw new Error(
			"Invalid cashier PIN or damaged offline access. Retry or refresh online.",
		);
	}
}
