import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
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

		expect(store.customers).toEqual([
			expect.objectContaining({
				...customer,
				loyalty_points: 15,
				stored_value_balance: 0,
			}),
		]);
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

	it("loads customers in five parallel 200-row pages with smooth progress", async () => {
		const store = useCustomersStore();
		store.setPosProfile({ name: "Main POS", company: "Test Co" });
		const catalog = Array.from({ length: 450 }, (_, index) => ({
			name: `CUST-${String(index + 1).padStart(4, "0")}`,
			customer_name: `Customer ${index + 1}`,
		}));
		const observedCounts: number[] = [];
		const stopWatching = watch(
			() => store.loadedCustomerCount,
			(value) => observedCounts.push(value),
			{ flush: "sync" },
		);

		(globalThis as any).frappe.call = vi.fn(async (request: any) => {
			if (
				request.method ===
				"posawesome.posawesome.api.customers.get_customers_count"
			) {
				return { message: catalog.length };
			}
			const { offset = 0, limit = 200 } = request.args;
			const response = {
				message: catalog.slice(offset, offset + limit),
			};
			request.callback?.(response);
			return response;
		});

		await store.get_customer_names();
		await vi.waitFor(() => {
			expect(store.loadProgress).toBe(100);
		});
		stopWatching();

		const customerCalls = (globalThis as any).frappe.call.mock.calls
			.map(([request]: any[]) => request)
			.filter((request: any) =>
				request.method.endsWith("get_customer_names"),
			);
		expect(customerCalls.slice(0, 6).map((request: any) => request.args.offset)).toEqual([
			null,
			200,
			400,
			600,
			800,
			1000,
		]);
		expect(store.loadedCustomerCount).toBe(450);
		expect(observedCounts).toContain(201);
		expect(observedCounts).toContain(449);
	});
});
