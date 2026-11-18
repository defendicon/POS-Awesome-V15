// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import {
	registerCustomization,
	workspaceCustomization as workspace,
} from "../src/posapp/composables/core/workspaceCustomization";

const wrappers: any[] = [];
beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	workspace.cancel();
});
afterEach(() => {
	workspace.cancel();
	wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
function preferences() {
	const cards = ref(["customer", "posting", "items"]);
	const widths = ref({ name: 180, qty: 100 });
	const cardScope = ref("cards:cashier:profile"),
		widthScope = ref("widths:cashier:profile");
	let cardPreference!: ReturnType<typeof registerCustomization>;
	const wrapper = mount(
		defineComponent({
			setup() {
				cardPreference = registerCustomization({
					section: "cards",
					kind: "cards",
					label: "Cards",
					state: cards,
					scope: cardScope,
					reset: () =>
						(cards.value = ["customer", "posting", "items"]),
				});
				registerCustomization({
					section: "invoice",
					kind: "widths",
					label: "Invoice table",
					state: widths,
					scope: widthScope,
					reset: () => (widths.value = { name: 180, qty: 100 }),
				});
				return () => h("div");
			},
		}),
	);
	wrappers.push(wrapper);
	return { cards, widths, cardScope, widthScope, cardPreference };
}

describe("workspace customization preview", () => {
	it("stages all sections and cancels without touching saved preferences", () => {
		const { cards, widths, cardPreference } = preferences();
		localStorage.setItem(
			"cards:cashier:profile",
			JSON.stringify(cards.value),
		);
		workspace.open("cards");
		expect(cardPreference.defer()).toBe(true);
		cards.value = ["items", "customer", "posting"];
		workspace.select("invoice");
		widths.value = { name: 300, qty: 140 };
		expect(workspace.changed.value).toHaveLength(2);
		expect(localStorage.getItem("widths:cashier:profile")).toBeNull();
		workspace.cancel();
		expect(cards.value).toEqual(["customer", "posting", "items"]);
		expect(widths.value).toEqual({ name: 180, qty: 100 });
		expect(workspace.active.value).toBe(false);
		expect(
			JSON.parse(localStorage.getItem("cards:cashier:profile")!),
		).toEqual(cards.value);
	});

	it("applies only changed preferences across sections and clears the draft", () => {
		const { cards, widths } = preferences();
		workspace.open("invoice");
		widths.value = { name: 250, qty: 110 };
		expect(workspace.apply()).toBe(true);
		expect(
			JSON.parse(localStorage.getItem("widths:cashier:profile")!),
		).toEqual(widths.value);
		expect(localStorage.getItem("cards:cashier:profile")).toBeNull();
		expect(cards.value).toEqual(["customer", "posting", "items"]);
		expect(workspace.changed.value).toHaveLength(0);
	});

	it("rolls back earlier writes after a later storage failure and keeps the preview retryable", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { cards, widths } = preferences();
		const original = JSON.stringify(cards.value);
		localStorage.setItem("cards:cashier:profile", original);
		workspace.open();
		cards.value = ["items", "customer", "posting"];
		widths.value = { name: 260, qty: 120 };
		const nativeSet = Storage.prototype.setItem;
		let writes = 0;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(
			function (key, value) {
				if (++writes === 2) throw new Error("Quota exceeded");
				nativeSet.call(this, key, value);
			},
		);
		expect(workspace.apply()).toBe(false);
		expect(workspace.active.value).toBe(true);
		expect(workspace.saveError.value).toContain("could not be saved");
		expect(localStorage.getItem("cards:cashier:profile")).toBe(original);
		expect(localStorage.getItem("widths:cashier:profile")).toBeNull();
		expect(workspace.apply()).toBe(true);
		expect(
			JSON.parse(localStorage.getItem("widths:cashier:profile")!),
		).toEqual(widths.value);
	});

	it("resets the chosen section only and cancels a preview on profile/cashier changes", async () => {
		const { cards, widths, widthScope } = preferences();
		workspace.open();
		cards.value = ["items", "customer", "posting"];
		widths.value = { name: 300, qty: 120 };
		workspace.resetSection();
		expect(cards.value[0]).toBe("customer");
		expect(widths.value.name).toBe(300);
		cards.value = ["posting", "customer", "items"];
		widthScope.value = "widths:other-user:profile";
		await nextTick();
		expect(workspace.active.value).toBe(false);
		expect(cards.value[0]).toBe("customer");
		expect(localStorage.length).toBe(0);
	});

	it("does not claim to save a preference before its profile scope is ready", () => {
		const { widths, widthScope } = preferences();
		widthScope.value = "";
		workspace.open("invoice");
		widths.value = { name: 240, qty: 100 };
		expect(workspace.apply()).toBe(false);
		expect(workspace.saveError.value).toContain("POS Profile");
		expect(workspace.active.value).toBe(true);
	});
});
