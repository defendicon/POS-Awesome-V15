// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("offline boot safety", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it("does not initialize the durable write queue during module import", async () => {
		const checkDbHealth = vi.fn().mockResolvedValue(true);
		const table = vi.fn(() => ({
			where: vi.fn(() => ({
				equals: vi.fn(() => ({
					sortBy: vi.fn().mockResolvedValue([]),
					first: vi.fn().mockResolvedValue(undefined),
				})),
			})),
			put: vi.fn().mockResolvedValue(undefined),
			add: vi.fn().mockResolvedValue(1),
			delete: vi.fn().mockResolvedValue(undefined),
			bulkDelete: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue(undefined),
		}));

		vi.doMock("../src/offline/db", () => ({
			checkDbHealth,
			initPromise: Promise.resolve(),
			memory: {
				offline_invoices: [],
				offline_customers: [],
				offline_payments: [],
				offline_cash_movements: [],
			},
			db: {
				isOpen: vi.fn().mockReturnValue(true),
				open: vi.fn().mockResolvedValue(undefined),
				table,
			},
		}));

		vi.doMock("../src/offline/idempotency", () => ({
			ensureOfflineInvoiceRequest: vi.fn(),
			ensurePaymentClientRequestId: vi.fn(),
		}));

		await import("../src/offline/writeQueue");
		await Promise.resolve();
		await Promise.resolve();

		expect(checkDbHealth).not.toHaveBeenCalled();
	});
});
