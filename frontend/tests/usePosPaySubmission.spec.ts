import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePosPaySubmission } from "../src/posapp/composables/pos/payments/usePosPaySubmission";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
	saveOfflinePayment: vi.fn(),
}));

describe("usePosPaySubmission", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).flt = (value: unknown) => Number(value || 0);
		(globalThis as any).frappe = {
			throw: (message: string) => {
				throw new Error(message);
			},
			call: vi.fn(),
			msgprint: vi.fn(),
			utils: {
				play_sound: vi.fn(),
			},
		};
	});

	it("triggers auto reconcile after a successful submit when auto allocation is enabled", async () => {
		(globalThis as any).frappe.call.mockImplementation(({ callback }: any) => {
			callback({
				message: {
					new_payments_entry: [{ name: "ACC-PAY-0001" }],
				},
			});
		});

		const autoReconcile = vi.fn().mockResolvedValue({
			summary: "Allocated $120 across 2 payment(s). Remaining outstanding: $0 across 0 invoice(s).",
			total_allocated: 120,
		});
		const getOutstandingInvoices = vi.fn();
		const getUnallocatedPayments = vi.fn();
		const getDraftMpesaPaymentsRegister = vi.fn();
		const setMpesaSearchParams = vi.fn();
		const eventBus = { emit: vi.fn() };

		const { processPayment } = usePosPaySubmission({
			customerName: ref("Customer 727"),
			company: ref("Test Company"),
			posProfile: ref({ name: "Main POS" }),
			posOpeningShift: ref({ name: "POS-OPEN-0001" }),
			exchangeRate: ref(1),
			invoiceTotalCurrency: ref("USD"),
			autoAllocatePaymentAmount: ref(true),
			payment_methods: ref([{ mode_of_payment: "Cash", amount: 100 }]),
			selected_invoices: ref([]),
			selected_payments: ref([{ name: "ACC-PAY-EXISTING-1", unallocated_amount: 20 }]),
			selected_mpesa_payments: ref([{ name: "MPESA-1", amount: 10 }]),
			total_selected_invoices: ref(0),
			total_selected_payments: ref(20),
			total_selected_mpesa_payments: ref(10),
			total_payment_methods: ref(100),
			clearSelections: vi.fn(),
			load_print_page: vi.fn(),
			eventBus,
			get_outstanding_invoices: getOutstandingInvoices,
			get_unallocated_payments: getUnallocatedPayments,
			get_draft_mpesa_payments_register: getDraftMpesaPaymentsRegister,
			set_mpesa_search_params: setMpesaSearchParams,
			autoReconcile,
		});

		await processPayment();

		expect(autoReconcile).toHaveBeenCalledTimes(1);
		expect(autoReconcile).toHaveBeenCalledWith("Main POS", {
			suppressToast: true,
		});
		expect(eventBus.emit).toHaveBeenCalledWith("show_message", {
			title: "Payment submitted. Allocated $120 across 2 payment(s). Remaining outstanding: $0 across 0 invoice(s).",
			color: "success",
		});
		expect(getOutstandingInvoices).toHaveBeenCalled();
		expect(getUnallocatedPayments).toHaveBeenCalled();
	});

	it("skips post-submit auto reconcile when auto allocation is disabled", async () => {
		(globalThis as any).frappe.call.mockImplementation(({ callback }: any) => {
			callback({
				message: {
					new_payments_entry: [{ name: "ACC-PAY-0002" }],
				},
			});
		});

		const autoReconcile = vi.fn().mockResolvedValue(undefined);

		const { processPayment } = usePosPaySubmission({
			customerName: ref("Customer 727"),
			company: ref("Test Company"),
			posProfile: ref({ name: "Main POS" }),
			posOpeningShift: ref({ name: "POS-OPEN-0001" }),
			exchangeRate: ref(1),
			invoiceTotalCurrency: ref("USD"),
			autoAllocatePaymentAmount: ref(false),
			payment_methods: ref([{ mode_of_payment: "Cash", amount: 100 }]),
			selected_invoices: ref([]),
			selected_payments: ref([{ name: "ACC-PAY-EXISTING-1", unallocated_amount: 20 }]),
			selected_mpesa_payments: ref([]),
			total_selected_invoices: ref(0),
			total_selected_payments: ref(20),
			total_selected_mpesa_payments: ref(0),
			total_payment_methods: ref(100),
			clearSelections: vi.fn(),
			load_print_page: vi.fn(),
			eventBus: { emit: vi.fn() },
			get_outstanding_invoices: vi.fn(),
			get_unallocated_payments: vi.fn(),
			get_draft_mpesa_payments_register: vi.fn(),
			set_mpesa_search_params: vi.fn(),
			autoReconcile,
		});

		await processPayment();

		expect(autoReconcile).not.toHaveBeenCalled();
	});
});
