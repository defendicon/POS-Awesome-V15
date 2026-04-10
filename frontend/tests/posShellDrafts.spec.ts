import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Pos shell drafts placement", () => {
	it("does not mount a shell-level drafts rail in Pos.vue", () => {
		const source = readFileSync(
			resolve("src/posapp/components/pos/shell/Pos.vue"),
			"utf8",
		);

		expect(source).not.toContain("<ParkedOrdersRail");
		expect(source).not.toContain('from "../invoice/ParkedOrdersRail.vue"');
	});

	it("keeps customer and item startup ownership out of Pos.vue shell watchers", () => {
		const source = readFileSync(
			resolve("src/posapp/components/pos/shell/Pos.vue"),
			"utf8",
		);

		expect(source).not.toContain("customersStore.get_customer_names()");
	});

	it("centralizes initial item startup in DefaultLayout", () => {
		const source = readFileSync(
			resolve("src/posapp/layouts/DefaultLayout.vue"),
			"utf8",
		);

		expect(source).toContain("await itemsStore.initialize(profile, null, null);");
		expect(source).toContain("createDefaultLayoutStartup");
	});
});
