/* @vitest-environment jsdom */
import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useResponsive } from "../src/posapp/composables/core/useResponsive";
import { useInvoiceUI } from "../src/posapp/composables/pos/invoice/useInvoiceUI";
import cartItemRowSource from "../src/posapp/components/pos/invoice/CartItemRow.vue?raw";
import invoiceSummarySource from "../src/posapp/components/pos/invoice/InvoiceSummary.vue?raw";
import itemActionToolbarSource from "../src/posapp/components/pos/items/ItemActionToolbar.vue?raw";
import posShellSource from "../src/posapp/components/pos/shell/Pos.vue?raw";
import itemsSelectorSource from "../src/posapp/components/pos/items/ItemsSelector.vue?raw";
import invoiceSource from "../src/posapp/components/pos/Invoice.vue?raw";

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

	it("keeps invoice summary columns top-aligned to avoid blank space under buttons", () => {
		expect(invoiceSummarySource).toContain('<v-row dense align="start" class="invoice-summary-row">');
		expect(invoiceSummarySource).toContain('<v-col cols="12" md="5" class="invoice-summary-actions-col">');
	});

	it("keeps checkout utility cards auto-height (no manual vertical resize handles)", () => {
		expect(invoiceSummarySource).not.toContain("resize: vertical");
		expect(invoiceSummarySource).not.toContain("resizable");
		expect(itemActionToolbarSource).not.toContain("resize: vertical");
		expect(itemActionToolbarSource).not.toContain("resizable");
	});

	it("anchors checkout bottom panels using full-height flex layout", () => {
		expect(posShellSource).toContain("@media (min-width: 960px)");
		expect(posShellSource).toContain("height: 100%");
		expect(posShellSource).toContain("sm=\"12\"");
		expect(posShellSource).toContain("class=\"dynamic-panel\"");
		expect(posShellSource).toContain("min-width: 0;");
		expect(posShellSource).toContain("display: flex;");
		expect(itemsSelectorSource).toContain('class="items-selector-shell"');
		expect(itemsSelectorSource).toContain('class="items-selector-toolbar"');
		expect(itemsSelectorSource).toContain("margin-top: auto !important;");
		expect(itemsSelectorSource).toContain("width: '100%'");
		expect(itemsSelectorSource).toContain("min-width: 0;");
		expect(invoiceSource).toContain('class="pa-0 invoice-shell"');
		expect(invoiceSource).toContain('class="invoice-summary-panel"');
		expect(invoiceSource).toContain(".invoice-summary-panel");
		expect(invoiceSource).toContain("width: 100%;");
	});

	it("keeps desktop checkout container height adaptive for medium screens", async () => {
		setViewport(1400, 1000);
		const wrapper = mount(ResponsiveHarness);
		await nextTick();

		expect((wrapper.vm as any).responsiveStyles["--container-height"]).toBe("66vh");
		wrapper.unmount();
	});

	it("increases container height for very tall screens", async () => {
		setViewport(1600, 1400);
		const wrapper = mount(ResponsiveHarness);
		await nextTick();

		expect((wrapper.vm as any).responsiveStyles["--container-height"]).toBe("72vh");
		wrapper.unmount();
	});

	it("uses adaptive default when no explicit invoice-height preference is saved", () => {
		const ui = useInvoiceUI();
		ui.loadInvoiceHeight();
		expect(ui.invoiceHeight.value).toBeNull();
	});

	it("caps invoice card height using the saved ratio and viewport-specific max", () => {
		setViewport(1400, 1000);
		localStorage.setItem(
			"posawesome_invoice_height_v2",
			JSON.stringify({ ratio: 0.9 }),
		);
		const tallViewportUi = useInvoiceUI();
		tallViewportUi.loadInvoiceHeight();
		expect(tallViewportUi.invoiceHeight.value).toBe("600px");

		setViewport(1400, 850);
		const mediumViewportUi = useInvoiceUI();
		mediumViewportUi.loadInvoiceHeight();
		expect(mediumViewportUi.invoiceHeight.value).toBe("459px");
	});
});
