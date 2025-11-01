<template>
	<v-row justify="center">
		<v-dialog v-model="draftsDialog" max-width="900px">
			<!-- <template v-slot:activator="{ on, attrs }">
              <v-btn color="primary" theme="dark" v-bind="attrs" v-on="on">Open Dialog</v-btn>
            </template>-->
			<v-card>
				<v-card-title>
					<span class="text-h5 text-primary">{{ __("Select Sales Orders") }}</span>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
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
								class="ml-2"
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
								<v-alert type="error" dense border="start" class="mx-4">
									{{ errorMessage }}
								</v-alert>
							</v-col>
						</v-row>
						<v-row no-gutters>
							<v-col cols="12" class="pa-1">
								<v-data-table
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
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="close_dialog">Close</v-btn>
					<v-btn
						v-if="selected.length"
						color="success"
						theme="dark"
						:loading="isSubmitting"
						:disabled="isSubmitting"
						@click="submit_dialog"
						>Select</v-btn
					>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
/* global __, frappe */
import format from "../../format";
export default {
	// props: ["draftsDialog"],
	mixins: [format],
	data: () => ({
		draftsDialog: false,
		singleSelect: true,
		pos_profile: {},
		selected: [],
		dialog_data: [],
		order_name: "",
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
	watch: {},
	methods: {
		close_dialog() {
			this.draftsDialog = false;
		},

		clearSelected() {
			this.selected = [];
		},

		async search_orders() {
			if (this.isLoading || this.isSubmitting) {
				return;
			}

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

				this.eventBus.emit("load_order", this.selected[0]);
				this.draftsDialog = false;

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
		this.eventBus.on("open_orders", (data) => {
			this.clearSelected();
			this.draftsDialog = true;
			this.dialog_data = data;
			this.order_name = "";
			this.errorMessage = "";
			this.isLoading = false;
			this.isSubmitting = false;
		});
	},
	mounted() {
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile;
		});
	},
	beforeUnmount() {
		this.eventBus.off("open_orders");
		this.eventBus.off("register_pos_profile");
	},
};
</script>
