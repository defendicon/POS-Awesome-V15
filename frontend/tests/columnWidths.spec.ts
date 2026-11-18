// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import {
	clampColumnWidth,
	useColumnWidths,
} from "../src/posapp/composables/core/useColumnWidths";

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});
const scopeKey = "posawesome:column-order:v1:scope";
const widthsKey = "posawesome:column-widths:v1:scope";

function harness() {
	const root = ref<HTMLElement | null>(null);
	const scope = ref(scopeKey);
	const available = ref([
		{ key: "item_name", title: "Name", width: 200 },
		{ key: "qty", title: "QTY", width: 100 },
		{ key: "data-table-expand", title: "Details", width: 48 },
	]);
	let api!: ReturnType<typeof useColumnWidths>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useColumnWidths(root, scope);
				return () =>
					h(
						"div",
						{
							ref: root,
							onPointerdownCapture: api.onPointerDown,
							onKeydownCapture: api.onKeydown,
							onDblclickCapture: api.onDoubleClick,
						},
						h(
							"table",
							h(
								"thead",
								h(
									"tr",
									api
										.apply(available.value)
										.map((column) =>
											h("th", column.headerProps, [
												h(
													"button",
													{
														"data-column-width-key":
															column.key,
													},
													column.title,
												),
											]),
										),
								),
							),
						),
					);
			},
		}),
	);
	for (const column of available.value)
		vi.spyOn(
			wrapper.find(`[data-column-width-id="${column.key}"]`).element,
			"getBoundingClientRect",
		).mockReturnValue({ width: column.width } as DOMRect);
	const start = (key = "item_name", x = 200) =>
		wrapper
			.find(`[data-column-width-key="${key}"]`)
			.element.dispatchEvent(
				new MouseEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: x,
				}),
			);
	return { wrapper, api, scope, available, start };
}

describe("column widths", () => {
	it("previews exact widths, freezes adjacent columns and persists only on release", async () => {
		localStorage.setItem(scopeKey, '["qty","item_name"]');
		const { wrapper, api, start } = harness();
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 280, cancelable: true }),
		);
		await nextTick();
		expect(api.widths.value).toEqual({
			item_name: 280,
			qty: 100,
			"data-table-expand": 48,
		});
		expect(
			api.tableStyle(
				api.apply([
					{ key: "item_name" },
					{ key: "qty" },
					{ key: "data-table-expand" },
				]),
			),
		).toEqual({ "--pos-custom-table-width": "428px" });
		expect(localStorage.getItem(widthsKey)).toBeNull();
		window.dispatchEvent(new MouseEvent("pointerup"));
		await nextTick();
		expect(JSON.parse(localStorage.getItem(widthsKey)!)).toEqual(
			api.widths.value,
		);
		expect(localStorage.getItem(scopeKey)).toBe('["qty","item_name"]');
		wrapper.unmount();
		const restored = harness();
		expect(restored.api.widths.value.item_name).toBe(280);
		restored.wrapper.unmount();
	});

	it("cancels on Escape, lost pointer and scope change without overwriting preferences", async () => {
		const { wrapper, api, start, scope } = harness();
		for (const cancel of [
			() =>
				window.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Escape" }),
				),
			() => window.dispatchEvent(new Event("pointercancel")),
			() => window.dispatchEvent(new Event("blur")),
		]) {
			start();
			window.dispatchEvent(
				new MouseEvent("pointermove", {
					clientX: 300,
					cancelable: true,
				}),
			);
			cancel();
			expect(api.widths.value).toEqual({});
			expect(localStorage.getItem(widthsKey)).toBeNull();
		}
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 300, cancelable: true }),
		);
		scope.value = "other";
		await nextTick();
		window.dispatchEvent(new MouseEvent("pointerup"));
		expect(api.widths.value).toEqual({});
		wrapper.unmount();
	});

	it("supports keyboard/RTL resizing, utility columns and resetting one/all widths", async () => {
		const { wrapper, api } = harness();
		wrapper.element.style.direction = "rtl";
		await wrapper
			.find('[data-column-width-key="item_name"]')
			.trigger("keydown", { key: "ArrowLeft" });
		expect(api.widths.value.item_name).toBe(210);
		await wrapper
			.find('[data-column-width-key="data-table-expand"]')
			.trigger("keydown", { key: "ArrowRight" });
		expect(api.widths.value["data-table-expand"]).toBe(48);
		await wrapper
			.find('[data-column-width-key="item_name"]')
			.trigger("keydown", { key: "Home" });
		expect(api.widths.value.item_name).toBeUndefined();
		await wrapper.find('[data-column-width-key="qty"]').trigger("dblclick");
		expect(api.widths.value.qty).toBeUndefined();
		api.reset();
		expect(api.hasWidths.value).toBe(false);
		expect(clampColumnWidth("item_name", 1)).toBe(96);
		expect(clampColumnWidth("qty", 1)).toBe(64);
		expect(clampColumnWidth("row-reorder", 1)).toBe(56);
		expect(clampColumnWidth("rate", 9999)).toBe(1600);
		wrapper.unmount();
	});

	it("retains widths through visibility/order changes and isolates users/profiles", async () => {
		localStorage.setItem(
			widthsKey,
			JSON.stringify({ item_name: 260, qty: 130 }),
		);
		const { wrapper, api, available, scope } = harness();
		available.value = [available.value[1]!, available.value[0]!];
		await nextTick();
		expect(
			api.apply(available.value).map((column) => column.width),
		).toEqual([130, 260]);
		available.value = [available.value[0]!];
		await nextTick();
		expect(api.widths.value.item_name).toBe(260);
		scope.value = "posawesome:column-order:v1:other-user";
		await nextTick();
		expect(api.hasWidths.value).toBe(false);
		scope.value = scopeKey;
		await nextTick();
		expect(api.widths.value.item_name).toBe(260);
		wrapper.unmount();
	});

	it("validates cached widths and shows storage failures while retaining session changes", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(widthsKey, "{bad");
		const { wrapper, api, scope, start } = harness();
		expect(api.error.value).toContain("could not be loaded");
		localStorage.setItem(
			"other:widths",
			JSON.stringify({
				item_name: -4,
				qty: 9000,
				rate: "300",
				amount: null,
			}),
		);
		scope.value = "other";
		await nextTick();
		expect(api.widths.value).toEqual({ qty: 1600 });
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied");
		});
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 300, cancelable: true }),
		);
		window.dispatchEvent(new MouseEvent("pointerup"));
		expect(api.widths.value.item_name).toBe(300);
		expect(api.error.value).toContain("session only");
		wrapper.unmount();
	});
});
