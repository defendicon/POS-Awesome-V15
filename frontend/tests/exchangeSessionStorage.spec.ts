import { beforeEach, describe, expect, it } from "vitest";

import {
	EXCHANGE_SESSION_MAX_AGE_MS,
	EXCHANGE_SESSION_STORAGE_KEY,
	clearStoredExchangeSession,
	exchangeSessionMatchesScope,
	readExchangeSession,
	writeExchangeSession,
} from "../src/posapp/utils/exchangeSessionStorage";

class MemoryStorage implements Storage {
	private values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

const createSession = () => ({
	version: 1 as const,
	stage: "sale" as const,
	clientRequestId: "exchange-request-1",
	posProfile: "Main POS",
	company: "Example Co",
	openingShift: "SHIFT-0001",
	user: "cashier@example.com",
	originalInvoice: { name: "SINV-OLD" },
	returnDraft: { is_return: 1 },
	returnDoc: { name: "SINV-RETURN-DRAFT", is_return: 1 },
	saleDraft: { customer: "CUST-0001", items: [{ item_code: "NEW" }] },
	returnTotal: 50,
	savedAt: 1_000,
});

describe("exchange session storage", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it("restores a valid exchange after a page reload", () => {
		expect(writeExchangeSession(createSession(), storage, 1_000)).toBe(
			true,
		);

		const restored = readExchangeSession(storage, 2_000);

		expect(restored).toMatchObject({
			stage: "sale",
			clientRequestId: "exchange-request-1",
			returnTotal: 50,
		});
		expect(restored?.saleDraft.items[0].item_code).toBe("NEW");
	});

	it("removes expired and malformed exchange state", () => {
		writeExchangeSession(createSession(), storage, 1_000);
		expect(
			readExchangeSession(
				storage,
				1_000 + EXCHANGE_SESSION_MAX_AGE_MS + 1,
			),
		).toBeNull();
		expect(storage.getItem(EXCHANGE_SESSION_STORAGE_KEY)).toBeNull();

		storage.setItem(EXCHANGE_SESSION_STORAGE_KEY, "not-json");
		expect(readExchangeSession(storage, 2_000)).toBeNull();
		expect(storage.getItem(EXCHANGE_SESSION_STORAGE_KEY)).toBeNull();
	});

	it("matches the exchange to the active cashier, profile, company, and shift", () => {
		const session = createSession();
		expect(
			exchangeSessionMatchesScope(session, {
				user: "cashier@example.com",
				posProfile: "Main POS",
				company: "Example Co",
				openingShift: "SHIFT-0001",
			}),
		).toBe(true);
		expect(
			exchangeSessionMatchesScope(session, {
				user: "another@example.com",
				posProfile: "Main POS",
			}),
		).toBe(false);
		expect(
			exchangeSessionMatchesScope(session, {
				user: "cashier@example.com",
				posProfile: "Main POS",
				company: "Example Co",
			}),
		).toBe(false);
	});

	it("rejects persisted state without a complete security scope", () => {
		writeExchangeSession(
			{ ...createSession(), openingShift: "" },
			storage,
			1_000,
		);

		expect(readExchangeSession(storage, 2_000)).toBeNull();
		expect(storage.getItem(EXCHANGE_SESSION_STORAGE_KEY)).toBeNull();
	});

	it("clears persisted state explicitly", () => {
		writeExchangeSession(createSession(), storage, 1_000);
		clearStoredExchangeSession(storage);
		expect(readExchangeSession(storage, 2_000)).toBeNull();
	});
});
