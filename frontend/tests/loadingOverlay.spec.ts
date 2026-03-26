// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoadingOverlay from "../src/posapp/components/ui/LoadingOverlay.vue";
import { loadingState, resetLoadingState } from "../src/posapp/utils/loading";

vi.mock("../src/posapp/composables/core/useLoading", () => ({
	useLoading: () => ({
		overlayVisible: { value: false },
	}),
}));

describe("LoadingOverlay", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).matchMedia = () => ({
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {},
		});
		resetLoadingState();
	});

	it("renders progress bar, percentage, and loading status for boot progress", () => {
		loadingState.active = true;
		loadingState.progress = 64;
		loadingState.message = "Loading product catalog";
		loadingState.detail = "Syncing latest items from cache";

		const wrapper = mount(LoadingOverlay, {
			props: {
				visible: true,
			},
		});

		expect(wrapper.text()).toContain("64%");
		expect(wrapper.text()).toContain("Loading product catalog");
		expect(wrapper.text()).toContain("Syncing latest items from cache");
		expect(wrapper.find(".loading-overlay__progress").exists()).toBe(true);
	});
});
