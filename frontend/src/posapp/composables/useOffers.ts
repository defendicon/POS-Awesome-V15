import { ref } from "vue";
import { useUIStore } from "../stores/uiStore.js";
import { getCachedOffers, saveOffers } from "../../offline/index.js";

declare const frappe: any;

export function useOffers() {
	const uiStore = useUIStore();
	const offers = ref<any[]>([]);

	function get_offers(profileName: string, posProfile: any) {
		if (posProfile && posProfile.posa_local_storage) {
			const cached = getCachedOffers();
			if (cached.length) {
				offers.value = cached;
				uiStore.setOffers(cached);
			}
		}
		return frappe
			.call("posawesome.posawesome.api.offers.get_offers", { profile: profileName })
			.then((r: any) => {
				if (r.message) {
					console.info("LoadOffers");
					saveOffers(r.message);
					offers.value = r.message;
					uiStore.setOffers(r.message);
				}
			})
			.catch((err: unknown) => {
				console.error("Failed to fetch offers:", err);
				const cached = getCachedOffers();
				if (cached.length) {
					offers.value = cached;
					uiStore.setOffers(cached);
				}
			});
	}

	return { offers, get_offers };
}
