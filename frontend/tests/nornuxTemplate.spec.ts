import { describe, expect, it } from "vitest";

import {
	NORNUX_MIN_WIDTH,
	POS_UI_TEMPLATE_CLASSIC,
	POS_UI_TEMPLATE_NORNUX,
	isCounterGridTemplate,
	isNornuxTemplate,
	normalizePosUiTemplate,
	resolvePosUiTemplate,
} from "../src/posapp/utils/posUiTemplate";
import { nornuxItemLabel } from "../src/posapp/utils/nornuxItemLabel";

describe("Nornux POS template", () => {
	it("is recognised as its own template", () => {
		expect(normalizePosUiTemplate("Nornux")).toBe(POS_UI_TEMPLATE_NORNUX);
		expect(isNornuxTemplate({ posa_ui_template: "Nornux" }, 1440)).toBe(true);
		expect(isCounterGridTemplate({ posa_ui_template: "Nornux" }, 1440)).toBe(false);
	});

	it("falls back to Classic below the Nornux minimum width", () => {
		const profile = { posa_ui_template: POS_UI_TEMPLATE_NORNUX };
		expect(isNornuxTemplate(profile, NORNUX_MIN_WIDTH - 1)).toBe(false);
		expect(isNornuxTemplate(profile, NORNUX_MIN_WIDTH)).toBe(true);
		expect(resolvePosUiTemplate(profile, 1024)).toEqual({
			configuredTemplate: POS_UI_TEMPLATE_NORNUX,
			effectiveTemplate: POS_UI_TEMPLATE_CLASSIC,
			fallbackReason: "viewport",
		});
	});

	it("keeps Classic profiles on Classic", () => {
		expect(isNornuxTemplate({ posa_ui_template: "Classic" }, 1920)).toBe(false);
		expect(isNornuxTemplate({}, 1920)).toBe(false);
	});
});

describe("Nornux tile labels", () => {
	it("uses a trailing size code when present", () => {
		expect(nornuxItemLabel({ item_name: "Bakl-BLA-S" })).toBe("S");
		expect(nornuxItemLabel({ item_name: "Bakl-RED-XL" })).toBe("XL");
		expect(nornuxItemLabel({ item_name: "Shirt m" })).toBe("M");
	});

	it("falls back to initials, then the item code", () => {
		expect(nornuxItemLabel({ item_name: "Chocolate Cake" })).toBe("CC");
		expect(nornuxItemLabel({ item_name: "Cupcake" })).toBe("C");
		expect(nornuxItemLabel({ item_code: "POSA-TEST-A" })).toBe("PT");
		expect(nornuxItemLabel({})).toBe("?");
	});
});
