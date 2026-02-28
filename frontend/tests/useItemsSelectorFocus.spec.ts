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
});
