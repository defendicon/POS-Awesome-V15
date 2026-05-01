// @vitest-environment jsdom
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUpdateChecks } from "../src/posapp/composables/runtime/useUpdateChecks";
import { useNetworkLifecycle } from "../src/posapp/composables/runtime/useNetworkLifecycle";
import { useCustomerReadiness } from "../src/posapp/composables/runtime/useCustomerReadiness";
import { useQueueMetrics } from "../src/posapp/composables/runtime/useQueueMetrics";
import { useBootSync } from "../src/posapp/composables/runtime/useBootSync";

describe("runtime composable lifecycle ownership", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("starts and stops update polling exactly once", () => {
		const setIntervalSpy = vi.spyOn(window, "setInterval");
		const clearIntervalSpy = vi.spyOn(window, "clearInterval");
		const store = {
			initializeFromStorage: vi.fn(),
			setCurrentVersion: vi.fn(),
			checkForUpdates: vi.fn(),
		};
		const runtime = useUpdateChecks({
			updateStore: store,
			buildVersion: "build-1",
			intervalMs: 1000,
		});

		runtime.start();
		runtime.start();
		runtime.stop();
		runtime.stop();

		expect(store.initializeFromStorage).toHaveBeenCalledTimes(1);
		expect(store.setCurrentVersion).toHaveBeenCalledWith("build-1");
		expect(store.checkForUpdates).toHaveBeenCalledTimes(1);
		expect(setIntervalSpy).toHaveBeenCalledTimes(1);
		expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
	});

	it("attaches network listeners once, removes them once, and resumes once per recovery edge", () => {
		const addSpy = vi.spyOn(window, "addEventListener");
		const removeSpy = vi.spyOn(window, "removeEventListener");
		const networkOnline = ref(true);
		const serverOnline = ref(false);
		const serverConnecting = ref(false);
		const internetReachable = ref(false);
		const runtime = useNetworkLifecycle({
			networkOnline,
			serverOnline,
			serverConnecting,
			internetReachable,
			isManualOffline: () => false,
			checkNetworkConnectivity: vi.fn(async () => undefined),
			onConnectivityRecovered: vi.fn(async () => undefined),
		});

		runtime.start();
		runtime.start();
		window.dispatchEvent(new Event("offline"));
		window.dispatchEvent(new Event("online"));
		runtime.stop();
		runtime.stop();

		expect(
			addSpy.mock.calls.filter(([name]) => name === "online"),
		).toHaveLength(1);
		expect(
			addSpy.mock.calls.filter(([name]) => name === "offline"),
		).toHaveLength(1);
		expect(
			removeSpy.mock.calls.filter(([name]) => name === "online"),
		).toHaveLength(1);
		expect(
			removeSpy.mock.calls.filter(([name]) => name === "offline"),
		).toHaveLength(1);
		expect(runtime.options.onConnectivityRecovered).toHaveBeenCalledTimes(
			1,
		);
	});

	it("stops customer readiness watcher on unmount", async () => {
		const profile = ref<any>({ name: "P1", modified: "1" });
		const ensureCustomersReady = vi.fn(async () => true);
		const runtime = useCustomerReadiness({
			profile,
			isOnline: () => true,
			isManualOffline: () => false,
			ensureCustomersReady,
			setProfile: vi.fn(),
			load: vi.fn(async () => undefined),
		});

		runtime.start();
		await Promise.resolve();
		runtime.stop();
		profile.value = { name: "P2", modified: "2" };
		await Promise.resolve();

		expect(ensureCustomersReady).toHaveBeenCalledTimes(1);
	});

	it("owns queue metrics cache refresh state without leaking timers", async () => {
		const metrics = useQueueMetrics({
			getCacheUsageEstimate: vi.fn(async () => ({
				percentage: 25,
				total: 100,
				indexedDB: 80,
				localStorage: 20,
			})),
		});

		await metrics.refreshCacheUsage();

		expect(metrics.cacheUsage.value).toBe(25);
		expect(metrics.cacheUsageDetails.value).toEqual({
			total: 100,
			indexedDB: 80,
			localStorage: 20,
		});
	});

	it("starts and stops boot sync timer ownership once", () => {
		const runtime = {
			startTimerSync: vi.fn(),
			stopTimerSync: vi.fn(),
			scheduleBootWarmSync: vi.fn(async () => true),
			triggerOnlineResumeSync: vi.fn(async () => true),
			triggerOperatorRefreshSync: vi.fn(async () => true),
		};
		const boot = useBootSync({
			offlineSyncRuntime: runtime,
			evaluateBootstrapSnapshot: vi.fn(),
		});

		boot.start();
		boot.start();
		boot.stop();
		boot.stop();

		expect(runtime.startTimerSync).toHaveBeenCalledTimes(1);
		expect(runtime.stopTimerSync).toHaveBeenCalledTimes(1);
	});
});
