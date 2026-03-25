// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { useItemsSelectorFocus } from "../src/posapp/composables/pos/items/useItemsSelectorFocus";

const createVm = (overrides: Record<string, unknown> = {}) => {
	const focus = vi.fn();
	return {
		cameraScannerActive: false,
		showManualScanInput: false,
		queueManualScanFocus: vi.fn(),
		$nextTick: (cb: () => void) => cb(),
		$refs: {
			itemHeader: {
				debounce_search: {
					value: {
						focus,
					},
				},
			},
		},
		_focusSpy: focus,
		...overrides,
	};
};

describe("useItemsSelectorFocus", () => {
	it("focuses the search input when requested", () => {
		const vm = createVm();
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		expect(vm._focusSpy).toHaveBeenCalledTimes(1);
	});

	it("focuses the nested DOM input when the exposed field instance has its own value property", () => {
		const nestedInput = document.createElement("input");
		const nestedFocusSpy = vi.spyOn(nestedInput, "focus");
		const vm = createVm({
			$refs: {
				itemHeader: {
					debounce_search: {
						value: "",
						$el: {
							querySelector: vi.fn(() => nestedInput),
						},
					},
				},
			},
		});
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		expect(nestedFocusSpy).toHaveBeenCalledTimes(1);
	});

	it("skips focusing while camera scanning is active", () => {
		const vm = createVm({ cameraScannerActive: true });
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		expect(vm._focusSpy).not.toHaveBeenCalled();
	});

	it("routes focus to manual scan input when visible", () => {
		const vm = createVm({ showManualScanInput: true });
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		expect(vm.queueManualScanFocus).toHaveBeenCalledTimes(1);
		expect(vm._focusSpy).not.toHaveBeenCalled();
	});

	it("starts the camera scanner through the component ref", () => {
		const startScanning = vi.fn();
		const vm = createVm({
			$refs: {
				itemHeader: {
					debounce_search: {
						value: {
							focus: vi.fn(),
						},
					},
				},
				cameraScanner: {
					startScanning,
				},
			},
		});
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: { playScanTone: vi.fn() },
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.startCameraScanning();

		expect(startScanning).toHaveBeenCalledTimes(1);
	});

	it("does not blur a visible active control during focus retries", () => {
		const originalRaf = window.requestAnimationFrame;
		window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			cb(0);
			return 1;
		}) as typeof window.requestAnimationFrame;

		const trappedButton = document.createElement("button");
		const searchInput = document.createElement("input");
		document.body.appendChild(trappedButton);
		document.body.appendChild(searchInput);

		const nativeSearchFocus = searchInput.focus.bind(searchInput);
		let trapReleased = false;

		trappedButton.focus();
		const trappedBlurSpy = vi.spyOn(trappedButton, "blur").mockImplementation(() => {
			trapReleased = true;
			HTMLElement.prototype.blur.call(trappedButton);
		});
		vi.spyOn(searchInput, "focus").mockImplementation(() => {
			if (trapReleased) {
				nativeSearchFocus();
			}
		});

		const vm = createVm({
			$refs: {
				itemHeader: {
					debounce_search: {
						value: searchInput,
					},
				},
			},
		});
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		expect(trappedBlurSpy).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(trappedButton);

		trappedBlurSpy.mockRestore();
		searchInput.remove();
		trappedButton.remove();
		window.requestAnimationFrame = originalRaf;
	});

	it("keeps retrying until the selector search input becomes visible", () => {
		const originalRaf = window.requestAnimationFrame;
		const animationFrames: FrameRequestCallback[] = [];
		window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			animationFrames.push(cb);
			return animationFrames.length;
		}) as typeof window.requestAnimationFrame;

		const container = document.createElement("div");
		container.style.display = "none";
		const searchInput = document.createElement("input");
		container.appendChild(searchInput);
		document.body.appendChild(container);

		const nativeFocus = searchInput.focus.bind(searchInput);
		vi.spyOn(searchInput, "focus").mockImplementation(() => {
			if (container.style.display !== "none") {
				nativeFocus();
			}
		});

		const vm = createVm({
			$refs: {
				itemHeader: {
					debounce_search: {
						value: searchInput,
					},
				},
			},
		});
		const focusApi = useItemsSelectorFocus({
			getVM: () => vm,
			scannerInput: {},
			itemSelection: { handleSearchKeydown: vi.fn(() => false) },
		});

		focusApi.focusItemSearch();

		let frame = 0;
		while (animationFrames.length) {
			frame += 1;
			if (frame === 4) {
				container.style.display = "block";
			}
			const callback = animationFrames.shift();
			callback?.(frame);
		}

		expect(document.activeElement).toBe(searchInput);

		searchInput.remove();
		container.remove();
		window.requestAnimationFrame = originalRaf;
	});
});
