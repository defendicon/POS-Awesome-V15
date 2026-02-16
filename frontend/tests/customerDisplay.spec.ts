import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildCustomerDisplayUrl,
	createCustomerDisplayTransport,
	getCustomerDisplayStorageKey,
	getOrCreateCustomerDisplayChannelId,
	type CustomerDisplaySnapshot,
} from "../src/posapp/utils/customerDisplay";

class MemoryStorage {
	private map = new Map<string, string>();

	getItem(key: string) {
		return this.map.has(key) ? this.map.get(key)! : null;
	}

	setItem(key: string, value: string) {
		this.map.set(key, String(value));
	}

	removeItem(key: string) {
		this.map.delete(key);
	}

	clear() {
		this.map.clear();
	}
}

const baseSnapshot: CustomerDisplaySnapshot = {
	channel_id: "cd_test",
	currency: "USD",
	customer_name: "Walk-in",
	items: [
		{
			id: "1",
			item_code: "ITEM-1",
			item_name: "Item 1",
			qty: 2,
			rate: 5,
			amount: 10,
			uom: "Nos",
		},
	],
	total_qty: 2,
	total_amount: 10,
	updated_at: "2026-02-16T10:00:00.000Z",
};

const createWindowMock = () => ({
	location: { origin: "http://localhost" },
	sessionStorage: new MemoryStorage(),
	localStorage: new MemoryStorage(),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
});

describe("customerDisplay utils", () => {
	beforeEach(() => {
		(globalThis as any).window = createWindowMock();
	});

	afterEach(() => {
		delete (globalThis as any).window;
		vi.restoreAllMocks();
	});

	it("reuses session channel id once created", () => {
		const first = getOrCreateCustomerDisplayChannelId();
		const second = getOrCreateCustomerDisplayChannelId();

		expect(first).toBeTruthy();
		expect(second).toBe(first);
	});

	it("builds customer display url with channel query", () => {
		const url = buildCustomerDisplayUrl("cd_abc123");
		expect(url).toBe("http://localhost/app/posapp/customer-display?channel=cd_abc123");
	});

	it("stores and reads last snapshot via transport", () => {
		const transport = createCustomerDisplayTransport("cd_test");
		transport.publish(baseSnapshot);

		const stored = transport.getLastSnapshot();
		expect(stored).toEqual(baseSnapshot);

		const storageKey = getCustomerDisplayStorageKey("cd_test");
		expect((window as any).localStorage.getItem(storageKey)).toContain(
			"snapshot",
		);
		transport.close();
	});

	it("emits initial snapshot to subscriber", () => {
		const transport = createCustomerDisplayTransport("cd_init");
		transport.publish(baseSnapshot);

		let received: CustomerDisplaySnapshot | null = null;
		const unsubscribe = transport.subscribe((next) => {
			received = next;
		});

		expect(received).toEqual(baseSnapshot);
		unsubscribe();
		transport.close();
	});
});
