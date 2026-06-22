import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

import { useScannerInput } from "../src/posapp/composables/pos/items/useScannerInput";

describe("useScannerInput", () => {
	let now = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		(globalThis as any).__ = (value: string) => value;
		now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
		delete (globalThis as any).__;
	});

	it("auto-processes rapid numeric input without requiring Enter", async () => {
		let searchValue = "";
		const onScan = vi.fn().mockResolvedValue(undefined);
		const scanner = useScannerInput({
			onScan,
			getSearchInput: () => searchValue,
		});

		searchValue = "123456789012";
		scanner.handleSearchInput(searchValue);

		now += 150;
		await vi.advanceTimersByTimeAsync(150);
		now += 32;
		await vi.advanceTimersByTimeAsync(32);

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith("123456789012");
	});

	it("does not auto-process short numeric input", async () => {
		let searchValue = "";
		const onScan = vi.fn().mockResolvedValue(undefined);
		const scanner = useScannerInput({
			onScan,
			getSearchInput: () => searchValue,
		});

		searchValue = "12345";
		scanner.handleSearchInput(searchValue);
		now += 220;
		await vi.advanceTimersByTimeAsync(220);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("coalesces the same barcode while its scan pipeline is active", async () => {
		let finishScan: (() => void) | undefined;
		const onScan = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishScan = resolve;
				}),
		);
		const scanner = useScannerInput({ onScan });

		scanner.onBarcodeScanned("123456789012");
		scanner.onBarcodeScanned("123456789012");
		await vi.advanceTimersByTimeAsync(32);
		expect(onScan).toHaveBeenCalledTimes(1);

		scanner.onBarcodeScanned("123456789012");
		await vi.advanceTimersByTimeAsync(32);
		expect(onScan).toHaveBeenCalledTimes(1);

		finishScan?.();
		await vi.advanceTimersByTimeAsync(1);
		scanner.onBarcodeScanned("123456789012");
		await vi.advanceTimersByTimeAsync(32);
		expect(onScan).toHaveBeenCalledTimes(2);
	});
});
