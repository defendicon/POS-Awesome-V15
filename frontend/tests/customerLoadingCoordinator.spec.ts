import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	ensureCustomersReady,
	resetCustomerLoadingCoordinator,
} from "../src/posapp/modules/customers/customerLoadingCoordinator";

describe("customer loading coordinator", () => {
	beforeEach(() => {
		resetCustomerLoadingCoordinator();
	});

	it("deduplicates concurrent loads for the same profile revision", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const setProfile = vi.fn();
		let resolveLoad: (() => void) | null = null;
		const load = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveLoad = resolve;
				}),
		);

		const first = ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});
		const second = ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});

		expect(load).toHaveBeenCalledTimes(1);
		resolveLoad?.();
		await Promise.all([first, second]);
	});

	it("skips repeated loads after the same profile revision completed", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const setProfile = vi.fn();
		const load = vi.fn(async () => {});

		await ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});
		await ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});

		expect(load).toHaveBeenCalledTimes(1);
	});

	it("allows forced reloads for the same profile revision", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const setProfile = vi.fn();
		const load = vi.fn(async () => {});

		await ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});
		await ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			force: true,
			setProfile,
			load,
		});

		expect(load).toHaveBeenCalledTimes(2);
	});

	it("resets the profile when no profile key is available", async () => {
		const setProfile = vi.fn();
		const load = vi.fn(async () => {});

		const loaded = await ensureCustomersReady({
			profile: null,
			online: true,
			manualOffline: false,
			setProfile,
			load,
		});

		expect(loaded).toBe(false);
		expect(setProfile).toHaveBeenCalledWith(null);
		expect(load).not.toHaveBeenCalled();
	});

	it("deduplicates concurrent forced loads for the same profile revision", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const setProfile = vi.fn();
		let resolveLoad: (() => void) | null = null;
		const load = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveLoad = resolve;
				}),
		);

		const first = ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			force: true,
			setProfile,
			load,
		});
		const second = ensureCustomersReady({
			profile,
			online: true,
			manualOffline: false,
			force: true,
			setProfile,
			load,
		});

		expect(load).toHaveBeenCalledTimes(1);
		resolveLoad?.();
		await Promise.all([first, second]);
	});

	it("clears failed inflight loads so the same profile can retry", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const setProfile = vi.fn();
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error("load failed"))
			.mockResolvedValueOnce(undefined);

		await expect(
			ensureCustomersReady({
				profile,
				online: true,
				manualOffline: false,
				setProfile,
				load,
			}),
		).rejects.toThrow("load failed");

		await expect(
			ensureCustomersReady({
				profile,
				online: true,
				manualOffline: false,
				setProfile,
				load,
			}),
		).resolves.toBe(true);

		expect(load).toHaveBeenCalledTimes(2);
	});
});
