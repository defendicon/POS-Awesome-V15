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

<script setup>
/* global frappe __ */
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import _ from "lodash";
import UpdateCustomer from "./UpdateCustomer.vue";
import Skeleton from "../ui/Skeleton.vue";
import { memoryInitPromise } from "../../../offline/index.js";
import { useCustomersStore } from "../../stores/customersStore.js";

const props = defineProps({
        pos_profile: Object,
});

const { proxy } = getCurrentInstance();
const eventBus = proxy?.eventBus;

const customersStore = useCustomersStore();
const {
        customers,
        loadingCustomers,
        customersLoaded,
        isCustomerBackgroundLoading,
        filteredCustomers,
        effectiveReadonly,
        selectedCustomer,
        customerInfo,
        readonly,
        pendingCustomerSearch,
} = storeToRefs(customersStore);

const internalCustomer = ref(null);
const tempSelectedCustomer = ref(null);
const isMenuOpen = ref(false);
const customerDropdown = ref(null);

const attachScrollListener = () => {
        const dropdown = customerDropdown.value?.$el?.querySelector(".v-overlay__content .v-select-list");
        if (dropdown) {
                dropdown.scrollTop = 0;
                dropdown.addEventListener("scroll", onCustomerScroll);
        }
};

const detachScrollListener = () => {
        const dropdown = customerDropdown.value?.$el?.querySelector(".v-overlay__content .v-select-list");
        if (dropdown) {
                dropdown.removeEventListener("scroll", onCustomerScroll);
        }
};

const runSearch = async (term) => {
        customersStore.setSearchTerm(term || "");
        await customersStore.searchCustomers(term || "");
};

const searchDebounce = _.debounce((value) => {
        runSearch(value || "");
}, 300);

const closeCustomerMenu = () => {
        const dropdown = customerDropdown.value;
        if (dropdown) {
                try {
                        dropdown.menu = false;
                } catch (e) {
                        dropdown.$emit?.("update:menu", false);
                }
                const inputEl = dropdown.$el?.querySelector("input");
                if (inputEl) {
                        inputEl.blur();
                }
        }
        isMenuOpen.value = false;
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
        } else {
                detachScrollListener();
                if (tempSelectedCustomer.value) {
                        internalCustomer.value = tempSelectedCustomer.value;
                        customersStore.setSelectedCustomer(tempSelectedCustomer.value);
                } else if (selectedCustomer.value) {
                        internalCustomer.value = selectedCustomer.value;
                }
                tempSelectedCustomer.value = null;
        }
};

const onCustomerScroll = (event) => {
        const el = event.target;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
                customersStore.loadMoreCustomers();
        }
};

const onCustomerChange = (value) => {
        if (value && value === selectedCustomer.value) {
                internalCustomer.value = selectedCustomer.value;
                eventBus?.emit("show_message", {
                        title: __("Customer already selected"),
                        color: "error",
                });
                return;
        }

        tempSelectedCustomer.value = value;

        if (isMenuOpen.value && value) {
                closeCustomerMenu();
        } else if (!isMenuOpen.value && value) {
                customersStore.setSelectedCustomer(value);
        }
};

const onCustomerSearch = (value) => {
        if (isCustomerBackgroundLoading.value) {
                pendingCustomerSearch.value = value || "";
                return;
        }
        searchDebounce(value || "");
};

const handleEnter = (event) => {
        const inputText = event.target.value?.toLowerCase() || "";
        const matched = customers.value.find((cust) => {
                return (
                        cust.customer_name?.toLowerCase().includes(inputText) ||
                        cust.name?.toLowerCase().includes(inputText)
                );
        });

        if (matched) {
                tempSelectedCustomer.value = matched.name;
                internalCustomer.value = matched.name;
                customersStore.setSelectedCustomer(matched.name);
                closeCustomerMenu();
                if (event?.target?.blur) {
                        event.target.blur();
                }
        }
};

const new_customer = () => {
        eventBus?.emit("open_update_customer", null);
};

const edit_customer = () => {
        eventBus?.emit("open_update_customer", customerInfo.value);
};

const registerPosProfile = async (payload) => {
        await memoryInitPromise;
        await customersStore.registerPosProfile(payload);
};

const paymentsRegisterHandler = async (payload) => {
        await memoryInitPromise;
        await customersStore.registerPosProfile(payload);
};



watch(selectedCustomer, (value) => {
        if (!isMenuOpen.value) {
                internalCustomer.value = value;
        }
});

watch(readonly, (value) => {
        if (navigator.onLine) {
                customersStore.setReadonly(value);
        }
});

onMounted(async () => {
        await memoryInitPromise;
        await customersStore.searchCustomers("");
        internalCustomer.value = selectedCustomer.value;

        eventBus?.on("register_pos_profile", registerPosProfile);
        eventBus?.on("payments_register_pos_profile", paymentsRegisterHandler);
});

onBeforeUnmount(() => {
        eventBus?.off("register_pos_profile", registerPosProfile);
        eventBus?.off("payments_register_pos_profile", paymentsRegisterHandler);
        detachScrollListener();
        if (typeof searchDebounce.cancel === "function") {
                searchDebounce.cancel();
        }
});

defineExpose({
        onCustomerMenuToggle,
        onCustomerChange,
        onCustomerSearch,
        handleEnter,
        new_customer,
        edit_customer,
        closeCustomerMenu,
        customerDropdown,
        internalCustomer,
});
</script>
