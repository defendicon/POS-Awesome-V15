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
import UpdateCustomer from "./UpdateCustomer.vue";
import Skeleton from "../ui/Skeleton.vue";
import _ from "lodash";
import { memoryInitPromise } from "../../../offline/index.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { storeToRefs } from "pinia";

export default {
        props: {
                pos_profile: Object,
        },

        components: {
                UpdateCustomer,
                Skeleton,
        },

        setup() {
                const customersStore = useCustomersStore();
                const storeRefs = storeToRefs(customersStore);

                return {
                        customersStore,
                        ...storeRefs,
                };
        },

        data: () => ({
                internalCustomer: null,
                tempSelectedCustomer: null,
                isMenuOpen: false,
                searchDebounce: null,
        }),

        watch: {
                pos_profile: {
                        immediate: true,
                        handler(val) {
                                if (val) {
                                        const currentProfile = this.customersStore.posProfile;
                                        this.customersStore.setPosProfile(val);
                                        if (!currentProfile || currentProfile?.name !== val?.name) {
                                                this.customersStore.get_customer_names();
                                        }
                                }
                        },
                },
                selectedCustomer: {
                        immediate: true,
                        handler(val) {
                                if (!this.isMenuOpen) {
                                        this.internalCustomer = val || null;
                                }
                        },
                },
        },

        methods: {
                // Called when dropdown opens or closes
                onCustomerMenuToggle(isOpen) {
                        this.isMenuOpen = isOpen;

                        if (isOpen) {
				this.internalCustomer = null;

				this.$nextTick(() => {
					setTimeout(() => {
						const dropdown = this.$refs.customerDropdown?.$el?.querySelector(
							".v-overlay__content .v-select-list",
						);
						if (dropdown) {
							dropdown.scrollTop = 0;
							dropdown.addEventListener("scroll", this.onCustomerScroll);
						}
					}, 50);
				});
                        } else {
                                const dropdown = this.$refs.customerDropdown?.$el?.querySelector(
                                        ".v-overlay__content .v-select-list",
                                );
                                if (dropdown) {
                                        dropdown.removeEventListener("scroll", this.onCustomerScroll);
                                }
                                if (this.tempSelectedCustomer) {
                                        this.internalCustomer = this.tempSelectedCustomer;
                                        this.customersStore.setSelectedCustomer(this.tempSelectedCustomer);
                                } else if (this.selectedCustomer) {
                                        this.internalCustomer = this.selectedCustomer;
                                }

                                this.tempSelectedCustomer = null;
                        }
                },

		onCustomerScroll(e) {
			const el = e.target;
			if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
				this.loadMoreCustomers();
			}
		},

		closeCustomerMenu() {
			const dropdown = this.$refs.customerDropdown;
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
			this.isMenuOpen = false;
                },

                // Called when a customer is selected
                onCustomerChange(val) {
                        // if user selects the same customer again, show a meaningful error
                        if (val && val === this.selectedCustomer) {
                                // keep the current selection and notify the user
                                this.internalCustomer = this.selectedCustomer;
                                this.eventBus.emit("show_message", {
                                        title: __("Customer already selected"),
                                        color: "error",
                                });
                                return;
			}

			this.tempSelectedCustomer = val;

                        if (this.isMenuOpen && val) {
                                this.closeCustomerMenu();
                        } else if (!this.isMenuOpen && val) {
                                this.customersStore.setSelectedCustomer(val);
                        }
                },

                onCustomerSearch(val) {
                        if (this.isCustomerBackgroundLoading) {
                                this.customersStore.queueSearchWhileLoading(val);
                                return;
                        }
                        this.searchDebounce(val);
                },

                async loadMoreCustomers() {
                        await this.customersStore.loadMoreCustomers();
                },

                // Pressing Enter in input
                handleEnter(event) {
                        const inputText = event.target.value?.toLowerCase() || "";

                        const matched = this.customers.find((cust) => {
                                return (
                                        cust.customer_name?.toLowerCase().includes(inputText) ||
                                        cust.name?.toLowerCase().includes(inputText)
                                );
                        });

                        if (matched) {
                                this.tempSelectedCustomer = matched.name;
                                this.internalCustomer = matched.name;
                                this.customersStore.setSelectedCustomer(matched.name);
                                this.closeCustomerMenu();
                                if (event?.target?.blur) {
                                        event.target.blur();
                                }
                        }
                },
                new_customer() {
                        this.eventBus.emit("open_update_customer", null);
                },

                edit_customer() {
                        this.eventBus.emit("open_update_customer", this.customerInfo);
                },
        },

        created() {
                memoryInitPromise.then(async () => {
                        await this.customersStore.searchCustomers("");
                });

                this.searchDebounce = _.debounce(async (val) => {
                        await this.customersStore.setSearchTerm(val || "");
                }, 300);

                this.$nextTick(() => {
                        this.eventBus.on("register_pos_profile", async (pos_profile) => {
                                await memoryInitPromise;
                                this.customersStore.setPosProfile(pos_profile);
                                await this.customersStore.get_customer_names();
                        });

                        this.eventBus.on("payments_register_pos_profile", async (pos_profile) => {
                                await memoryInitPromise;
                                this.customersStore.setPosProfile(pos_profile);
                                await this.customersStore.get_customer_names();
                        });

                        this.eventBus.on("set_customer_readonly", (value) => {
                                this.customersStore.setReadonly(value);
                        });

                        this.eventBus.on("set_customer_info_to_edit", (data) => {
                                this.customersStore.setCustomerInfo(data);
                        });

                });
        },
};
</script>
