import { ref } from "vue";
import { useUIStore } from "../../../stores/uiStore.js";
import { getCachedOffers, saveOffers } from "../../../../offline/index";
import { bucketCount, startPerfMeasure } from "../../../utils/perf";

declare const frappe: any;

export function useOffers() {
	const uiStore = useUIStore();
	const offers = ref<any[]>([]);
	const normalizeOfferRowId = (value: any) => String(value ?? "").trim();
	const normalizeOffers = (list: any[]) =>
		(Array.isArray(list) ? list : []).map((entry: any) => {
			const offer = { ...(entry || {}) };
			const rowId = normalizeOfferRowId(offer.row_id || offer.name);
			if (rowId) {
				offer.row_id = rowId;
			}
			return offer;
		});

	function get_offers(profileName: string, posProfile: any) {
		const metric = startPerfMeasure("pos.pricing.rules_load", {
			source: "server",
		});
		if (posProfile && posProfile.posa_local_storage) {
			const cached = normalizeOffers(getCachedOffers());
			if (cached.length) {
				offers.value = cached;
				uiStore.setOffers(cached);
				startPerfMeasure("pos.pricing.rules_load", {
					source: "local",
				}).finish("success", {
					cache_hit: true,
					result_count_bucket: bucketCount(cached.length),
				});
			}
		}
		return frappe
			.call("posawesome.posawesome.api.offers.get_offers", {
				profile: profileName,
			})
			.then((r: any) => {
				if (r.message) {
					const normalized = normalizeOffers(r.message);
					saveOffers(normalized);
					offers.value = normalized;
					uiStore.setOffers(normalized);
					metric.finish("success", {
						cache_hit: false,
						result_count_bucket: bucketCount(normalized.length),
					});
				}
			})
			.catch((err: unknown) => {
				console.error("Failed to fetch offers:", err);
				const cached = normalizeOffers(getCachedOffers());
				if (cached.length) {
					offers.value = cached;
					uiStore.setOffers(cached);
					metric.finish("success", {
						cache_hit: true,
						result_count_bucket: bucketCount(cached.length),
					});
					return;
				}
				metric.fail(err);
			});
	}

	return { offers, get_offers };
}
