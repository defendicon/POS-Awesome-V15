<template>
	<div class="invoice-discounts-page h-100">
		<v-container fluid class="pa-4 h-100">
			<v-card class="h-100 pos-themed-card d-flex flex-column" flat>
				<v-card-title class="d-flex align-center py-2 px-4 border-bottom flex-shrink-0">
					<span class="text-h6 font-weight-bold">Invoice Discounts</span>
				</v-card-title>
				<v-card-text class="pa-4 flex-grow-1 d-flex flex-column overflow-hidden" style="min-height: 0;">
					<div class="flex-shrink-0">
						<div class="mb-4 w-100">
							<Customer :pos_profile="posProfile" />
						</div>

						<!-- Filters -->
						<div class="d-flex gap-4 mb-4" v-if="selectedCustomer">
							<v-row dense>
								<v-col cols="12" sm="4">
									<v-text-field
										v-model="filters.from_date"
										label="From Date"
										type="date"
										density="compact"
										variant="outlined"
										hide-details
										@change="fetchInvoices"
									></v-text-field>
								</v-col>
								<v-col cols="12" sm="4">
									<v-text-field
										v-model="filters.to_date"
										label="To Date"
										type="date"
										density="compact"
										variant="outlined"
										hide-details
										@change="fetchInvoices"
									></v-text-field>
								</v-col>
								<v-col cols="12" sm="4">
									<v-select
										v-model="filters.sort_order"
										:items="sortOptions"
										label="Sort Order"
										density="compact"
										variant="outlined"
										hide-details
										item-title="text"
										item-value="value"
										@update:modelValue="fetchInvoices"
									></v-select>
								</v-col>
							</v-row>
						</div>
					</div>

					<!-- Invoices List -->
					<div class="flex-grow-1 overflow-y-auto" v-if="selectedCustomer">
						<v-data-table
							:headers="headers"
							:items="invoices"
							:loading="loading"
							class="elevation-1"
							density="compact"
							hover
							show-select
							item-value="name"
							v-model="selectedInvoices"
							:items-per-page="25"
							fixed-header
						>
							<template v-slot:item.grand_total="{ item }">
								{{ formatCurrency(item.grand_total, item.currency) }}
							</template>
							<template v-slot:item.posting_date="{ item }">
								{{ formatDate(item.posting_date) }}
							</template>
							<template v-slot:no-data>
								<div class="pa-4 text-center">
									No submitted invoices found for this customer.
								</div>
							</template>
						</v-data-table>
					</div>

					<div v-else class="d-flex justify-center align-center flex-grow-1 text-medium-emphasis">
						<div class="text-center">
							<v-icon size="64" color="primary" class="mb-4">mdi-account-search</v-icon>
							<div class="text-h5">Select a Customer</div>
							<div class="text-body-1 mt-2">Search for a customer to view their submitted invoices.</div>
						</div>
					</div>

					<!-- Footer Actions -->
					<div class="mt-4 pt-4 border-top flex-shrink-0" v-if="selectedCustomer">
						<v-row align="center">
							<v-col cols="12" sm="4">
								<v-text-field
									label="Discount Amount"
									type="number"
									density="compact"
									variant="outlined"
									hide-details
									v-model="discountAmount"
									prefix="$"
								></v-text-field>
							</v-col>
							<v-col cols="12" sm="8" class="d-flex justify-end gap-2">
								<v-btn color="primary" variant="outlined" class="mr-2" @click="submitDiscount(false)" :loading="submitting">
									Submit
								</v-btn>
								<v-btn color="primary" @click="submitDiscount(true)" :loading="submitting">
									Submit and Print
								</v-btn>
							</v-col>
						</v-row>
					</div>
				</v-card-text>
			</v-card>
		</v-container>
	</div>
</template>

<script>
import { ref, watch, onMounted, getCurrentInstance } from "vue";
import { storeToRefs } from "pinia";
import Customer from "../pos/Customer.vue";
import { useCustomersStore } from "../../stores/customersStore.js";
import format from "../../format";

export default {
	name: "InvoiceDiscounts",
	components: {
		Customer,
	},
	mixins: [format],
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
	},
	setup() {
		const { proxy } = getCurrentInstance();
		const eventBus = proxy?.eventBus;
		const customersStore = useCustomersStore();
		const { selectedCustomer } = storeToRefs(customersStore);
		return { selectedCustomer, eventBus };
	},
	data() {
		return {
			invoices: [],
			selectedInvoices: [],
			discountAmount: "",
			submitting: false,
			loading: false,
			filters: {
				from_date: "",
				to_date: "",
				sort_order: "desc",
			},
			sortOptions: [
				{ text: "Newest First", value: "desc" },
				{ text: "Oldest First (Chronological)", value: "asc" },
			],
			headers: [
				{ title: "Invoice", key: "name", align: "start" },
				{ title: "Date", key: "posting_date", align: "start" },
				{ title: "Status", key: "status", align: "start" },
				{ title: "Amount", key: "grand_total", align: "end" },
			],
		};
	},
	watch: {
		selectedCustomer(newVal) {
			if (newVal) {
				this.fetchInvoices();
			} else {
				this.invoices = [];
			}
		},
	},
	methods: {
		async fetchInvoices() {
			if (!this.selectedCustomer) return;
			if (!this.posProfile || !this.posProfile.company) {
				console.warn("POS Profile not ready");
				return;
			}
			this.loading = true;
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.invoices.get_submitted_invoices",
					args: {
						customer: this.selectedCustomer,
						company: this.posProfile.company,
						from_date: this.filters.from_date,
						to_date: this.filters.to_date,
						sort_order: this.filters.sort_order,
						pos_profile: this.posProfile.name,
						limit: 1000,
					},
				});
				this.invoices = res.message?.invoices || [];
			} catch (e) {
				console.error("Failed to fetch invoices", e);
			} finally {
				this.loading = false;
			}
		},
		formatDate(date) {
			if (!date) return "";
			return frappe.datetime.str_to_user(date);
		},
		async submitDiscount(print) {
			if (this.selectedInvoices.length !== 1) {
				this.eventBus?.emit("show_message", {
					title: "Please select exactly one invoice",
					color: "error",
				});
				return;
			}

			if (!this.discountAmount || parseFloat(this.discountAmount) <= 0) {
				this.eventBus?.emit("show_message", {
					title: "Please enter a valid discount amount",
					color: "error",
				});
				return;
			}

			this.submitting = true;
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.invoices.create_discount_credit_note",
					args: {
						invoice_name: this.selectedInvoices[0],
						discount_amount: this.discountAmount,
						pos_profile: this.posProfile.name,
					},
				});

				if (res.message) {
					this.eventBus?.emit("show_message", {
						title: "Discount applied successfully",
						color: "success",
					});

					this.selectedInvoices = [];
					this.discountAmount = "";
					this.fetchInvoices(); // Refresh list

					if (print) {
						// Trigger print for the new Credit Note
						this.eventBus?.emit("print_invoice", res.message);
					}
				}
			} catch (e) {
				console.error("Failed to apply discount", e);
				// Error message is usually handled by frappe.call globally or shows up in UI
			} finally {
				this.submitting = false;
			}
		},
	},
};
</script>

<style scoped>
.invoice-discounts-page {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.border-bottom {
	border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

:deep([data-theme="dark"]) .border-bottom {
	border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
