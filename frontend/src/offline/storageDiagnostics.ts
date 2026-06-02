import { bucketCount, startPerfMeasure } from "../posapp/utils/perf";
import {
	getCustomerStorageCount,
	getStoredItemsCountByScope,
} from "./cache";
import { getOperationalCustomerCountByScope } from "./customerEngine";
import { memory } from "./db";
import { getOperationalItemsCountByScope } from "./inventoryEngine";
import { getLocalSnapshotManifest } from "./localSnapshotManifest";

type PosProfileLike = Record<string, any> | null | undefined;

export type OfflineStorageDiagnostics = {
	itemScope: string;
	customerScope: string;
	rawItemsCount: number;
	operationalItemsCount: number;
	rawCustomersCount: number;
	operationalCustomersCount: number;
	itemStorageReady: boolean;
	customerStorageReady: boolean;
	manifestItemMismatch: boolean;
	manifestCustomerMismatch: boolean;
	lastSync: {
		items: string | null;
		customers: string | null;
	};
};

function buildItemScope(profile: PosProfileLike) {
	if (!profile?.name) {
		return "";
	}
	return `${profile.name}_${profile.warehouse || "no_warehouse"}`;
}

function buildCustomerScope(profile: PosProfileLike) {
	return profile?.name || "";
}

function manifestResourceReady(manifest: any, key: string) {
	const resource = manifest?.resources?.[key];
	return Boolean(
		resource &&
			(resource.state === "ready" ||
				resource.state === "fresh" ||
				resource.state === "stale"),
	);
}

export async function getOfflineStorageDiagnostics(
	profile: PosProfileLike = memory.pos_opening_storage?.pos_profile,
): Promise<OfflineStorageDiagnostics> {
	const metric = startPerfMeasure("pos.offline.snapshot_hydrate", {
		source: "storage_diagnostics",
	});
	const itemScope = buildItemScope(profile);
	const customerScope = buildCustomerScope(profile);
	try {
		const [
			rawItemsCount,
			operationalItemsCount,
			rawCustomersCount,
			operationalCustomersCount,
		] = await Promise.all([
			getStoredItemsCountByScope(itemScope),
			getOperationalItemsCountByScope(itemScope),
			getCustomerStorageCount(),
			getOperationalCustomerCountByScope(customerScope),
		]);
		const manifest = getLocalSnapshotManifest();
		const manifestItemMismatch =
			manifestResourceReady(manifest, "items") &&
			(rawItemsCount === 0 || operationalItemsCount === 0);
		const manifestCustomerMismatch =
			manifestResourceReady(manifest, "customers") &&
			(rawCustomersCount === 0 || operationalCustomersCount === 0);

		if (manifestItemMismatch || manifestCustomerMismatch) {
			startPerfMeasure("pos.offline.manifest_table_mismatch", {
				resource: manifestItemMismatch ? "items" : "customers",
				raw_items: bucketCount(rawItemsCount),
				operational_items: bucketCount(operationalItemsCount),
				raw_customers: bucketCount(rawCustomersCount),
				operational_customers: bucketCount(operationalCustomersCount),
			}).finish("failure");
		}

		metric.finish("success", {
			item_result_count: bucketCount(operationalItemsCount),
			customer_result_count: bucketCount(operationalCustomersCount),
		});
		return {
			itemScope,
			customerScope,
			rawItemsCount,
			operationalItemsCount,
			rawCustomersCount,
			operationalCustomersCount,
			itemStorageReady: rawItemsCount > 0 && operationalItemsCount > 0,
			customerStorageReady:
				rawCustomersCount > 0 && operationalCustomersCount > 0,
			manifestItemMismatch,
			manifestCustomerMismatch,
			lastSync: {
				items: memory.items_last_sync || null,
				customers: memory.customers_last_sync || null,
			},
		};
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}
