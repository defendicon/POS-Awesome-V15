/* global frappe */

const cache = new Map();

export function useBundles() {
	const getComponents = async (bundleCode) => {
		const cached = cache.get(bundleCode);
		const now = Date.now();
		if (cached && now - cached.ts < 60000) {
			return cached.data;
		}
		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.bundles.get_bundle_components",
				args: { bundles: [bundleCode] },
			});
			const data = r.message && r.message[bundleCode] ? r.message[bundleCode] : [];
			cache.set(bundleCode, { data, ts: now });
			return data;
		} catch (e) {
			console.error("Failed to fetch bundle components", e);
			return [];
		}
	};

	return { getBundleComponents: getComponents };
}
