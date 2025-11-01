<template>
	<!-- ? Disable dropdown if either readonly or loadingCustomers is true -->
	<div class="customer-input-wrapper">
		<Skeleton v-if="loadingCustomers" height="48" class="w-100" />
		<v-autocomplete
			v-else
			ref="customerDropdown"
			class="customer-autocomplete sleek-field pos-themed-input"
			density="compact"
			clearable
			variant="solo"
			color="primary"
			:label="frappe._('Customer')"
			v-model="internalCustomer"
			:items="filteredCustomers"
			item-title="customer_name"
			item-value="name"
			:no-data-text="
				isCustomerBackgroundLoading ? __('Loading customer data...') : __('Customers not found')
			"
			hide-details
			:customFilter="() => true"
			:disabled="effectiveReadonly || loadingCustomers"
			:menu-props="{ closeOnContentClick: false }"
			@update:menu="onCustomerMenuToggle"
			@update:modelValue="onCustomerChange"
			@update:search="onCustomerSearch"
			@keydown.enter="handleEnter"
			:virtual-scroll="true"
			:virtual-scroll-item-height="48"
		>
			<!-- Edit icon (left) -->
			<template #prepend-inner>
				<v-tooltip text="Edit customer">
					<template #activator="{ props }">
						<v-icon
							v-bind="props"
							class="icon-button"
							@mousedown.prevent.stop
							@click.stop="edit_customer"
						>
							mdi-account-edit
						</v-icon>
					</template>
				</v-tooltip>
			</template>

			<!-- Add icon (right) -->
			<template #append-inner>
				<v-tooltip text="Add new customer">
					<template #activator="{ props }">
						<v-icon
							v-bind="props"
							class="icon-button"
							@mousedown.prevent.stop
							@click.stop="new_customer"
						>
							mdi-plus
						</v-icon>
					</template>
				</v-tooltip>
			</template>

			<!-- Dropdown display -->
			<template #item="{ props, item }">
				<v-list-item v-bind="props">
					<v-list-item-subtitle v-if="item.raw.customer_name !== item.raw.name">
						<div v-html="`ID: ${item.raw.name}`"></div>
					</v-list-item-subtitle>
					<v-list-item-subtitle v-if="item.raw.tax_id">
						<div v-html="`TAX ID: ${item.raw.tax_id}`"></div>
					</v-list-item-subtitle>
					<v-list-item-subtitle v-if="item.raw.email_id">
						<div v-html="`Email: ${item.raw.email_id}`"></div>
					</v-list-item-subtitle>
					<v-list-item-subtitle v-if="item.raw.mobile_no">
						<div v-html="`Mobile No: ${item.raw.mobile_no}`"></div>
					</v-list-item-subtitle>
					<v-list-item-subtitle v-if="item.raw.primary_address">
						<div v-html="`Primary Address: ${item.raw.primary_address}`"></div>
					</v-list-item-subtitle>
				</v-list-item>
			</template>
		</v-autocomplete>

		<!-- Update customer modal -->
		<div class="mt-4">
			<UpdateCustomer />
		</div>
	</div>
</template>

<style scoped>
.customer-input-wrapper {
	width: 100%;
	max-width: 100%;
	padding-right: 1.5rem;
	/* Elegant space at the right edge */
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	position: relative;
}

.customer-autocomplete {
	width: 100%;
	box-sizing: border-box;
	border-radius: 12px;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	transition: box-shadow 0.3s ease;
	background-color: var(--pos-input-bg);
}

