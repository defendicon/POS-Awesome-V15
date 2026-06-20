// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { useInvoiceUI } from "../src/posapp/composables/pos/invoice/useInvoiceUI";

describe("useInvoiceUI payment confirmation", () => {
	it("cancels the pending confirmation when the dialog closes externally", async () => {
		const { confirm_payment_dialog, confirmPaymentSubmission } =
			useInvoiceUI();

		const confirmation = confirmPaymentSubmission(125);
		expect(confirm_payment_dialog.value).toBe(true);

		// Vuetify closes the dialog this way when the operator presses Escape.
		confirm_payment_dialog.value = false;

		await expect(confirmation).resolves.toBeNull();
	});

	it("preserves an explicit confirmation result", async () => {
		const { confirmPaymentSubmission, resolvePaymentConfirmation } =
			useInvoiceUI();

		const confirmation = confirmPaymentSubmission(125);
		resolvePaymentConfirmation(150);

		await expect(confirmation).resolves.toBe(150);
	});
});
