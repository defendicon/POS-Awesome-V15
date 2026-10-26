import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
	memory: { customer_balance_cache: {} as Record<string, any> },
	persist: vi.fn(),
	isOffline: vi.fn(() => false),
}));

// Keep the loader and cache real; only browser persistence/connectivity and RPC
// are external to this unit. The cache must never read a different scope.
vi.mock("../src/offline/db", () => ({
	...storage,
	db: {},
	checkDbHealth: vi.fn(),
	startupInitPromise: Promise.resolve(),
}));
vi.mock("../src/offline/index", async () => ({
	...(await import("../src/offline/customers")),
	isOffline: storage.isOffline,
}));

import {
	getCachedCustomerBalance,
	saveCustomerBalance,
	clearExpiredCustomerBalances,
} from "../src/offline/customers";
import { fetch_customer_balance } from "../src/posapp/components/pos/invoice_utils/loader";

const user = "cashier-a@example.test";
const company = "Company A";
const customer = "CUST-A";
const contextFor = () => ({
	customer,
	pos_profile: { company },
	customer_balance: 999 as number | null,
	customer_balance_currency: "EUR" as string | undefined,
	customer_balance_loading: false,
	toastStore: { show: vi.fn() },
});

function deferred() {
	let resolve!: (value: any) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	storage.memory.customer_balance_cache = {};
	storage.persist.mockClear();
	storage.isOffline.mockReturnValue(false);
	vi.stubGlobal("__", (text: string) => text);
	vi.stubGlobal("frappe", { session: { user }, call: vi.fn() });
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("customer balance cache scope", () => {
	it("isolates the same customer's balance by company and session user", () => {
		saveCustomerBalance(customer, 12, "USD", company, user);
		saveCustomerBalance(customer, -3, "EUR", "Company B", user);
		saveCustomerBalance(
			customer,
			0,
			"USD",
			company,
			"cashier-b@example.test",
		);
		expect(getCachedCustomerBalance(customer, company, user)?.balance).toBe(
			12,
		);
		expect(
			getCachedCustomerBalance(customer, "Company B", user)?.balance,
		).toBe(-3);
		expect(
			getCachedCustomerBalance(
				customer,
				company,
				"cashier-b@example.test",
			)?.balance,
		).toBe(0);
		expect(getCachedCustomerBalance("CUST-B", company, user)).toBeNull();
		expect(
			getCachedCustomerBalance(customer, "Company C", user),
		).toBeNull();
		expect(
			getCachedCustomerBalance(
				customer,
				company,
				"cashier-c@example.test",
			),
		).toBeNull();
	});

	it("never trusts customer-only legacy cache entries", () => {
		storage.memory.customer_balance_cache[customer] = {
			balance: 999,
			currency: "USD",
			timestamp: Date.now(),
		};
		expect(getCachedCustomerBalance(customer, company, user)).toBeNull();
	});

	it.each(["company", "user", "customer"])(
		"does not cache without %s scope",
		(missing) => {
			const args = { customer, company, user, [missing]: "" };
			saveCustomerBalance(
				args.customer,
				12,
				"USD",
				args.company,
				args.user,
			);
			expect(storage.memory.customer_balance_cache).toEqual({});
			expect(
				getCachedCustomerBalance(
					args.customer,
					args.company,
					args.user,
				),
			).toBeNull();
		},
	);

	it("invalidates only the unavailable scope and persists that invalidation", () => {
		saveCustomerBalance(customer, 12, "USD", company, user);
		saveCustomerBalance(customer, -3, "EUR", "Company B", user);
		storage.persist.mockClear();
		saveCustomerBalance(customer, null, undefined, company, user);
		expect(getCachedCustomerBalance(customer, company, user)).toBeNull();
		expect(
			getCachedCustomerBalance(customer, "Company B", user)?.balance,
		).toBe(-3);
		expect(storage.persist).toHaveBeenCalledWith("customer_balance_cache");
	});

	it.each([NaN, Infinity, -Infinity, "12", undefined])(
		"does not cache invalid balance %s",
		(balance) => {
			saveCustomerBalance(customer, balance as any, "USD", company, user);
			expect(
				getCachedCustomerBalance(customer, company, user),
			).toBeNull();
		},
	);

	it("does not trust malformed persisted balances", () => {
		saveCustomerBalance(customer, 12, "USD", company, user);
		const entry = Object.values(storage.memory.customer_balance_cache)[0];
		entry.balance = "12";
		expect(getCachedCustomerBalance(customer, company, user)).toBeNull();
	});

	it("expires scoped balances using the existing 24-hour limit", () => {
		vi.spyOn(Date, "now").mockReturnValue(1000);
		saveCustomerBalance(customer, 12, "USD", company, user);
		vi.mocked(Date.now).mockReturnValue(1000 + 24 * 60 * 60 * 1000);
		expect(getCachedCustomerBalance(customer, company, user)).toBeNull();
		clearExpiredCustomerBalances();
		expect(storage.memory.customer_balance_cache).toEqual({});
	});
});

describe("customer balance loader", () => {
	it.each([null, undefined, "12", NaN, Infinity, -Infinity])(
		"keeps unavailable/invalid response %s distinct from zero and invalidates cache",
		async (balance) => {
			saveCustomerBalance(customer, 12, "USD", company, user);
			frappe.call.mockResolvedValue({
				message: { balance, currency: "USD" },
			});
			const context = contextFor();
			await fetch_customer_balance(context);
			expect(context.customer_balance).toBeNull();
			expect(context.customer_balance_currency).toBeUndefined();
			expect(context.customer_balance_loading).toBe(false);
			expect(
				getCachedCustomerBalance(customer, company, user),
			).toBeNull();
		},
	);

	it("treats an absent response as unavailable", async () => {
		frappe.call.mockResolvedValue(undefined);
		const context = contextFor();
		await fetch_customer_balance(context);
		expect(context.customer_balance).toBeNull();
	});

	it.each([0, 125.5, -42.25])(
		"preserves and scopes a genuine native balance of %s",
		async (balance) => {
			frappe.call.mockResolvedValue({
				message: { balance, currency: "USD" },
			});
			const context = contextFor();
			await fetch_customer_balance(context);
			expect(context.customer_balance).toBe(balance);
			expect(context.customer_balance_currency).toBe("USD");
			expect(
				getCachedCustomerBalance(customer, company, user)?.balance,
			).toBe(balance);
			expect(
				getCachedCustomerBalance(customer, "Company B", user),
			).toBeNull();
			expect(frappe.call).toHaveBeenCalledWith({
				method: "posawesome.posawesome.api.customer.get_customer_balance",
				args: { customer, company },
			});
		},
	);

	it("clears the previous balance while a new request is loading", async () => {
		const pending = deferred();
		frappe.call.mockReturnValue(pending.promise);
		const context = contextFor();
		const request = fetch_customer_balance(context);
		expect(context.customer_balance).toBeNull();
		expect(context.customer_balance_currency).toBeUndefined();
		expect(context.customer_balance_loading).toBe(true);
		pending.resolve({ message: { balance: 12, currency: "USD" } });
		await request;
	});

	it("does not display zero when no customer is selected", async () => {
		const context = { ...contextFor(), customer: "" };
		await fetch_customer_balance(context);
		expect(context.customer_balance).toBeNull();
		expect(context.customer_balance_loading).toBe(false);
		expect(frappe.call).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"does not present offline cache as current (cached=%s)",
		async (cached) => {
			if (cached) saveCustomerBalance(customer, 12, "USD", company, user);
			storage.isOffline.mockReturnValue(true);
			const context = contextFor();
			await fetch_customer_balance(context);
			expect(context.customer_balance).toBeNull();
			expect(context.customer_balance_currency).toBeUndefined();
			expect(context.customer_balance_loading).toBe(false);
			expect(frappe.call).not.toHaveBeenCalled();
		},
	);

	it.each([false, true])(
		"does not fall back to a stale balance on RPC failure (cached=%s)",
		async (cached) => {
			if (cached) saveCustomerBalance(customer, 12, "USD", company, user);
			frappe.call.mockRejectedValue(
				new Error("synthetic network failure"),
			);
			const context = contextFor();
			await fetch_customer_balance(context);
			expect(context.customer_balance).toBeNull();
			expect(context.customer_balance_currency).toBeUndefined();
			expect(context.customer_balance_loading).toBe(false);
		},
	);

	it.each(["customer", "company", "user"])(
		"ignores a late result after %s changes, without touching the newer request or cache",
		async (scope) => {
			const first = deferred();
			const second = deferred();
			frappe.call
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise);
			const context = contextFor();
			const older = fetch_customer_balance(context);
			if (scope === "customer") context.customer = "CUST-B";
			if (scope === "company") context.pos_profile.company = "Company B";
			if (scope === "user")
				frappe.session.user = "cashier-b@example.test";
			const newer = fetch_customer_balance(context);
			first.resolve({ message: { balance: 111, currency: "EUR" } });
			await older;
			expect(context.customer_balance).toBeNull();
			expect(context.customer_balance_loading).toBe(true);
			expect(storage.memory.customer_balance_cache).toEqual({});
			second.resolve({ message: { balance: 22, currency: "USD" } });
			await newer;
			expect(context.customer_balance).toBe(22);
			expect(context.customer_balance_loading).toBe(false);
			expect(
				getCachedCustomerBalance(
					context.customer,
					context.pos_profile.company,
					frappe.session.user,
				)?.balance,
			).toBe(22);
		},
	);

	it.each(["customer", "company", "user"])(
		"discards a response if %s changes without a replacement request",
		async (scope) => {
			const pending = deferred();
			frappe.call.mockReturnValue(pending.promise);
			const context = contextFor();
			const request = fetch_customer_balance(context);
			if (scope === "customer") context.customer = "CUST-B";
			if (scope === "company") context.pos_profile.company = "Company B";
			if (scope === "user")
				frappe.session.user = "cashier-b@example.test";
			pending.resolve({ message: { balance: 111, currency: "EUR" } });
			await request;
			expect(context.customer_balance).toBeNull();
			expect(storage.memory.customer_balance_cache).toEqual({});
		},
	);

	it.each(["success", "unavailable", "error"])(
		"discards an older same-scope %s after the latest balance arrives",
		async (outcome) => {
			const first = deferred();
			const second = deferred();
			frappe.call
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise);
			const context = contextFor();
			const older = fetch_customer_balance(context);
			const newer = fetch_customer_balance(context);
			second.resolve({ message: { balance: 22, currency: "USD" } });
			await newer;
			if (outcome === "error")
				first.reject(new Error("synthetic late failure"));
			else
				first.resolve({
					message: {
						balance: outcome === "success" ? 111 : null,
						currency: "EUR",
					},
				});
			await older;
			expect(context.customer_balance).toBe(22);
			expect(context.customer_balance_currency).toBe("USD");
			expect(context.customer_balance_loading).toBe(false);
			expect(
				getCachedCustomerBalance(customer, company, user)?.balance,
			).toBe(22);
			expect(context.toastStore.show).not.toHaveBeenCalled();
		},
	);
});
