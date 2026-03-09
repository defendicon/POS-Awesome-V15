<template>
	<v-row justify="center">
		<v-dialog v-model="ordersDialog" max-width="900">
			<!-- <template v-slot:activator="{ on, attrs }">
              <v-btn color="primary" theme="dark" v-bind="attrs" v-on="on">Open Dialog</v-btn>
            </template>-->
			<v-card
				class="sales-orders-dialog pos-themed-card pos-dialog-shell"
				style="--pos-dialog-max-width: 900px; --pos-dialog-max-height: 820px"
			>
				<v-card-title class="pos-dialog-header">
					<div class="pos-dialog-header__main">
						<div class="sales-orders-dialog__icon">
							<v-icon size="22">mdi-cart-arrow-down</v-icon>
						</div>
						<div>
							<div class="text-h5 text-primary">{{ __("Select Sales Orders") }}</div>
							<div class="text-body-2 text-medium-emphasis">
								{{ __("Search and load a sales order into the current invoice") }}
							</div>
						</div>
					</div>
					<v-btn
						icon="mdi-close"
						variant="text"
						class="pos-dialog-close pos-touch-target pos-focus-ring"
						:aria-label="__('Close sales orders dialog')"
						@click="close_dialog"
					/>
				</v-card-title>
				<v-card-text class="pa-0 pos-dialog-body">
					<v-container class="sales-orders-dialog__body">
						<v-row class="mb-4">
							<v-text-field
								color="primary"
								:label="frappe._('Order ID')"
								hide-details
								v-model="order_name"
								density="compact"
								clearable
								class="mx-4 pos-themed-input"
							></v-text-field>
							<v-btn
								variant="text"
								class="ml-2 pos-dialog-action-btn pos-touch-target pos-focus-ring"
								color="primary"
								theme="dark"
								:loading="isLoading"
								:disabled="isLoading || isSubmitting"
								@click="search_orders"
								>{{ __("Search") }}</v-btn
							>
						</v-row>
						<v-row v-if="errorMessage">
							<v-col cols="12" class="pt-0">
								<v-alert type="error" density="compact" border="start" class="mx-4">
									{{ errorMessage }}
								</v-alert>
							</v-col>
						</v-row>
						<v-row no-gutters>
							<v-col cols="12" class="pa-1">
								<v-data-table
									v-if="dialog_data.length"
									:headers="headers"
									:items="dialog_data"
									item-key="name"
									class="elevation-1"
									show-select
									v-model="selected"
									return-object
									select-strategy="single"
								>
									<!-- <template v-slot:item.posting_time="{ item }">
                          {{ item.posting_time.split(".")[0] }}
                        </template> -->
									<template v-slot:item.grand_total="{ item }">
										{{ currencySymbol(item.currency) }}
										{{ formatCurrency(item.grand_total) }}
									</template>
								</v-data-table>
								<div
									v-else-if="searchedOnce && !isLoading && !errorMessage"
									class="sales-orders-empty-state"
								>
									<v-icon size="40" color="primary">mdi-text-box-search-outline</v-icon>
									<div class="sales-orders-empty-state__title">
										{{ __("No sales orders found") }}
									</div>
									<div class="sales-orders-empty-state__subtitle">
										{{ __("Try another order ID, then search again.") }}
									</div>
									<v-btn
										color="primary"
										variant="text"
										class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
										@click="clearSearch"
									>
										{{ __("Clear Search") }}
									</v-btn>
								</div>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions class="pos-dialog-actions">
					<v-spacer></v-spacer>
					<v-btn
						color="error"
						theme="dark"
						class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
						@click="close_dialog"
					>{{ __("Close") }}</v-btn>
					<v-btn
						v-if="selected.length"
						color="success"
						theme="dark"
						class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
						:loading="isSubmitting"
						:disabled="isSubmitting"
						@click="submit_dialog"
						>{{ __("Select") }}</v-btn
					>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import format from "../../../format";
