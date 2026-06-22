// @vitest-environment jsdom

import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
}));

import { isOffline } from "../src/offline/index";
import { usePaymentSharing } from "../src/posapp/composables/pos/payments/usePaymentSharing";

describe("usePaymentSharing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isOffline).mockReturnValue(false);
		(globalThis as any).__ = (message: string, values?: unknown[]) => {
			if (!values) return message;
			return values.reduce(
				(result, value, index) => result.replace(`{${index}}`, String(value)),
				message,
			);
		};
		(globalThis as any).frappe = {
			csrf_token: "csrf-token",
			call: vi.fn().mockResolvedValue({
				message: [{ name: "ACC-PAY-0001" }],
			}),
		};
		vi.stubGlobal(
			"File",
			class File {
				name: string;
				type: string;

				constructor(_parts: BlobPart[], name: string, options?: FilePropertyBag) {
					this.name = name;
					this.type = options?.type || "";
				}
			},
		);
	});

	it("filters the latest payment by party and party type", async () => {
		const fetchPdf = vi.fn().mockResolvedValue({
			ok: true,
			blob: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
		});
		const { shareLastPayment } = usePaymentSharing({
			customerName: ref("Shared Party"),
			partyType: ref("Supplier"),
			eventBus: { emit: vi.fn() },
			fetchPdf,
			downloadPdfBlob: vi.fn(),
			shareNavigator: {},
		});

		await shareLastPayment();

		expect((globalThis as any).frappe.call).toHaveBeenCalledWith({
			method: "frappe.client.get_list",
			args: expect.objectContaining({
				doctype: "Payment Entry",
				filters: {
					party: "Shared Party",
					party_type: "Supplier",
					docstatus: 1,
				},
			}),
		});
		expect(fetchPdf).toHaveBeenCalledWith(
			expect.stringContaining("doctype=Payment%20Entry&name=ACC-PAY-0001&format=Standard"),
			expect.any(Object),
		);
	});

	it("warns before server calls when payment sharing is requested offline", async () => {
		vi.mocked(isOffline).mockReturnValue(true);
		const eventBus = { emit: vi.fn() };
		const fetchPdf = vi.fn();

		const { shareLastPayment } = usePaymentSharing({
			customerName: ref("Customer A"),
			partyType: ref("Customer"),
			eventBus,
			fetchPdf,
			downloadPdfBlob: vi.fn(),
			shareNavigator: {},
		});

		await shareLastPayment();

		expect((globalThis as any).frappe.call).not.toHaveBeenCalled();
		expect(fetchPdf).not.toHaveBeenCalled();
		expect(eventBus.emit).toHaveBeenCalledWith("show_message", {
			title: "Reconnect to share the last payment PDF.",
			color: "warning",
		});
	});

	it("ignores concurrent share requests while one is in progress", async () => {
		let resolveList: (_value: unknown) => void = () => {};
		(globalThis as any).frappe.call.mockReturnValue(
			new Promise((resolve) => {
				resolveList = resolve;
			}),
		);
		const fetchPdf = vi.fn().mockResolvedValue({
			ok: true,
			blob: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
		});

		const { shareLastPayment, isSharing } = usePaymentSharing({
			customerName: ref("Customer A"),
			partyType: ref("Customer"),
			eventBus: { emit: vi.fn() },
			fetchPdf,
			downloadPdfBlob: vi.fn(),
			shareNavigator: {},
		});

		const firstShare = shareLastPayment();
		await shareLastPayment();

		expect(isSharing.value).toBe(true);
		expect((globalThis as any).frappe.call).toHaveBeenCalledTimes(1);

		resolveList({ message: [{ name: "ACC-PAY-0002" }] });
		await firstShare;

		expect(isSharing.value).toBe(false);
	});
});
