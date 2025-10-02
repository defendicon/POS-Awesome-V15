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
import {
	db,
	checkDbHealth,
	setCustomerStorage,
	memoryInitPromise,
	getCustomersLastSync,
	setCustomersLastSync,
	getCustomerStorageCount,
	clearCustomerStorage,
	isOffline,
} from "../../../offline/index.js";
import _ from "lodash";

export default {
	props: {
		pos_profile: Object,
	},

	data: () => ({
		pos_profile: "",
		customers: [],
		customer: "",
		internalCustomer: null,
		tempSelectedCustomer: null,
		isMenuOpen: false,
		readonly: false,
		effectiveReadonly: false,
		customer_info: {},
		loadingCustomers: false,
		customers_loaded: false,
		searchTerm: "",
		page: 0,
		pageSize: 200,
		hasMore: true,
		nextCustomerStart: null,
		searchDebounce: null,
		// Track background loading state and pending searches
		isCustomerBackgroundLoading: false,
		pendingCustomerSearch: null,
		loadProgress: 0,
		totalCustomerCount: 0,
		loadedCustomerCount: 0,
	}),

	components: {
		UpdateCustomer,
		Skeleton,
	},

	computed: {
		filteredCustomers() {
			return this.isCustomerBackgroundLoading ? [] : this.customers;
		},
	},

	watch: {
		readonly(val) {
			this.effectiveReadonly = val && navigator.onLine;
		},
		customers_loaded(val) {
			if (val) {
				this.eventBus.emit("customers_loaded");
			}
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
					this.customer = this.tempSelectedCustomer;
					this.eventBus.emit("update_customer", this.customer);
				} else if (this.customer) {
					this.internalCustomer = this.customer;
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
			if (val && val === this.customer) {
				// keep the current selection and notify the user
				this.internalCustomer = this.customer;
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
				this.customer = val;
				this.eventBus.emit("update_customer", val);
			}
		},

		onCustomerSearch(val) {
			if (this.isCustomerBackgroundLoading) {
				this.pendingCustomerSearch = val;
				return;
			}
			this.searchDebounce(val);
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
				this.customer = matched.name;
				this.eventBus.emit("update_customer", matched.name);
				this.closeCustomerMenu();
				if (event?.target?.blur) {
					event.target.blur();
				}
			}
		},

		async searchCustomers(term, append = false) {
			try {
				await checkDbHealth();
				if (!db.isOpen()) await db.open();
				let collection = db.table("customers");
				const normalizedTerm = typeof term === "string" ? term.trim().toLowerCase() : "";
				if (normalizedTerm) {
					const searchParts = normalizedTerm.split(/\s+/).filter(Boolean);
					collection = collection.filter((customer) => {
						if (!customer) {
							return false;
						}

						const values = [
							customer.customer_name,
							customer.name,
							customer.mobile_no,
							customer.email_id,
							customer.tax_id,
						]
							.filter((value) => value !== null && value !== undefined)
							.map((value) => String(value).toLowerCase());

						if (!searchParts.length) {
							return true;
						}

						return searchParts.every((part) => values.some((value) => value.includes(part)));
					});
				}
				const results = await collection
					.offset(this.page * this.pageSize)
					.limit(this.pageSize)
					.toArray();
				if (append) {
					this.customers.push(...results);
				} else {
					this.customers = results;
				}
				this.hasMore = results.length === this.pageSize;
				if (this.hasMore) {
					this.page += 1;
				}
				return results.length;
			} catch (e) {
				console.error("Failed to search customers", e);
				return 0;
			}
		},

		async loadMoreCustomers() {
			if (this.loadingCustomers) return;
			const count = await this.searchCustomers(this.searchTerm, true);
			if (count === this.pageSize) return;
			if (this.nextCustomerStart) {
				await this.backgroundLoadCustomers(this.nextCustomerStart, getCustomersLastSync());
				await this.searchCustomers(this.searchTerm, true);
			}
		},

		async backgroundLoadCustomers(startAfter, syncSince) {
			const limit = this.pageSize;
			this.isCustomerBackgroundLoading = true;
			try {
				let cursor = startAfter;
				while (cursor) {
					const rows = await this.fetchCustomerPage(cursor, syncSince, limit);
					await setCustomerStorage(rows);
					this.loadedCustomerCount += rows.length;
					if (this.totalCustomerCount) {
						const progress = Math.min(
							99,
							Math.round((this.loadedCustomerCount / this.totalCustomerCount) * 100),
						);
						this.loadProgress = progress;
						this.eventBus.emit("data-load-progress", { name: "customers", progress });
					}
					if (rows.length === limit) {
						cursor = rows[rows.length - 1]?.name || null;
						this.nextCustomerStart = cursor;
					} else {
						cursor = null;
						this.nextCustomerStart = null;
						setCustomersLastSync(new Date().toISOString());
						this.loadProgress = 100;
						this.eventBus.emit("data-load-progress", { name: "customers", progress: 100 });
						this.eventBus.emit("data-loaded", "customers");
					}
				}
			} catch (err) {
				console.error("Failed to background load customers", err);
			} finally {
				this.isCustomerBackgroundLoading = false;
				if (this.pendingCustomerSearch !== null) {
					this.searchDebounce(this.pendingCustomerSearch);
					if (this.searchDebounce.flush) {
						this.searchDebounce.flush();
					}
					this.pendingCustomerSearch = null;
				}
			}
		},

		async verifyServerCustomerCount() {
			if (isOffline()) return;
			try {
				const localCount = await getCustomerStorageCount();
				const res = await frappe.call({
					method: "posawesome.posawesome.api.customers.get_customers_count",
					args: { pos_profile: this.pos_profile.pos_profile },
				});
				const serverCount = res.message || 0;
				if (typeof serverCount === "number") {
					this.totalCustomerCount = serverCount;
					this.loadedCustomerCount = localCount;
					this.loadProgress = serverCount ? Math.round((localCount / serverCount) * 100) : 0;
					this.eventBus.emit("data-load-progress", {
						name: "customers",
						progress: this.loadProgress,
					});
					if (serverCount > localCount) {
						const syncSince = getCustomersLastSync();
						const rows = await this.fetchCustomerPage(null, syncSince, this.pageSize);
						await setCustomerStorage(rows);
						this.loadedCustomerCount += rows.length;
						if (this.totalCustomerCount) {
							this.loadProgress = Math.round(
								(this.loadedCustomerCount / this.totalCustomerCount) * 100,
							);
							this.eventBus.emit("data-load-progress", {
								name: "customers",
								progress: this.loadProgress,
							});
						}
						const startAfter =
							rows.length === this.pageSize ? rows[rows.length - 1]?.name || null : null;
						if (startAfter) {
							this.backgroundLoadCustomers(startAfter, syncSince);
						} else {
							setCustomersLastSync(new Date().toISOString());
							this.loadProgress = 100;
							this.eventBus.emit("data-load-progress", { name: "customers", progress: 100 });
							this.eventBus.emit("data-loaded", "customers");
						}
						await this.searchCustomers(this.searchTerm);
					} else if (serverCount < localCount) {
						await clearCustomerStorage();
						setCustomersLastSync(null);
						this.customers = [];
						await this.get_customer_names();
					}
				}
			} catch (err) {
				console.error("Error verifying customer count:", err);
			}
		},

		fetchCustomerPage(startAfter, modifiedAfter, limit) {
			return new Promise((resolve, reject) => {
				frappe.call({
					method: "posawesome.posawesome.api.customers.get_customer_names",
					args: {
						pos_profile: this.pos_profile.pos_profile,
						modified_after: modifiedAfter,
						limit,
						start_after: startAfter,
					},
					callback: (r) => resolve(r.message || []),
					error: (err) => {
						console.error("Failed to fetch customers", err);
						reject(err);
					},
				});
			});
		},

		async get_customer_names() {
			const localCount = await getCustomerStorageCount();
			if (localCount > 0) {
				this.customers_loaded = true;
				await this.searchCustomers(this.searchTerm);
				await this.verifyServerCustomerCount();
				return;
			}
			const syncSince = getCustomersLastSync();
			this.loadProgress = 0;
			this.eventBus.emit("data-load-progress", { name: "customers", progress: 0 });
			this.loadingCustomers = true;
			try {
				// Fetch total customer count for accurate progress
				try {
					const countRes = await frappe.call({
						method: "posawesome.posawesome.api.customers.get_customers_count",
						args: { pos_profile: this.pos_profile.pos_profile },
					});
					this.totalCustomerCount = countRes.message || 0;
				} catch (e) {
					console.error("Failed to fetch customer count", e);
					this.totalCustomerCount = 0;
				}

				const rows = await this.fetchCustomerPage(null, syncSince, this.pageSize);
				await setCustomerStorage(rows);
				this.loadedCustomerCount = rows.length;
				if (this.totalCustomerCount) {
					this.loadProgress = Math.round(
						(this.loadedCustomerCount / this.totalCustomerCount) * 100,
					);
					this.eventBus.emit("data-load-progress", {
						name: "customers",
						progress: this.loadProgress,
					});
				}
				this.nextCustomerStart =
					rows.length === this.pageSize ? rows[rows.length - 1]?.name || null : null;
				if (this.nextCustomerStart) {
					// Load remaining customers in the background
					this.backgroundLoadCustomers(this.nextCustomerStart, syncSince);
				} else {
					setCustomersLastSync(new Date().toISOString());
					this.loadProgress = 100;
					this.eventBus.emit("data-load-progress", { name: "customers", progress: 100 });
					this.eventBus.emit("data-loaded", "customers");
				}
				this.customers_loaded = true;
			} catch (err) {
				console.error("Failed to fetch customers:", err);
			} finally {
				this.loadingCustomers = false;
				await this.searchCustomers(this.searchTerm);
			}
		},

		new_customer() {
			this.eventBus.emit("open_update_customer", null);
		},

		edit_customer() {
			this.eventBus.emit("open_update_customer", this.customer_info);
		},
	},

	created() {
		memoryInitPromise.then(async () => {
			await this.searchCustomers("");
			this.effectiveReadonly = this.readonly && navigator.onLine;
		});

		this.searchDebounce = _.debounce(async (val) => {
			this.searchTerm = val || "";
			this.page = 0;
			this.customers = [];
			this.hasMore = true;
			await this.searchCustomers(this.searchTerm);
		}, 300);

		this.effectiveReadonly = this.readonly && navigator.onLine;

		this.$nextTick(() => {
			this.eventBus.on("register_pos_profile", async (pos_profile) => {
				await memoryInitPromise;
				this.pos_profile = pos_profile;
				await this.get_customer_names();
			});

			this.eventBus.on("payments_register_pos_profile", async (pos_profile) => {
				await memoryInitPromise;
				this.pos_profile = pos_profile;
				await this.get_customer_names();
			});

			this.eventBus.on("set_customer", (customer) => {
				this.customer = customer;
				this.internalCustomer = customer;
			});

			this.eventBus.on("add_customer_to_list", async (customer) => {
				const index = this.customers.findIndex((c) => c.name === customer.name);
				if (index !== -1) {
					this.customers.splice(index, 1, customer);
				} else {
					this.customers.push(customer);
				}
				await setCustomerStorage([customer]);
				this.customer = customer.name;
				this.internalCustomer = customer.name;
				this.eventBus.emit("update_customer", customer.name);
			});

			this.eventBus.on("set_customer_readonly", (value) => {
				this.readonly = value;
			});

			this.eventBus.on("set_customer_info_to_edit", (data) => {
				this.customer_info = data;
			});

			this.eventBus.on("fetch_customer_details", async () => {
				await this.get_customer_names();
			});
		});
	},
};
</script>
