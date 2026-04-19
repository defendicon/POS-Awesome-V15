// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncResourceState } from "../src/offline/sync/types";

const syncStateTable = {
	get: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	toArray: vi.fn(),
};

vi.mock("../src/offline/db", () => ({
	db: {
		table: vi.fn(() => syncStateTable),
	},
}));

describe("sync state helpers", () => {
	beforeEach(() => {
		window.localStorage.clear();
		syncStateTable.get.mockReset();
		syncStateTable.put.mockReset();
		syncStateTable.delete.mockReset();
		syncStateTable.toArray.mockReset();
	});

	it("persists sync state only to sync_state storage", async () => {
		const { buildSyncStateStorageKey, setSyncResourceState } = await import(
			"../src/offline/sync/syncState"
		);

		const state: SyncResourceState = {
			resourceId: "items",
			status: "fresh",
			lastSyncedAt: "2026-04-09T12:00:00.000Z",
			watermark: "2026-04-09T12:00:00.000Z::ITEM-1",
			lastSuccessHash: "hash-1",
			lastError: null,
			consecutiveFailures: 0,
			scopeSignature: "profile::pos-1",
			schemaVersion: "v1",
		};

		await setSyncResourceState(state);

		expect(syncStateTable.put).toHaveBeenCalledWith({
			key: buildSyncStateStorageKey("items"),
			value: state,
		});
		expect(window.localStorage.getItem(buildSyncStateStorageKey("items"))).toBeNull();
	});

	it("prefers persisted db state and falls back to localStorage", async () => {
		const { buildSyncStateStorageKey, getSyncResourceState } = await import(
			"../src/offline/sync/syncState"
		);
		const dbState: SyncResourceState = {
			resourceId: "customers",
			status: "stale",
			lastSyncedAt: "2026-04-09T12:00:00.000Z",
			watermark: "cursor-5",
			lastSuccessHash: "hash-2",
			lastError: "timeout",
			consecutiveFailures: 2,
			scopeSignature: "company::test-company",
			schemaVersion: "v1",
		};

		syncStateTable.get.mockResolvedValueOnce({
			key: buildSyncStateStorageKey("customers"),
			value: dbState,
		});

		expect(await getSyncResourceState("customers")).toEqual(dbState);

		syncStateTable.get.mockResolvedValueOnce(undefined);
		window.localStorage.setItem(
			buildSyncStateStorageKey("customers"),
			JSON.stringify(dbState),
		);

		expect(await getSyncResourceState("customers")).toEqual(dbState);
	});

	it("lists and clears resource sync state deterministically", async () => {
		const {
			buildSyncStateStorageKey,
			clearSyncResourceState,
			listSyncResourceStates,
		} = await import("../src/offline/sync/syncState");

		syncStateTable.toArray.mockResolvedValueOnce([
			{
				key: buildSyncStateStorageKey("stock"),
				value: {
					resourceId: "stock",
					status: "syncing",
				},
			},
			{
				key: buildSyncStateStorageKey("bootstrap_config"),
				value: {
					resourceId: "bootstrap_config",
					status: "fresh",
				},
			},
		]);

		expect(await listSyncResourceStates()).toEqual([
			{
				resourceId: "bootstrap_config",
				status: "fresh",
			},
			{
				resourceId: "stock",
				status: "syncing",
			},
		]);

		await clearSyncResourceState("stock");

		expect(syncStateTable.delete).toHaveBeenCalledWith(
			buildSyncStateStorageKey("stock"),
		);
		expect(window.localStorage.getItem(buildSyncStateStorageKey("stock"))).toBeNull();
	});
});
