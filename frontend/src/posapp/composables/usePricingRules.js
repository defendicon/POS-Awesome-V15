import { ref, getCurrentInstance } from "vue";

export function usePricingRules() {
        const { proxy } = getCurrentInstance();
        const eventBus = proxy?.eventBus;
        const pricingRules = ref([]);

        function get_pricing_rules(profileName) {
                if (!profileName) {
                        pricingRules.value = [];
                        eventBus?.emit("set_pricing_rules", []);
                        return Promise.resolve([]);
                }

                return frappe
                        .call("posawesome.posawesome.api.offers.get_pricing_rules", {
                                profile: profileName,
                        })
                        .then((r) => {
                                const rules = Array.isArray(r?.message) ? r.message : [];
                                pricingRules.value = rules;
                                eventBus?.emit("set_pricing_rules", rules);
                                return rules;
                        })
                        .catch((error) => {
                                console.error("Failed to fetch pricing rules:", error);
                                pricingRules.value = [];
                                eventBus?.emit("set_pricing_rules", []);
                                return [];
                        });
        }

        return { pricingRules, get_pricing_rules };
}
