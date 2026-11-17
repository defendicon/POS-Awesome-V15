// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import {
	columnOrderStorageKey,
	useColumnOrder,
} from "../src/posapp/composables/core/useColumnOrder";

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	(window as any).__ = (text: string) => text;
});

function harness() {
	const available = ref(
		["name", "qty", "rate", "amount"].map((key) => ({
			key,
			title: key,
			sortable: true,
			headerProps: { "aria-label": key },
		})),
	);
	const scope = ref("columns:user:profile");
	const root = ref<HTMLElement | null>(null);
	let api!: ReturnType<typeof useColumnOrder>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useColumnOrder(root, available, scope);
				return () =>
					h(
						"table",
						{
							ref: root,
							onPointerdownCapture: api.onPointerDown,
							onKeydownCapture: api.onKeydown,
						},
						[
							h(
								"thead",
								h(
									"tr",
									api.headers.value.map((header) =>
										h("th", header.headerProps, [
											h(
												"button",
												{
													"data-column-reorder-key":
														header.key,
												},
												header.title,
											),
										]),
									),
								),
							),
							h(
								"tbody",
								h(
									"tr",
									api.ordered.value.map((header) =>
										h(
											"td",
											{ "data-cell-key": header.key },
											`value-${header.key}`,
										),
									),
								),
							),
						],
					);
			},
		}),
	);
	return { wrapper, api, available, scope };
}

describe("column presentation order", () => {
	it("moves headers and their values together, preserving metadata and saving only keys", async () => {
		const { wrapper, api } = harness();
		const target = wrapper.find('[data-column-reorder-id="name"]').element;
		vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
			left: 0,
			width: 100,
			top: 0,
			height: 40,
		} as DOMRect);
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn(() => target),
		});
		wrapper
			.find('[data-column-reorder-key="amount"]')
			.element.dispatchEvent(
				new MouseEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 350,
					clientY: 20,
				}),
			);
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 10,
				clientY: 20,
				cancelable: true,
			}),
		);
		expect(target.classList.contains("pos-column-reorder-before")).toBe(
			true,
		);
		window.dispatchEvent(new MouseEvent("pointerup"));
		await nextTick();
		expect(api.ordered.value.map((header) => header.key)).toEqual([
			"amount",
			"name",
			"qty",
			"rate",
		]);
		expect(wrapper.findAll("td").map((cell) => cell.text())).toEqual([
			"value-amount",
			"value-name",
			"value-qty",
			"value-rate",
		]);
		expect(api.headers.value[0]).toMatchObject({
			sortable: true,
			headerProps: {
				"aria-label": "amount",
				"data-column-reorder-id": "amount",
			},
		});
		expect(
			JSON.parse(localStorage.getItem("columns:user:profile")!),
		).toEqual(["amount", "name", "qty", "rate"]);
		wrapper.unmount();
		const restored = harness();
		expect(restored.api.ordered.value[0]?.key).toBe("amount");
		restored.wrapper.unmount();
	});

	it("retains hidden column positions and appends newly available profile columns", async () => {
		localStorage.setItem(
			"columns:user:profile",
			JSON.stringify(["amount", "name", "qty", "rate"]),
		);
		const { wrapper, api, available } = harness();
		const original = available.value;
		available.value = original.filter((header) => header.key !== "qty");
		await nextTick();
		await wrapper
			.find('[data-column-reorder-key="name"]')
			.trigger("keydown", { altKey: true, key: "ArrowRight" });
		expect(api.ordered.value.map((header) => header.key)).toEqual([
			"amount",
			"rate",
			"name",
		]);
		available.value = original;
		await nextTick();
		expect(api.ordered.value.map((header) => header.key)).toEqual([
			"amount",
			"rate",
			"qty",
			"name",
		]);
		available.value = [
			...original,
			{
				key: "new",
				title: "new",
				sortable: false,
				headerProps: { "aria-label": "new" },
			},
		];
		await nextTick();
		expect(api.ordered.value.at(-1)?.key).toBe("new");
		wrapper.unmount();
	});

	it("isolates profile/user/table settings, resets and supports RTL keyboard movement", async () => {
		const profile = {
			name: "POS",
			company: "Company",
			warehouse: "Warehouse",
		};
		expect(columnOrderStorageKey(profile, "user-a", "invoice")).not.toBe(
			columnOrderStorageKey(profile, "user-b", "invoice"),
		);
		expect(columnOrderStorageKey(profile, "user-a", "invoice")).not.toBe(
			columnOrderStorageKey(profile, "user-a", "selector"),
		);
		expect(columnOrderStorageKey({}, "user", "invoice")).toBe("");
		const { wrapper, api, scope } = harness();
		wrapper.element.style.direction = "rtl";
		await wrapper
			.find('[data-column-reorder-key="name"]')
			.trigger("keydown", { altKey: true, key: "ArrowLeft" });
		expect(api.ordered.value.map((header) => header.key)).toEqual([
			"qty",
			"name",
			"rate",
			"amount",
		]);
		scope.value = "other";
		await nextTick();
		expect(api.hasOrder.value).toBe(false);
		scope.value = "columns:user:profile";
		await nextTick();
		expect(api.ordered.value[0]?.key).toBe("qty");
		api.reset();
		await nextTick();
		expect(api.ordered.value[0]?.key).toBe("name");
		expect(api.hasOrder.value).toBe(false);
		wrapper.unmount();
	});

	it("recovers corrupt preferences, ignores obsolete keys and keeps a session fallback on write failure", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem("columns:user:profile", "{bad");
		const { wrapper, api, scope } = harness();
		expect(api.error.value).toContain("could not be loaded");
		localStorage.setItem(
			"other",
			JSON.stringify([null, "removed", "rate", "rate", 12]),
		);
		scope.value = "other";
		await nextTick();
		expect(api.ordered.value.map((header) => header.key)).toEqual([
			"rate",
			"name",
			"qty",
			"amount",
		]);
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied");
		});
		await wrapper
			.find('[data-column-reorder-key="rate"]')
			.trigger("keydown", { altKey: true, key: "ArrowRight" });
		expect(api.ordered.value[0]?.key).toBe("name");
		expect(api.error.value).toContain("session only");
		wrapper.unmount();
	});
});
