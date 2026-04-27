import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCustomersStore } from "../src/posapp/stores/customersStore";
import type {
	CustomerInfo,
	CustomerSummary,
	StoredCustomer,
} from "../src/posapp/types/models";

const setCustomerStorageMock = vi.fn(async () => undefined);
const saveStoredValueSnapshotMock = vi.fn();

vi.mock("../src/offline/index", () => ({
	db: {
		isOpen: () => true,
		open: vi.fn(async () => undefined),
		table: vi.fn(() => ({
			filter: vi.fn().mockReturnThis(),
			offset: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			toArray: vi.fn(async () => []),
		})),
	},
	checkDbHealth: vi.fn(async () => undefined),
	setCustomerStorage: (...args: any[]) => setCustomerStorageMock(...args),
	saveStoredValueSnapshot: (...args: any[]) =>
		saveStoredValueSnapshotMock(...args),
	memoryInitPromise: Promise.resolve(),
	getCustomersLastSync: vi.fn(() => null),
	setCustomersLastSync: vi.fn(),
	getCustomerStorageCount: vi.fn(async () => 0),
	clearCustomerStorage: vi.fn(async () => undefined),
	isOffline: vi.fn(() => false),
	refreshBootstrapSnapshotFromCacheState: vi.fn(),
}));

describe("customersStore profile and customer dto handling", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		setCustomerStorageMock.mockClear();
		saveStoredValueSnapshotMock.mockClear();
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("normalizes a wrapped pos_profile string into a profile name", () => {
		const store = useCustomersStore();

		store.setPosProfile({ pos_profile: "Main POS" });

		expect(store.posProfile?.name).toBe("Main POS");
	});

	it("accepts additive customer summary and info shapes through public store APIs", async () => {
		const store = useCustomersStore();
		store.setPosProfile({ name: "Main POS", company: "Test Co" });

		const customer: StoredCustomer = {
			name: "CUST-001",
			customer_name: "Customer One",
		};
		const info: CustomerInfo = {
			name: "CUST-001",
			stored_value_balance: 0,
			loyalty_points: 15,
		};

		await store.addOrUpdateCustomer(customer);
		store.setCustomerInfo(info);

		expect(store.customers).toEqual([customer]);
		expect(store.customerInfo).toEqual(info);
		expectTypeOf(store.customers).toEqualTypeOf<CustomerSummary[]>();
		expect(setCustomerStorageMock).toHaveBeenCalledWith([customer]);
	});

	it("adds fetched customer info to the visible selector list", () => {
		const store = useCustomersStore();
		const info: CustomerInfo = {
			name: "CUST-QUOTE",
			customer_name: "Quotation Customer",
			email_id: "quote@example.com",
		};

		store.setCustomerInfo(info);

		expect(store.customers).toContainEqual({
			name: "CUST-QUOTE",
			customer_name: "Quotation Customer",
			email_id: "quote@example.com",
		});
	});
});
