declare const frappe: any;

const cache = new Map<string, { data: any[]; ts: number }>();
let didWarnMissingBundleClient = false;

export function useBundles() {
	const getComponents = async (bundleCode: string) => {
		const cached = cache.get(bundleCode);
		const now = Date.now();
		if (cached && now - cached.ts < 60000) {
			return cached.data;
		}
		const bundleClient =
			typeof frappe !== "undefined" &&
			frappe &&
			typeof frappe.call === "function"
				? frappe
				: null;
		if (!bundleClient) {
			if (!didWarnMissingBundleClient) {
				console.warn("Bundle component lookup skipped because frappe.call is unavailable");
				didWarnMissingBundleClient = true;
			}
			return [];
		}
		try {
			const r = await bundleClient.call({
				method: "posawesome.posawesome.api.bundles.get_bundle_components",
				args: { bundles: [bundleCode] },
			});
			const data =
				r.message && r.message[bundleCode] ? r.message[bundleCode] : [];
			cache.set(bundleCode, { data, ts: now });
			return data;
		} catch (e) {
			console.error("Failed to fetch bundle components", e);
			return [];
		}
	};

	return { getBundleComponents: getComponents };
}