.customer-autocomplete:hover {
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

/* Theme-aware internal field colors */
.customer-autocomplete :deep(.v-field__input),
.customer-autocomplete :deep(input),
.customer-autocomplete :deep(.v-label) {
	color: var(--pos-text-primary) !important;
}

.customer-autocomplete :deep(.v-field__overlay) {
	background-color: var(--pos-input-bg) !important;
}

.icon-button {
	cursor: pointer;
	font-size: 20px;
	opacity: 0.7;
	transition: all 0.2s ease;
}

.icon-button:hover {
	opacity: 1;
	color: var(--v-theme-primary);
}
</style>

<script>
/* global frappe __ */
import { ref, computed, watch, onMounted, onBeforeUnmount, getCurrentInstance, nextTick } from "vue";
import { storeToRefs } from "pinia";
import _ from "lodash";
import UpdateCustomer from "./UpdateCustomer.vue";
import Skeleton from "../ui/Skeleton.vue";
import { useCustomersStore } from "../../stores/customersStore.js";

export default {
	props: {
		pos_profile: Object,
	},
	components: {
		UpdateCustomer,
		Skeleton,
	},
        setup(props, { expose }) {
                const { proxy } = getCurrentInstance();
                const eventBus = proxy?.eventBus;
                const customersStore = useCustomersStore();
		const {
			customers,
			filteredCustomers,
			loadingCustomers,
			isCustomerBackgroundLoading,
			selectedCustomer,
			customerInfo,
		} = storeToRefs(customersStore);

		const internalCustomer = ref(null);
		const tempSelectedCustomer = ref(null);
		const isMenuOpen = ref(false);
		const customerDropdown = ref(null);
                const readonlyState = ref(false);

                let scrollContainer = null;

                const effectiveReadonly = computed(() => readonlyState.value && navigator.onLine);

		const searchDebounce = _.debounce((term) => {
			customersStore.queueSearch(term || "");
		}, 300);

		watch(
			selectedCustomer,
			(value) => {
				if (!isMenuOpen.value) {
					internalCustomer.value = value || null;
				}
			},
			{ immediate: true },
		);

		watch(
			() => props.pos_profile,
			(profile) => {
				if (profile) {
					customersStore.setPosProfile(profile);
				}
			},
			{ immediate: true },
		);

		const detachScrollListener = () => {
			if (scrollContainer) {
				scrollContainer.removeEventListener("scroll", onCustomerScroll);
				scrollContainer = null;
			}
		};

		const onCustomerScroll = (event) => {
			const el = event.target;
			if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
				customersStore.loadMoreCustomers();
			}
		};

		const attachScrollListener = () => {
			const dropdown = customerDropdown.value?.$el?.querySelector(".v-overlay__content .v-select-list");
			if (dropdown) {
				scrollContainer = dropdown;
				scrollContainer.scrollTop = 0;
				scrollContainer.addEventListener("scroll", onCustomerScroll);
			}
		};

		const onCustomerMenuToggle = (isOpen) => {
			isMenuOpen.value = isOpen;
			if (isOpen) {
				internalCustomer.value = null;
				nextTick(() => {
					setTimeout(() => {
						attachScrollListener();
					}, 50);
				});
				return;
			}

			detachScrollListener();
			if (tempSelectedCustomer.value) {
				internalCustomer.value = tempSelectedCustomer.value;
				customersStore.setSelectedCustomer(tempSelectedCustomer.value);
			} else if (selectedCustomer.value) {
				internalCustomer.value = selectedCustomer.value;
			}
			tempSelectedCustomer.value = null;
		};

		const closeCustomerMenu = () => {
			const dropdown = customerDropdown.value;
			if (dropdown) {
				try {
					dropdown.menu = false;
				} catch (err) {
					dropdown.$emit?.("update:menu", false);
				}
				const inputEl = dropdown.$el?.querySelector("input");
				if (inputEl) {
					inputEl.blur();
				}
			}
			isMenuOpen.value = false;
			detachScrollListener();
		};

		const onCustomerChange = (val) => {
			if (val && val === selectedCustomer.value) {
				internalCustomer.value = selectedCustomer.value;
				eventBus?.emit("show_message", {
					title: __("Customer already selected"),
					color: "error",
				});
				return;
			}

			tempSelectedCustomer.value = val;

			if (isMenuOpen.value && val) {
				closeCustomerMenu();
			} else if (!isMenuOpen.value && val) {
				customersStore.setSelectedCustomer(val);
			}
		};

		const onCustomerSearch = (value) => {
			const term = value || "";
			if (isCustomerBackgroundLoading.value) {
				customersStore.queueSearch(term);
				return;
			}
			searchDebounce(term);
		};

		const handleEnter = (event) => {
			const inputText = event.target.value?.toLowerCase() || "";
			const matched = customers.value.find((cust) => {
				return (
					cust.customer_name?.toLowerCase().includes(inputText) ||
					cust.name?.toLowerCase().includes(inputText)
				);
			});

			if (!matched) {
				return;
			}

			tempSelectedCustomer.value = matched.name;
			internalCustomer.value = matched.name;
			customersStore.setSelectedCustomer(matched.name);
			closeCustomerMenu();
			if (event?.target?.blur) {
				event.target.blur();
			}
		};

		const new_customer = () => {
			eventBus?.emit("open_update_customer", null);
		};

                const edit_customer = () => {
                        eventBus?.emit("open_update_customer", customerInfo.value || {});
                };

                const focusCustomerSearch = async () => {
                        const dropdown = customerDropdown.value;
                        if (!dropdown) {
                                return;
                        }

                        try {
                                dropdown.menu = true;
                        } catch (err) {
                                dropdown.$emit?.("update:menu", true);
                        }

                        isMenuOpen.value = true;

                        if (typeof dropdown.focus === "function") {
                                dropdown.focus();
                        }

                        await nextTick();

                        const inputEl = dropdown.$el?.querySelector("input");
                        if (inputEl) {
                                inputEl.focus();
                                inputEl.select?.();
                        }
                };

                expose({ focusCustomerSearch });

                const busHandlers = [];

		const registerBus = (event, handler) => {
			if (eventBus && typeof eventBus.on === "function") {
				eventBus.on(event, handler);
				busHandlers.push({ event, handler });
			}
		};

		onMounted(async () => {
			await customersStore.searchCustomers("");

			registerBus("register_pos_profile", async (data) => {
				customersStore.setPosProfile(data);
				await customersStore.get_customer_names();
			});

			registerBus("payments_register_pos_profile", async (data) => {
				customersStore.setPosProfile(data);
				await customersStore.get_customer_names();
			});

			registerBus("set_customer", (customer) => {
				customersStore.setSelectedCustomer(customer);
				internalCustomer.value = customer || null;
			});

			registerBus("add_customer_to_list", async (customer) => {
				await customersStore.addOrUpdateCustomer(customer);
				internalCustomer.value = customer?.name || null;
			});

			registerBus("set_customer_readonly", (value) => {
				readonlyState.value = Boolean(value);
			});

			registerBus("set_customer_info_to_edit", (data) => {
				customersStore.setCustomerInfo(data || {});
			});
		});

		onBeforeUnmount(() => {
			busHandlers.forEach(({ event, handler }) => {
				eventBus?.off(event, handler);
			});
			searchDebounce.cancel();
			detachScrollListener();
		});

                return {
                        customerDropdown,
                        filteredCustomers,
                        loadingCustomers,
                        isCustomerBackgroundLoading,
                        internalCustomer,
                        effectiveReadonly,
                        onCustomerMenuToggle,
                        onCustomerChange,
                        onCustomerSearch,
                        handleEnter,
                        new_customer,
                        edit_customer,
                        focusCustomerSearch,
                };
        },
};
</script>
