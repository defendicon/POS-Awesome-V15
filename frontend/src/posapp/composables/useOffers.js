import { ref, getCurrentInstance, computed, watch } from "vue";
import { getCachedOffers, saveOffers } from "../../offline/index.js";
import { useCustomersStore } from "../stores/customersStore.js";
import { storeToRefs } from "pinia";

export function useOffers() {
        const { proxy } = getCurrentInstance();
        const eventBus = proxy?.eventBus;
        const offers = ref([]);
        const lastRequest = ref({ profile: null, posProfile: null });

        const customersStore = useCustomersStore();
        const { selectedCustomer, customerInfo } = storeToRefs(customersStore);

        const activeContext = computed(() => {
                const currentCustomer = selectedCustomer.value || null;
                let resolvedInfo = {};

                if (currentCustomer && customerInfo.value?.customer === currentCustomer) {
                        resolvedInfo = customerInfo.value || {};
                }

                return {
                        customer: currentCustomer,
                        customer_group: resolvedInfo?.customer_group || null,
                        territory: resolvedInfo?.territory || null,
                };
        });

        const lastFetchedContext = ref({});

        function contextsAreEqual(a = {}, b = {}) {
                const fields = ["customer", "customer_group", "territory"];
                return fields.every((field) => {
                        const valueA = a?.[field] ?? null;
                        const valueB = b?.[field] ?? null;
                        return valueA === valueB;
                });
        }

        function get_offers(profileName, posProfile, overrides = {}) {
                const requestContext = {
                        ...activeContext.value,
                        ...Object.fromEntries(
                                Object.entries(overrides || {}).filter(([, value]) => value !== undefined),
                        ),
                };

                lastRequest.value = { profile: profileName, posProfile };
                lastFetchedContext.value = { ...requestContext };

                const args = { profile: profileName };
                if (requestContext.customer) {
                        args.customer = requestContext.customer;
                }
                if (requestContext.customer_group) {
                        args.customer_group = requestContext.customer_group;
                }
                if (requestContext.territory) {
                        args.territory = requestContext.territory;
                }

                if (posProfile && posProfile.posa_local_storage) {
                        const cached = getCachedOffers();
                        if (cached.length) {
                                offers.value = cached;
                                eventBus?.emit("set_offers", cached);
			}
		}
                return frappe
                        .call("posawesome.posawesome.api.offers.get_offers", args)
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

        watch(
                activeContext,
                (newContext, oldContext) => {
                        if (!lastRequest.value?.profile) {
                                return;
                        }

                        if (contextsAreEqual(newContext, oldContext)) {
                                if (contextsAreEqual(newContext, lastFetchedContext.value)) {
                                        return;
                                }
                        }

                        const { profile, posProfile } = lastRequest.value;
                        if (!profile) {
                                return;
                        }

                        get_offers(profile, posProfile, newContext);
                },
                { deep: true },
        );

        return { offers, get_offers };
}
