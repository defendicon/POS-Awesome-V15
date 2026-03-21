import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { usePaymentSubmission } from "../src/posapp/composables/pos/payments/usePaymentSubmission";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
	saveOfflineInvoice: vi.fn(),
	updateLocalStock: vi.fn(),
}));

vi.mock("../src/posapp/services/invoiceService", () => ({
	default: {},
}));

describe("usePaymentSubmission", () => {
	it("restores negative return payments back to normal amounts", () => {
		const invoiceDoc = ref<any>({
			is_return: 0,
			payments: [
				{ mode_of_payment: "Cash", amount: -120, base_amount: -120, default: 1 },
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
			{ mode_of_payment: "Cash", amount: 120, base_amount: 120, default: 1 },
			{ mode_of_payment: "Card", amount: 0, base_amount: 0 },
			{ mode_of_payment: "Bank", amount: 35, base_amount: 35 },
		]);
	});
});
