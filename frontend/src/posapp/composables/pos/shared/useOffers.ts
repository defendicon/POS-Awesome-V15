import { ref } from "vue";
import { useUIStore } from "../../../stores/uiStore.js";
import { getCachedOffers, saveOffers } from "../../../../offline/index";

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
		if (posProfile && posProfile.posa_local_storage) {
			const cached = normalizeOffers(getCachedOffers());
			if (cached.length) {
				offers.value = cached;
				uiStore.setOffers(cached);
			}
		}
		return frappe
			.call("posawesome.posawesome.api.offers.get_offers", {
				profile: profileName,
			})
			.then((r: any) => {
				if (r.message) {
					console.info("LoadOffers");
					const normalized = normalizeOffers(r.message);
					saveOffers(normalized);
					offers.value = normalized;
					uiStore.setOffers(normalized);
				}
			})
			.catch((err: unknown) => {
				console.error("Failed to fetch offers:", err);
				const cached = normalizeOffers(getCachedOffers());
				if (cached.length) {
					offers.value = cached;
					uiStore.setOffers(cached);
				}
			});
	}

	return { offers, get_offers };
}
