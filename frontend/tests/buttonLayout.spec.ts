// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import ButtonLayout from "../src/posapp/components/ui/CustomizableButtonLayout.vue";
import WorkspaceCustomizer from "../src/posapp/components/ui/WorkspaceCustomizer.vue";
import { workspaceCustomization as workspace } from "../src/posapp/composables/core/workspaceCustomization";
import { normalizeButtonLayout } from "../src/posapp/utils/buttonLayout";

const defaults = [
	{ key: "save", label: "Save" },
	{ key: "return", label: "Return" },
	{ key: "pay", label: "Pay", full: true },
];
let wrapper: VueWrapper;
const part = () =>
	workspace.participants.value.find((entry) => entry.kind === "buttons")!;
const order = () =>
	wrapper
		.findAll("[data-workspace-button]")
		.map((entry) => entry.attributes("data-workspace-button"));
function create() {
	wrapper = mount(ButtonLayout, {
		props: {
			user: "cashier",
			profile: "POS",
			defaults,
			enabled: ["save", "pay"],
		},
		slots: {
			save: "<button data-sale-action>Save</button>",
			pay: "<button>Pay</button>",
			return: "<button>Return</button>",
		},
		global: { stubs: { VIcon: true } },
	});
}
beforeEach(() => {
	localStorage.clear();
});
afterEach(() => {
	workspace.cancel();
	wrapper?.unmount();
	vi.restoreAllMocks();
});

describe("workspace button layout", () => {
	it("exposes button presets and individual widths through the workspace editor", async () => {
		create();
		const editor = mount(WorkspaceCustomizer, {
			props: { inline: true },
			global: { stubs: { VIcon: true } },
		});
		try {
			workspace.open("buttons");
			await nextTick();
			expect(editor.text()).toContain("Single column");
			await editor
				.get('select[aria-label="Button layout: Pay"]')
				.setValue("double");
			expect(
				wrapper
					.get('[data-workspace-button="pay"]')
					.attributes("style"),
			).toContain("span 1");
			await editor
				.get('button[aria-label="Move up: Pay"]')
				.trigger("click");
			expect(order()).toEqual(["pay", "save"]);
			const preset = editor
				.findAll(".workspace-editor__presets button")
				.find((button) => button.text() === "Single column")!;
			await preset.trigger("click");
			expect(
				part()
					.entries?.()
					.every((entry) => entry.width === "single"),
			).toBe(true);
		} finally {
			editor.unmount();
		}
	});
	it("repairs old/corrupt preferences and keeps disabled buttons", () => {
		expect(
			normalizeButtonLayout(
				[
					null,
					{ key: "pay", width: "bad" },
					{ key: "pay" },
					{ key: "unknown" },
				],
				defaults,
			),
		).toEqual([
			{ key: "pay", width: "auto" },
			{ key: "save", width: "auto" },
			{ key: "return", width: "auto" },
		]);
	});
	it("previews order and widths, cancels, then persists and reloads applied changes", async () => {
		create();
		workspace.open("buttons");
		part().move?.("pay", -1);
		part().setWidth?.("pay", "double");
		await nextTick();
		expect(order()).toEqual(["pay", "save"]);
		expect(localStorage.length).toBe(0);
		workspace.cancel();
		await nextTick();
		expect(order()).toEqual(["save", "pay"]);
		workspace.open("buttons");
		part().move?.("pay", -1);
		part().setWidth?.("pay", "double");
		expect(workspace.apply()).toBe(true);
		wrapper.unmount();
		create();
		expect(order()).toEqual(["pay", "save"]);
		expect(
			wrapper.get('[data-workspace-button="pay"]').attributes("style"),
		).toContain("span 1");
		await wrapper.setProps({ enabled: ["save", "return", "pay"] });
		expect(order()).toEqual(["pay", "save", "return"]);
	});
	it("isolates profile and cashier changes and resets only the preview", async () => {
		create();
		workspace.open("buttons");
		part().preset?.("stack");
		await nextTick();
		expect(
			wrapper.get('[data-workspace-button="save"]').attributes("style"),
		).toContain("1 / -1");
		workspace.resetSection();
		expect(
			part()
				.entries?.()
				.every((entry) => entry.width === "auto"),
		).toBe(true);
		part().move?.("pay", -1);
		await wrapper.setProps({ user: "other", profile: "Other POS" });
		expect(workspace.active.value).toBe(false);
		expect(order()).toEqual(["save", "pay"]);
		expect(localStorage.length).toBe(0);
	});
	it("supports pointer drag and keyboard moves without activating sale actions in preview", async () => {
		create();
		workspace.open("buttons");
		await nextTick();
		const target = wrapper.get('[data-workspace-button="pay"]').element;
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn(() => target),
		});
		vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 100,
			height: 40,
			bottom: 40,
			right: 100,
		} as DOMRect);
		const down = new MouseEvent("pointerdown", {
			button: 0,
			clientX: 0,
			clientY: 0,
			bubbles: true,
			cancelable: true,
		});
		Object.defineProperty(down, "pointerId", { value: 1 });
		wrapper
			.get('[data-workspace-button="save"] .workspace-buttons__grip')
			.element.dispatchEvent(down);
		const pointer = new Event("pointerup", { cancelable: true });
		Object.assign(pointer, { pointerId: 1, clientX: 90, clientY: 30 });
		window.dispatchEvent(pointer);
		await nextTick();
		expect(order()).toEqual(["pay", "save"]);
		await wrapper
			.get('[data-workspace-button="save"] .workspace-buttons__grip')
			.trigger("keydown", { key: "ArrowUp" });
		expect(order()).toEqual(["save", "pay"]);
		const sale = vi.fn();
		wrapper
			.get("[data-sale-action]")
			.element.addEventListener("click", sale);
		await wrapper.get("[data-sale-action]").trigger("click");
		expect(sale).not.toHaveBeenCalled();
		workspace.cancel();
		await wrapper.get("[data-sale-action]").trigger("click");
		expect(sale).toHaveBeenCalledOnce();
	});
});
