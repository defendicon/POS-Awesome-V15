import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePaymentSubmission } from "../src/posapp/composables/pos/payments/usePaymentSubmission";
import { ApiEnvelopeError } from "../src/posapp/services/api";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
	saveOfflineInvoice: vi.fn(),
	updateLocalStock: vi.fn(),
}));

vi.mock("../src/posapp/services/invoiceService", () => ({
	default: {
		submitInvoice: vi.fn(),
	},
}));

vi.mock("../src/posapp/utils/stockCoordinator", () => ({
	default: {
		applyInvoiceConsumption: vi.fn(),
	},
}));

describe("usePaymentSubmission", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("__", (value: string, args?: any[]) => {
			if (!args?.length) return value;
			return value.replace(/\{(\d+)\}/g, (_match, index) =>
				String(args[Number(index)] ?? ""),
			);
		});
		vi.stubGlobal("frappe", {
			utils: {
				play_sound: vi.fn(),
			},
		});
	});

	it("restores negative return payments back to normal amounts", () => {
		const invoiceDoc = ref<any>({
			is_return: 0,
			payments: [
				{
					mode_of_payment: "Cash",
					amount: -120,
					base_amount: -120,
					default: 1,
				},
				{ mode_of_payment: "Card", amount: 0, base_amount: 0 },
				{ mode_of_payment: "Bank", amount: 35, base_amount: 35 },
			],
		});

		const { restoreReturnPayments } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			isCashback: ref(true),
		});

		restoreReturnPayments();

		expect(invoiceDoc.value.payments).toEqual([
			{
				mode_of_payment: "Cash",
				amount: 120,
				base_amount: 120,
				default: 1,
			},
			{ mode_of_payment: "Card", amount: 0, base_amount: 0 },
			{ mode_of_payment: "Bank", amount: 35, base_amount: 35 },
		]);
	});

	it("defers print and schedules background wait when invoice submission is queued", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0001",
			doctype: "Sales Invoice",
			status: 0,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0001",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [],
			payments: [{ mode_of_payment: "Cash", amount: 690, type: "Cash" }],
			rounded_total: 690,
			grand_total: 690,
		});
		const onPrint = vi.fn();
		const onScheduleBackgroundCheck = vi.fn();

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(true),
			paidChange: ref(10),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(100),
			customerCreditDict: ref([]),
			diff_payment: ref(-10),
		});

		await submitInvoice(true, {
			onPrint,
			onScheduleBackgroundCheck,
			onFinishNavigation: vi.fn(),
		});

		expect(onPrint).not.toHaveBeenCalled();
		expect(onScheduleBackgroundCheck).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "ACC-SINV-0001",
				doctype: "Sales Invoice",
				print: true,
				waitForInvoiceProcessing: true,
				waitForPostSubmitPayments: true,
			}),
		);
	});

	it("schedules deferred printing instead of calling onPrint when post-submit work remains", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0002",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0002",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [],
			payments: [{ mode_of_payment: "Cash", amount: 690, type: "Cash" }],
			rounded_total: 690,
			grand_total: 690,
		});
		const onPrint = vi.fn();
		const onScheduleBackgroundCheck = vi.fn();

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(true),
			paidChange: ref(10),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(100),
			customerCreditDict: ref([]),
			diff_payment: ref(-10),
		});

		await submitInvoice(true, {
			onPrint,
			onFinishNavigation: vi.fn(),
			onScheduleBackgroundCheck,
		});

		expect(onPrint).not.toHaveBeenCalled();
		expect(onScheduleBackgroundCheck).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "ACC-SINV-0002",
				doctype: "Sales Invoice",
				waitForInvoiceProcessing: false,
				waitForPostSubmitPayments: true,
			}),
		);
	});

	it("prints immediately when there is no deferred post-submit work", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0004",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0004",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [],
			payments: [{ mode_of_payment: "Cash", amount: 690, type: "Cash" }],
			rounded_total: 690,
			grand_total: 690,
		});
		const onPrint = vi.fn();
		const onScheduleBackgroundCheck = vi.fn();

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(true),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await submitInvoice(true, {
			onPrint,
			onFinishNavigation: vi.fn(),
			onScheduleBackgroundCheck,
		});

		expect(onPrint).toHaveBeenCalledWith(
			invoiceDoc.value,
			expect.objectContaining({
				name: "ACC-SINV-0004",
				doctype: "Sales Invoice",
				waitForInvoiceProcessing: false,
				waitForPostSubmitPayments: false,
			}),
		);
		expect(onScheduleBackgroundCheck).not.toHaveBeenCalled();
	});

	it("shows a merged processing toast instead of a plain success toast when post-submit payments are pending", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0003",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0003",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [],
			payments: [{ mode_of_payment: "Cash", amount: 690, type: "Cash" }],
			rounded_total: 690,
			grand_total: 690,
		});
		const toastShow = vi.fn();

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: toastShow },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(true),
			paidChange: ref(10),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(100),
			customerCreditDict: ref([]),
			diff_payment: ref(-10),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
			onScheduleBackgroundCheck: vi.fn(),
		});

		expect(toastShow).toHaveBeenCalledWith(
			expect.objectContaining({
				key: "invoice-processing::ACC-SINV-0003",
				title: "Invoice Submitted",
				loading: true,
			}),
		);
	});

	it("includes gift card redemptions in the submit payload", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0005",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0005",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [],
			payments: [{ mode_of_payment: "Cash", amount: 390, type: "Cash" }],
			rounded_total: 690,
			grand_total: 690,
		});

		const giftCardRedemptions = ref([
			{
				gift_card_code: "GC-0001",
				amount: 300,
				cashier: "cashier@example.com",
			},
		]);

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			giftCardRedemptions,
			diff_payment: ref(390),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
			onScheduleBackgroundCheck: vi.fn(),
		});

		expect(invoiceService.submitInvoice).toHaveBeenCalledWith(
			expect.objectContaining({
				gift_card_redemptions: [
					expect.objectContaining({
						gift_card_code: "GC-0001",
						amount: 300,
					}),
				],
			}),
			expect.objectContaining({
				payments: [
					expect.objectContaining({
						mode_of_payment: "Cash",
						amount: 390,
					}),
				],
			}),
			"Invoice",
			expect.any(Object),
		);
	});

	it("adds a stable client request id to invoice submissions", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0099",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0099",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 50, type: "Cash" }],
			rounded_total: 50,
			grand_total: 50,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		const [, submittedDoc] = (invoiceService.submitInvoice as any).mock
			.calls[0];
		expect(submittedDoc.posa_client_request_id).toEqual(expect.any(String));
		expect(invoiceDoc.value.posa_client_request_id).toBe(
			submittedDoc.posa_client_request_id,
		);
	});

	it("computes base write-off amount with the invoice conversion rate", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-MC-WRITEOFF",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-MC-WRITEOFF",
			doctype: "Sales Invoice",
			currency: "USD",
			conversion_rate: 280,
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 90, type: "Cash" }],
			rounded_total: 100,
			grand_total: 100,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				currency: "PKR",
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(10),
			is_write_off_change: ref(true),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		const [, submittedDoc] = (invoiceService.submitInvoice as any).mock
			.calls[0];
		expect(submittedDoc.write_off_amount).toBe(10);
		expect(submittedDoc.base_write_off_amount).toBe(2800);
	});

	it("reuses the same client request id across repeated invoice submit attempts", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0100",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0100",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 50, type: "Cash" }],
			rounded_total: 50,
			grand_total: 50,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});
		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		const firstSubmittedDoc = (invoiceService.submitInvoice as any).mock
			.calls[0][1];
		const secondSubmittedDoc = (invoiceService.submitInvoice as any).mock
			.calls[1][1];

		expect(firstSubmittedDoc.posa_client_request_id).toEqual(
			expect.any(String),
		);
		expect(secondSubmittedDoc.posa_client_request_id).toBe(
			firstSubmittedDoc.posa_client_request_id,
		);
		expect(invoiceDoc.value.posa_client_request_id).toBe(
			firstSubmittedDoc.posa_client_request_id,
		);
	});

	it("normalizes loyalty redemption fields before online submit", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-LOYALTY-ONLINE",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-LOYALTY-ONLINE",
			doctype: "Sales Invoice",
			is_return: 0,
			customer: "CUST-LOYALTY",
			company: "Test Company",
			currency: "USD",
			conversion_rate: 1,
			update_stock: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 60, type: "Cash" }],
			rounded_total: 100,
			grand_total: 100,
			loyalty_amount: 0,
			redeem_loyalty_points: 0,
			loyalty_points: 0,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				name: "Main POS",
				company: "Test Company",
				currency: "USD",
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
			loyaltyAmount: ref(40),
			customerInfo: ref({
				name: "CUST-LOYALTY",
				loyalty_program: "Retail Loyalty",
				conversion_factor: 10,
			}),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		const [, submittedDoc] = (invoiceService.submitInvoice as any).mock
			.calls[0];
		expect(submittedDoc).toEqual(
			expect.objectContaining({
				loyalty_amount: 40,
				redeem_loyalty_points: 1,
				loyalty_points: 4,
				loyalty_program: "Retail Loyalty",
			}),
		);
	});

	it("normalizes loyalty redemption fields before saving an offline invoice", async () => {
		const offlineModule = await import("../src/offline/index");
		(offlineModule.isOffline as any).mockReturnValue(true);

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-LOYALTY-OFFLINE",
			doctype: "Sales Invoice",
			is_return: 0,
			customer: "CUST-LOYALTY",
			company: "Test Company",
			currency: "USD",
			conversion_rate: 1,
			update_stock: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 60, type: "Cash" }],
			rounded_total: 100,
			grand_total: 100,
			loyalty_amount: 0,
			redeem_loyalty_points: 0,
			loyalty_points: 0,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				name: "Main POS",
				company: "Test Company",
				currency: "USD",
				customer: "Default Customer",
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				syncStore: { updatePendingCount: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
			loyaltyAmount: ref(40),
			customerInfo: ref({
				name: "CUST-LOYALTY",
				loyalty_program: "Retail Loyalty",
				conversion_factor: 10,
			}),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		expect(offlineModule.saveOfflineInvoice).toHaveBeenCalledWith(
			expect.objectContaining({
				invoice: expect.objectContaining({
					loyalty_amount: 40,
					redeem_loyalty_points: 1,
					loyalty_points: 4,
					loyalty_program: "Retail Loyalty",
				}),
			}),
		);

		(offlineModule.isOffline as any).mockReturnValue(false);
	});

	it("blocks offline invoice save when gift card redemption is present", async () => {
		const offlineModule = await import("../src/offline/index");
		(offlineModule.isOffline as any).mockReturnValue(true);

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0006",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [
				{ mode_of_payment: "Gift Card", amount: 300, type: "Bank" },
			],
			rounded_total: 300,
			grand_total: 300,
		});

		const giftCardRedemptions = ref([
			{
				gift_card_code: "GC-0002",
				amount: 300,
				cashier: "cashier@example.com",
			},
		]);

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				syncStore: { updatePendingCount: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			giftCardRedemptions,
			diff_payment: ref(0),
		});

		await expect(
			submitInvoice(false, {
				onFinishNavigation: vi.fn(),
			}),
		).rejects.toThrow("Gift card redemption requires an online connection");

		(offlineModule.isOffline as any).mockReturnValue(false);
	});

	it("submits gift card redemptions without requiring a gift card payment row", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0007",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0007",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [
				{
					mode_of_payment: "Cash",
					type: "Cash",
					account: "1110 - Cash",
					amount: 0,
				},
			],
			rounded_total: 300,
			grand_total: 300,
		});

		const giftCardRedemptions = ref([
			{
				gift_card_code: "GC-ONLY",
				amount: 300,
				cashier: "cashier@example.com",
			},
		]);

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
				posa_allow_partial_payment: 0,
				payments: [
					{
						mode_of_payment: "Cash",
						type: "Cash",
						account: "1110 - Cash",
						default: 1,
					},
				],
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			giftCardRedemptions,
			diff_payment: ref(0),
		});

		await expect(
			submitInvoice(false, {
				onFinishNavigation: vi.fn(),
			}),
		).resolves.not.toThrow();

		expect(invoiceService.submitInvoice).toHaveBeenCalledWith(
			expect.objectContaining({
				gift_card_redemptions: [
					expect.objectContaining({
						gift_card_code: "GC-ONLY",
						amount: 300,
					}),
				],
			}),
			expect.objectContaining({
				payments: [
					expect.objectContaining({
						mode_of_payment: "Cash",
						amount: 0,
						account: "1110 - Cash",
					}),
				],
			}),
			"Invoice",
			expect.any(Object),
		);
	});

	it("maps validation envelope failures and preserves the request id", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockRejectedValue(
			new ApiEnvelopeError({
				ok: false,
				data: null,
				error: {
					code: "VALIDATION_ERROR",
					message: "Customer is required",
					retryable: false,
				},
				requestId: "req-validation-1",
				serverTime: "2026-05-01T06:00:00Z",
			}),
		);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const toastStore = { show: vi.fn() };

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-VALIDATION",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 100, type: "Cash" }],
			rounded_total: 100,
			grand_total: 100,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore,
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await expect(
			submitInvoice(false, {
				onFinishNavigation: vi.fn(),
			}),
		).rejects.toThrow("Customer is required");

		expect(toastStore.show).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Unable to submit invoice",
				detail: expect.stringContaining("req-validation-1"),
				color: "error",
			}),
		);
		expect(consoleError).toHaveBeenCalledWith(
			"Error submitting invoice:",
			expect.objectContaining({
				code: "VALIDATION_ERROR",
				requestId: "req-validation-1",
			}),
		);
		consoleError.mockRestore();
	});

	it("normalizes return payment rows before submit even when cashback is disabled", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-RETURN-0001",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-RETURN-0001",
			doctype: "Sales Invoice",
			is_return: 1,
			items: [{ item_code: "ITEM-1", qty: -1 }],
			payments: [
				{
					mode_of_payment: "Cash",
					amount: 90,
					base_amount: 90,
					type: "Cash",
				},
			],
			rounded_total: -90,
			grand_total: -90,
		});

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			stockSettings: ref({}),
			invoiceType: ref("Return"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await submitInvoice(false, {
			onFinishNavigation: vi.fn(),
		});

		const [, submittedDoc] = (invoiceService.submitInvoice as any).mock
			.calls[0];
		expect(submittedDoc.payments).toEqual([
			expect.objectContaining({
				mode_of_payment: "Cash",
				amount: -90,
				base_amount: -90,
			}),
		]);
	});

	it("allows cashback validation for returns without an original invoice", async () => {
		const invoiceDoc = ref<any>({
			name: "ACC-SINV-RETURN-WITHOUT-INVOICE",
			doctype: "Sales Invoice",
			is_return: 1,
			items: [{ item_code: "ITEM-1", qty: -1 }],
			payments: [
				{
					mode_of_payment: "Cash",
					amount: -2625,
					base_amount: -2625,
					type: "Cash",
				},
			],
			rounded_total: -2625,
			grand_total: -2625,
			posa_refundable_amount: 0,
		});

		const { validateSubmission } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({}),
			stockSettings: ref({}),
			invoiceType: ref("Return"),
			formatFloat: (value) => Number(value || 0),
			isCashback: ref(true),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await expect(validateSubmission(false)).resolves.toBe(true);
	});

	it("rejects cashback above paid amount for returns against an original invoice", async () => {
		const invoiceDoc = ref<any>({
			name: "ACC-SINV-RETURN-AGAINST-INVOICE",
			doctype: "Sales Invoice",
			is_return: 1,
			return_against: "ACC-SINV-0001",
			items: [{ item_code: "ITEM-1", qty: -1 }],
			payments: [
				{
					mode_of_payment: "Cash",
					amount: -2625,
					base_amount: -2625,
					type: "Cash",
				},
			],
			rounded_total: -2625,
			grand_total: -2625,
			posa_refundable_amount: 0,
		});

		const { validateSubmission } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({}),
			stockSettings: ref({}),
			invoiceType: ref("Return"),
			formatFloat: (value) => Number(value || 0),
			isCashback: ref(true),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			diff_payment: ref(0),
		});

		await expect(validateSubmission(false)).rejects.toThrow(
			"Cannot refund 2625 for this return: only 0 was paid on the original invoice",
		);
	});

	it("allows gift card submission when no gift card mode of payment is configured", async () => {
		const invoiceService = (
			await import("../src/posapp/services/invoiceService")
		).default;
		(invoiceService.submitInvoice as any).mockResolvedValue({
			name: "ACC-SINV-0008",
			doctype: "Sales Invoice",
			docstatus: 1,
		});

		const invoiceDoc = ref<any>({
			name: "ACC-SINV-0008",
			doctype: "Sales Invoice",
			is_return: 0,
			items: [{ item_code: "ITEM-1", qty: 1 }],
			payments: [{ mode_of_payment: "Cash", amount: 0, type: "Cash" }],
			rounded_total: 300,
			grand_total: 300,
		});

		const giftCardRedemptions = ref([
			{
				gift_card_code: "GC-MISSING",
				amount: 300,
				cashier: "cashier@example.com",
			},
		]);

		const { submitInvoice } = usePaymentSubmission({
			invoiceDoc,
			posProfile: ref({
				posa_allow_submissions_in_background_job: 0,
				create_pos_invoice_instead_of_sales_invoice: 0,
				posa_allow_partial_payment: 0,
				payments: [
					{
						mode_of_payment: "Cash",
						type: "Cash",
						account: "1110 - Cash",
						default: 1,
					},
				],
			}),
			stockSettings: ref({}),
			invoiceType: ref("Invoice"),
			formatFloat: (value) => Number(value || 0),
			stores: {
				toastStore: { show: vi.fn() },
				uiStore: {
					setLastInvoice: vi.fn(),
					setLastStockAdjustment: vi.fn(),
				},
				customersStore: { setSelectedCustomer: vi.fn() },
				invoiceStore: { invoiceDoc: invoiceDoc.value },
			},
			isCashback: ref(false),
			paidChange: ref(0),
			creditChange: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			giftCardRedemptions,
			diff_payment: ref(0),
		});

		await expect(
			submitInvoice(false, {
				onFinishNavigation: vi.fn(),
			}),
		).resolves.not.toThrow();

		expect(invoiceService.submitInvoice).toHaveBeenCalledWith(
			expect.objectContaining({
				gift_card_redemptions: [
					expect.objectContaining({
						gift_card_code: "GC-MISSING",
						amount: 300,
					}),
				],
			}),
			expect.objectContaining({
				payments: [
					expect.objectContaining({
						mode_of_payment: "Cash",
						amount: 0,
					}),
				],
			}),
			"Invoice",
			expect.any(Object),
		);
	});
});
