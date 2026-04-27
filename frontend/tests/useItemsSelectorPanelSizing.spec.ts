import { describe, expect, it } from "vitest";
import { ref } from "vue";

import { useItemsSelectorPanelSizing } from "../src/posapp/composables/pos/items/useItemsSelectorPanelSizing";

describe("useItemsSelectorPanelSizing", () => {
	it("uses the responsive container height and enables vertical resize on large screens", () => {
		const sizing = useItemsSelectorPanelSizing({
			isPhone: ref(false),
			windowWidth: ref(1280),
			windowHeight: ref(860),
			responsiveStyles: ref({ "--container-height": "640px" }),
		});

		expect(sizing.canResizeSelectorPanel.value).toBe(true);
		expect(sizing.selectorCardStyle.value).toMatchObject({
			height: "640px",
			maxHeight: "640px",
			minHeight: "640px",
			resize: "vertical",
			overflow: "auto",
			position: "relative",
		});
	});

	it("disables vertical resize below the desktop threshold", () => {
		const sizing = useItemsSelectorPanelSizing({
			isPhone: ref(false),
			windowWidth: ref(1279),
			windowHeight: ref(860),
			responsiveStyles: ref({ "--container-height": "640px" }),
		});

		expect(sizing.canResizeSelectorPanel.value).toBe(false);
		expect(sizing.selectorCardStyle.value.resize).toBe("none");
	});

	it("uses the phone viewport height constraints on phones", () => {
		const sizing = useItemsSelectorPanelSizing({
			isPhone: ref(true),
			windowWidth: ref(390),
			windowHeight: ref(780),
			responsiveStyles: ref({ "--container-height": "640px" }),
		});

		expect(sizing.selectorCardStyle.value).toMatchObject({
			height: "calc(var(--viewport-height) - var(--bottom-safe-space) - 24px)",
			maxHeight: "calc(var(--viewport-height) - var(--bottom-safe-space) - 24px)",
			minHeight: "calc(var(--viewport-height) * 0.46)",
			resize: "none",
		});
	});
});
