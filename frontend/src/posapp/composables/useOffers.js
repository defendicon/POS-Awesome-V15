import { ref, getCurrentInstance } from "vue";
import { getCachedOffers, saveOffers } from "../../offline/index.js";

export function useOffers() {
    const { proxy } = getCurrentInstance();
    const eventBus = proxy?.eventBus;
    const offers = ref([]);

    function get_offers(profileName, posProfile) {
        if (posProfile && posProfile.posa_local_storage) {
            const cached = getCachedOffers();
            if (cached.length) {
                offers.value = cached;
                eventBus?.emit("set_offers", cached);
            }
        }
        return frappe
            .call("posawesome.posawesome.api.offers.get_offers", { profile: profileName })
            .then((r) => {
                if (r.message) {
                    console.info("LoadOffers");
                    saveOffers(r.message);
                    offers.value = r.message;
                    eventBus?.emit("set_offers", r.message);
                }
            })
            .catch((err) => {
                console.error("Failed to fetch offers:", err);
                const cached = getCachedOffers();
                if (cached.length) {
                    offers.value = cached;
                    eventBus?.emit("set_offers", cached);
                }
            });
    }

    return { offers, get_offers };
}
