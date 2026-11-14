// @vitest-environment node
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cacheOfflineCashiers,
	loadOfflineCashiers,
	unlockOfflineCashier,
} from "../src/posapp/utils/offlineCashier";
import { useEmployeeStore } from "../src/posapp/stores/employeeStore";
import { createPinia, setActivePinia } from "pinia";

let storageData: Record<string, string>;
const now = Date.now();
const claims = {
	cashier: "backup@example.com",
	pos_profile: "Main POS",
	session_user: "terminal@example.com",
	issued_at: Math.floor(now / 1000) - 60,
	expires_at: Math.floor(now / 1000) + 3600,
};
const token = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test-signature`;

async function provision() {
	const salt = new Uint8Array(16).fill(7);
	const iv = new Uint8Array(12).fill(8);
	const material = await webcrypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("1234"),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await webcrypto.subtle.deriveKey(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);
	const ciphertext = await webcrypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(token),
	);
	cacheOfflineCashiers("Main POS", [
		{
			user: claims.cashier,
			full_name: "Backup Cashier",
			pin_length: 4,
			offline_access: {
				version: 1,
				iterations: 600_000,
				salt: Buffer.from(salt).toString("base64"),
				iv: Buffer.from(iv).toString("base64"),
				ciphertext: Buffer.from(ciphertext).toString("base64"),
				expires_at: claims.expires_at,
			},
		},
	]);
}

describe("offline cashier access", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		storageData = {};
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => storageData[key] ?? null,
			setItem: (key: string, value: string) => {
				storageData[key] = value;
			},
			removeItem: (key: string) => {
				delete storageData[key];
			},
		});
		vi.stubGlobal("crypto", webcrypto);
		vi.stubGlobal("frappe", { session: { user: claims.session_user } });
	});
	it("unlocks a second cashier from durable encrypted cache without an API call", async () => {
		await provision();
		expect(Object.values(storageData).join("")).not.toContain(token);
		const cashier = await unlockOfflineCashier(
			"Main POS",
			claims.cashier,
			"1234",
		);
		const store = useEmployeeStore();
		store.beginTerminalEmployeesLoad(
			"Main POS",
			loadOfflineCashiers("Main POS"),
		);
		store.applyOfflineCashier(cashier);
		expect(store.currentCashier?.user).toBe(claims.cashier);
		expect(store.currentCashier?.is_supervisor).toBe(false);
		expect(store.isLocked).toBe(false);
		expect(store.offlineCashierToken).toBe(token);
		store.terminalEmployees[0]!.is_supervisor = true;
		store.ensureCurrentCashier();
		expect(store.currentCashier?.is_supervisor).toBe(false);
		store.lockTerminal();
		expect(store.offlineCashierToken).toBe("");
	});
	it("rejects wrong PINs and persists the five-failure lockout across attempts", async () => {
		await provision();
		for (let i = 0; i < 5; i++)
			await expect(
				unlockOfflineCashier("Main POS", claims.cashier, "9999"),
			).rejects.toThrow("Invalid cashier PIN");
		await expect(
			unlockOfflineCashier("Main POS", claims.cashier, "1234"),
		).rejects.toThrow("five minutes");
	});
	it("isolates profiles and session users and rejects expired grants", async () => {
		await provision();
		expect(loadOfflineCashiers("Other POS")).toEqual([]);
		(globalThis as any).frappe.session.user = "other@example.com";
		expect(loadOfflineCashiers("Main POS")).toEqual([]);
		(globalThis as any).frappe.session.user = claims.session_user;
		const rows = loadOfflineCashiers("Main POS");
		rows[0]!.offline_access!.expires_at = 1;
		cacheOfflineCashiers("Main POS", rows);
		await expect(
			unlockOfflineCashier("Main POS", claims.cashier, "1234"),
		).rejects.toThrow("expired");
	});
	it("handles missing and damaged legacy cache without unlocking", async () => {
		expect(loadOfflineCashiers("Main POS")).toEqual([]);
		await expect(
			unlockOfflineCashier("Main POS", claims.cashier, "1234"),
		).rejects.toThrow("unavailable");
	});
});
