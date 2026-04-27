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
});
