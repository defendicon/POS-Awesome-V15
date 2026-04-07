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
});