import { useUIStore } from "../../../stores/uiStore.js";
import { useInvoiceStore } from "../../../stores/invoiceStore.js";
import { storeToRefs } from "pinia";
export default {
	// props: ["draftsDialog"],
	mixins: [format],
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const { ordersDialog, ordersData } = storeToRefs(uiStore);
		return { uiStore, invoiceStore, ordersDialog, ordersData };
	},
	mounted() {
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile;
			},
			{ deep: true, immediate: true },
		);
	},
	data: () => ({
		// draftsDialog: false, // Moved to store
		singleSelect: true,
		pos_profile: {},
		selected: [],
		dialog_data: [],
		order_name: "",
		searchedOnce: false,
		isLoading: false,
		isSubmitting: false,
		errorMessage: "",
		headers: [
			{
				title: __("Customer"),
				key: "customer_name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Date"),
				align: "start",
				sortable: true,
				key: "transaction_date",
			},
			//   {
			//     title: __("Time"),
			//     align: "start",
			//     sortable: true,
			//     key: "posting_time",
			//   },
			{
				title: __("Order"),
				key: "name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Amount"),
				key: "grand_total",
				align: "end",
				sortable: false,
			},
		],
	}),
	computed: {},
	methods: {
		close_dialog() {
			this.uiStore.closeOrders();
		},

		clearSelected() {
			this.selected = [];
		},

		clearSearch() {
			this.order_name = "";
			this.dialog_data = [];
			this.clearSelected();
			this.errorMessage = "";
			this.searchedOnce = false;
		},

		async search_orders() {
			if (this.isLoading || this.isSubmitting) {
				return;
			}

			this.searchedOnce = true;
			this.errorMessage = "";
			this.isLoading = true;

			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.sales_orders.search_orders",
					args: {
						order_name: this.order_name,
						company: this.pos_profile.company,
						currency: this.pos_profile.currency,
					},
				});

				this.dialog_data = message || [];
			} catch (error) {
				console.error("Failed to search sales orders:", error);
				this.errorMessage = __("Unable to fetch sales orders");
			} finally {
				this.isLoading = false;
			}
		},

		async submit_dialog() {
			if (this.isSubmitting || this.selected.length === 0) {
				return;
			}

			this.isSubmitting = true;
			this.errorMessage = "";

			try {
				let invoice_doc_for_load = {};
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.invoices.create_sales_invoice_from_order",
					args: {
						sales_order: this.selected[0].name,
					},
				});

				if (message) {
					invoice_doc_for_load = message;
				}

				if (invoice_doc_for_load.items) {
					const selectedItems = this.selected[0].items;
					const loadedItems = invoice_doc_for_load.items;

					const loadedItemsMap = {};
					loadedItems.forEach((item) => {
						loadedItemsMap[item.item_code] = item;
					});

					// Iterate through selectedItems and update or discard items
					for (let i = 0; i < selectedItems.length; i++) {
						const selectedItem = selectedItems[i];
						const loadedItem = loadedItemsMap[selectedItem.item_code];

						if (loadedItem) {
							// Update the fields of selected item with loaded item's values
							selectedItem.qty = loadedItem.qty;
							selectedItem.amount = loadedItem.amount;
							selectedItem.uom = loadedItem.uom;
							selectedItem.rate = loadedItem.rate;
							// Update other fields as needed
						} else {
							// If 'item_code' doesn't exist in loadedItems, discard the item
							selectedItems.splice(i, 1);
							i--; // Adjust the index as items are removed
						}
					}
				}

				this.invoiceStore.triggerLoadOrder(this.selected[0]);
				this.uiStore.closeOrders();

				if (invoice_doc_for_load.name) {
					await frappe.call({
						method: "posawesome.posawesome.api.invoices.delete_sales_invoice",
						args: {
							sales_invoice: invoice_doc_for_load.name,
						},
					});
				}
			} catch (error) {
				console.error("Failed to submit sales order:", error);
				this.errorMessage = __("Unable to load the selected sales order");
			} finally {
				this.isSubmitting = false;
			}
		},
	},
	created: function () {
		// Watcher handled via store storeToRefs
	},
	watch: {
		ordersData: {
			handler(data) {
				this.clearSelected();
				this.dialog_data = data || [];
				this.order_name = "";
				this.searchedOnce = false;
				this.errorMessage = "";
				this.isLoading = false;
				this.isSubmitting = false;
			},
			immediate: true,
		},
	},
	// beforeUnmount() {
	// 	this.eventBus.off("open_orders");
	// },
};
</script>

<style scoped>
.sales-orders-dialog {
	width: min(900px, calc(100vw - 24px));
}

.sales-orders-dialog__body {
	overflow-y: auto;
}

.sales-orders-dialog__icon {
	width: 44px;
	height: 44px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 12px;
	background: linear-gradient(135deg, rgba(25, 118, 210, 0.16), rgba(66, 165, 245, 0.12));
	color: var(--pos-primary);
}

.sales-orders-empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	min-height: 220px;
	padding: 24px 16px;
	border: 1px dashed var(--pos-border);
	border-radius: 18px;
	background: var(--pos-surface-muted);
	text-align: center;
}

.sales-orders-empty-state__title {
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.sales-orders-empty-state__subtitle {
	max-width: 32ch;
	color: var(--pos-text-secondary);
}

@media (max-width: 600px) {
	.sales-orders-dialog {
		width: calc(100vw - 16px);
	}
}
</style>
