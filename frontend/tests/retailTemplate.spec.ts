import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
	RETAIL_MIN_WIDTH,
	POS_UI_TEMPLATE_CLASSIC,
	POS_UI_TEMPLATE_RETAIL,
	isCounterGridTemplate,
	isRetailTemplate,
	normalizePosUiTemplate,
	resolvePosUiTemplate,
} from "../src/posapp/utils/posUiTemplate";
import { retailItemLabel } from "../src/posapp/utils/retailItemLabel";

describe("POS Awesome template", () => {
	it("offers the same profile options on the server and preserves the Classic default", () => {
		const fields = JSON.parse(readFileSync(new URL("../../posawesome/fixtures/custom_field.json", import.meta.url), "utf8"));
		const template = fields.find((field: { name: string }) => field.name === "POS Profile-posa_ui_template");
		expect(template.options.split("\n")).toContain(POS_UI_TEMPLATE_RETAIL);
		expect(template.default).toBe(POS_UI_TEMPLATE_CLASSIC);
		const patch = readFileSync(new URL("../../posawesome/patches/add_pos_ui_template.py", import.meta.url), "utf8");
		expect(patch).toContain(POS_UI_TEMPLATE_RETAIL);
	});
	it("is recognised as its own template", () => {
		expect(normalizePosUiTemplate("POS Awesome Retail")).toBe(POS_UI_TEMPLATE_RETAIL);
		expect(isRetailTemplate({ posa_ui_template: "POS Awesome Retail" }, 1440)).toBe(true);
		expect(isCounterGridTemplate({ posa_ui_template: "POS Awesome Retail" }, 1440)).toBe(false);
	});

	it("falls back to Classic below the Retail minimum width", () => {
		const profile = { posa_ui_template: POS_UI_TEMPLATE_RETAIL };
		expect(isRetailTemplate(profile, RETAIL_MIN_WIDTH - 1)).toBe(false);
		expect(isRetailTemplate(profile, RETAIL_MIN_WIDTH)).toBe(true);
		expect(resolvePosUiTemplate(profile, 1024)).toEqual({
			configuredTemplate: POS_UI_TEMPLATE_RETAIL,
			effectiveTemplate: POS_UI_TEMPLATE_CLASSIC,
			fallbackReason: "viewport",
		});
	});

	it("keeps Classic profiles on Classic", () => {
		expect(isRetailTemplate({ posa_ui_template: "Classic" }, 1920)).toBe(false);
		expect(isRetailTemplate({}, 1920)).toBe(false);
	});
});

describe("Retail tile labels", () => {
	it("uses a trailing size code when present", () => {
		expect(retailItemLabel({ item_name: "Bakl-BLA-S" })).toBe("S");
		expect(retailItemLabel({ item_name: "Bakl-RED-XL" })).toBe("XL");
		expect(retailItemLabel({ item_name: "Shirt m" })).toBe("M");
	});

	it("falls back to initials, then the item code", () => {
		expect(retailItemLabel({ item_name: "Chocolate Cake" })).toBe("CC");
		expect(retailItemLabel({ item_name: "Cupcake" })).toBe("C");
		expect(retailItemLabel({ item_code: "POSA-TEST-A" })).toBe("PT");
		expect(retailItemLabel({})).toBe("?");
	});
});
