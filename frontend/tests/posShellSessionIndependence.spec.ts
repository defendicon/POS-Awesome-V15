import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("POS shell session ownership", () => {
	it("keeps opening dialog and session recovery out of Pos.vue", () => {
		const source = readFileSync(
			resolve("src/posapp/components/pos/shell/Pos.vue"),
			"utf8",
		);

		expect(source).not.toContain("<OpeningDialog");
		expect(source).not.toContain("check_opening_entry");
		expect(source).not.toContain('from "../shift/OpeningDialog.vue"');
	});

	it("keeps payment route session recovery out of PayView.vue", () => {
		const source = readFileSync(
			resolve("src/features/checkout/components/PayView.vue"),
			"utf8",
		);

		expect(source).not.toContain("const check_opening_entry = async () =>");
		expect(source).not.toContain("getValidCachedOpeningForCurrentUser");
		expect(source).not.toContain('method: "posawesome.posawesome.api.shifts.check_opening_shift"');
	});

	it("keeps payment preparation out of Payments.vue event-bus listeners", () => {
		const source = readFileSync(
			resolve("src/posapp/components/pos/Payments.vue"),
			"utf8",
		);

		expect(source).not.toContain('eventBus.on("send_invoice_doc_payment"');
		expect(source).not.toContain('eventBus.on("register_pos_profile"');
	});

	it("moves checkout start ownership into DefaultLayout instead of Pos.vue", () => {
		const layoutSource = readFileSync(
			resolve("src/posapp/layouts/DefaultLayout.vue"),
			"utf8",
		);
		const posSource = readFileSync(
			resolve("src/posapp/components/pos/shell/Pos.vue"),
			"utf8",
		);

		expect(layoutSource).toContain("startCheckout");
		expect(posSource).not.toContain("startCheckout(");
	});

	it("keeps usePosShift focused on closing shift behavior only", () => {
		const source = readFileSync(
			resolve("src/posapp/composables/pos/shared/usePosShift.ts"),
			"utf8",
		);

		expect(source).not.toContain("function applyRegisterData");
		expect(source).not.toContain("check_opening_entry");
		expect(source).toContain("get_closing_data");
	});
});
