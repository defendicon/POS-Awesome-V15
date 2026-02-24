/* @vitest-environment jsdom */
import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useResponsive } from "../src/posapp/composables/core/useResponsive";
import { useInvoiceUI } from "../src/posapp/composables/pos/invoice/useInvoiceUI";
import cartItemRowSource from "../src/posapp/components/pos/invoice/CartItemRow.vue?raw";

function setViewport(width: number, height: number) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		writable: true,
		value: width,
	});
	Object.defineProperty(window, "innerHeight", {
		configurable: true,
		writable: true,
		value: height,
	});
}

const ResponsiveHarness = defineComponent({
	name: "ResponsiveHarness",
	setup() {
		return useResponsive();
	},
	template: "<div />",
});

describe("checkout UI regressions", () => {
	beforeEach(() => {
		setViewport(1400, 1000);
		document.documentElement.style.setProperty("--container-height", "60vh");
		localStorage.clear();
	});

	afterEach(() => {
		document.documentElement.style.removeProperty("--container-height");
		localStorage.clear();
	});

	it("keeps pricing-rule tooltip and qty input guards in CartItemRow", () => {
		expect(cartItemRowSource).toContain('content-class="posa-pricing-rule-tooltip"');
		expect(cartItemRowSource).toContain("hide-details");
		expect(cartItemRowSource).toContain(
			"editingQtyValue.value = props.item.qty != null ? String(props.item.qty) : \"\";",
		);
		expect(cartItemRowSource).toContain("qtyInput.value?.focus?.();");
	});

	it("keeps desktop checkout container height at 60vh", async () => {
		setViewport(1400, 1000);
		const wrapper = mount(ResponsiveHarness);
		await nextTick();

		expect((wrapper.vm as any).responsiveStyles["--container-height"]).toBe("60vh");
		wrapper.unmount();
	});

	it("caps invoice card height using the new 60%/54% limits", () => {
		setViewport(1400, 1000);
		const tallViewportUi = useInvoiceUI();
		tallViewportUi.loadInvoiceHeight();
		expect(tallViewportUi.invoiceHeight.value).toBe("600px");

		setViewport(1400, 850);
		localStorage.setItem("posawesome_invoice_height", "900px");
		const mediumViewportUi = useInvoiceUI();
		mediumViewportUi.loadInvoiceHeight();
		expect(mediumViewportUi.invoiceHeight.value).toBe("459px");
	});
});
