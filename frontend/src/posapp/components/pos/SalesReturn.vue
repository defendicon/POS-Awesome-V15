<template>
	<v-dialog v-model="dialog" max-width="1200px" persistent>
		<v-card>
			<v-card-title class="primary white--text">
				<span class="headline">{{ __("Sales Return") }}</span>
				<v-spacer></v-spacer>
				<v-btn icon dark @click="close_dialog">
					<v-icon>mdi-close</v-icon>
				</v-btn>
			</v-card-title>

			<v-card-text>
				<v-stepper v-model="step" vertical>
					<!-- Step 1: Select Invoice -->
					<v-stepper-step :complete="step > 1" step="1">
						{{ __("Select Invoice") }}
					</v-stepper-step>
					<v-stepper-content step="1">
						<v-text-field
							v-model="invoice_search"
							:label="__('Invoice Number')"
							outlined
							dense
							@keyup.enter="load_invoice"
							:loading="loading"
						>
							<template v-slot:append>
								<v-btn small color="primary" @click="load_invoice" :loading="loading">
									{{ __("Load") }}
								</v-btn>
							</template>
						</v-text-field>

						<v-alert v-if="invoice_data" type="info" dense>
							<strong>{{ __("Customer") }}:</strong> {{ invoice_data.customer_name }}<br />
							<strong>{{ __("Date") }}:</strong> {{ invoice_data.posting_date }}<br />
							<strong>{{ __("Total") }}:</strong> {{ format_currency(invoice_data.grand_total) }}
						</v-alert>

						<v-btn color="primary" @click="step = 2" :disabled="!invoice_data">
							{{ __("Continue") }}
						</v-btn>
					</v-stepper-content>

					<!-- Step 2: Select Return Items -->
					<v-stepper-step :complete="step > 2" step="2">
						{{ __("Select Items to Return") }}
					</v-stepper-step>
					<v-stepper-content step="2">
						<v-data-table
							:headers="item_headers"
							:items="invoice_data ? invoice_data.items : []"
							dense
							:items-per-page="10"
						>
							<template v-slot:item.returned_qty="{ item }">
								<v-text-field
									v-model.number="item.returned_qty"
									type="number"
									dense
									outlined
									:max="item.qty"
									min="0"
									style="width: 100px"
								></v-text-field>
							</template>
							<template v-slot:item.amount="{ item }">
								{{ format_currency(item.amount) }}
							</template>
							<template v-slot:item.return_amount="{ item }">
								{{ format_currency(calculate_return_amount(item)) }}
							</template>
						</v-data-table>

						<v-alert type="success" dense class="mt-4">
							<strong>{{ __("Total Return Amount") }}:</strong>
							{{ format_currency(total_return_amount) }}
						</v-alert>

						<div class="mt-4">
							<v-btn text @click="step = 1">{{ __("Back") }}</v-btn>
							<v-btn color="primary" @click="step = 3" :disabled="total_return_amount <= 0">
								{{ __("Continue") }}
							</v-btn>
						</div>
					</v-stepper-content>

					<!-- Step 3: Select Return Type -->
					<v-stepper-step :complete="step > 3" step="3">
						{{ __("Return Type") }}
					</v-stepper-step>
					<v-stepper-content step="3">
						<v-radio-group v-model="return_type" mandatory>
							<v-radio label="💵 Cash Return" value="Cash">
								<template v-slot:label>
									<div>
										<strong>{{ __("Cash Return") }}</strong>
										<div class="text-caption">
											{{ __("Refund cash to customer") }}
										</div>
									</div>
								</template>
							</v-radio>

							<v-radio label="🔄 Replace with Another Item" value="Replace">
								<template v-slot:label>
									<div>
										<strong>{{ __("Replace with Another Item") }}</strong>
										<div class="text-caption">
											{{ __("Exchange returned items with new items") }}
										</div>
									</div>
								</template>
							</v-radio>

							<v-radio label="💳 Customer Credit" value="Credit">
								<template v-slot:label>
									<div>
										<strong>{{ __("Customer Credit") }}</strong>
										<div class="text-caption">
											{{ __("Save as credit for future purchases") }}
										</div>
									</div>
								</template>
							</v-radio>
						</v-radio-group>

						<!-- Replacement Items Section -->
						<v-card v-if="return_type === 'Replace'" outlined class="mt-4">
							<v-card-title class="subtitle-2">
								{{ __("Select Replacement Items") }}
							</v-card-title>
							<v-card-text>
								<v-text-field
									v-model="replacement_search"
									:label="__('Search Item')"
									outlined
									dense
									@keyup.enter="search_replacement_items"
								>
									<template v-slot:append>
										<v-btn
											small
											color="primary"
											@click="search_replacement_items"
											:loading="searching_items"
										>
											{{ __("Search") }}
										</v-btn>
									</template>
								</v-text-field>

								<v-list dense v-if="replacement_items_list.length > 0">
									<v-list-item
										v-for="item in replacement_items_list"
										:key="item.item_code"
										@click="add_replacement_item(item)"
									>
										<v-list-item-content>
											<v-list-item-title>{{ item.item_name }}</v-list-item-title>
											<v-list-item-subtitle>
												{{ item.item_code }} - {{ format_currency(item.rate) }}
											</v-list-item-subtitle>
										</v-list-item-content>
										<v-list-item-action>
											<v-btn small color="primary">{{ __("Add") }}</v-btn>
										</v-list-item-action>
									</v-list-item>
								</v-list>

								<v-divider class="my-4"></v-divider>

								<div v-if="replacement_items.length > 0">
									<v-simple-table dense>
										<template v-slot:default>
											<thead>
												<tr>
													<th>{{ __("Item") }}</th>
													<th>{{ __("Qty") }}</th>
													<th>{{ __("Rate") }}</th>
													<th>{{ __("Amount") }}</th>
													<th></th>
												</tr>
											</thead>
											<tbody>
												<tr v-for="(item, index) in replacement_items" :key="index">
													<td>{{ item.item_name }}</td>
													<td>
														<v-text-field
															v-model.number="item.qty"
															type="number"
															dense
															outlined
															min="1"
															style="width: 80px"
														></v-text-field>
													</td>
													<td>{{ format_currency(item.rate) }}</td>
													<td>{{ format_currency(item.qty * item.rate) }}</td>
													<td>
														<v-btn
															icon
															small
															color="error"
															@click="remove_replacement_item(index)"
														>
															<v-icon small>mdi-delete</v-icon>
														</v-btn>
													</td>
												</tr>
											</tbody>
										</template>
									</v-simple-table>

									<v-alert :type="balance_type" dense class="mt-4">
										<div>
											<strong>{{ __("Return Amount") }}:</strong>
											{{ format_currency(total_return_amount) }}
										</div>
										<div>
											<strong>{{ __("Replacement Amount") }}:</strong>
											{{ format_currency(total_replacement_amount) }}
										</div>
										<v-divider class="my-2"></v-divider>
										<div>
											<strong>{{ __("Balance") }}:</strong>
											{{ format_currency(Math.abs(balance)) }}
											<span v-if="balance > 0">({{ __("Refund to Customer") }})</span>
											<span v-else-if="balance < 0">({{ __("Customer Pays") }})</span>
											<span v-else>({{ __("Exact Match") }})</span>
										</div>
									</v-alert>
								</div>
							</v-card-text>
						</v-card>

						<div class="mt-4">
							<v-btn text @click="step = 2">{{ __("Back") }}</v-btn>
							<v-btn
								color="primary"
								@click="process_return"
								:loading="processing"
								:disabled="return_type === 'Replace' && replacement_items.length === 0"
							>
								{{ __("Process Return") }}
							</v-btn>
						</div>
					</v-stepper-content>
				</v-stepper>
			</v-card-text>
		</v-card>

		<!-- Success Dialog -->
		<v-dialog v-model="success_dialog" max-width="500px">
			<v-card>
				<v-card-title class="success white--text">
					<v-icon left dark>mdi-check-circle</v-icon>
					{{ __("Return Processed Successfully") }}
				</v-card-title>
				<v-card-text class="pt-4">
					<div v-html="success_message"></div>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="primary" @click="close_success_dialog">{{ __("Close") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-dialog>
</template>

<script>
export default {
	name: "SalesReturn",
	props: {
		value: Boolean,
		pos_profile: Object,
		pos_opening_shift: String,
	},
	data() {
		return {
			dialog: false,
			step: 1,
			invoice_search: "",
			invoice_data: null,
			loading: false,
			return_type: "Cash",
			replacement_search: "",
			replacement_items_list: [],
			replacement_items: [],
			searching_items: false,
			processing: false,
			success_dialog: false,
			success_message: "",
			item_headers: [
				{ text: this.__("Item Code"), value: "item_code" },
				{ text: this.__("Item Name"), value: "item_name" },
				{ text: this.__("Qty"), value: "qty" },
				{ text: this.__("Rate"), value: "rate" },
				{ text: this.__("Amount"), value: "amount" },
				{ text: this.__("Return Qty"), value: "returned_qty" },
				{ text: this.__("Return Amount"), value: "return_amount" },
			],
		};
	},
	computed: {
		total_return_amount() {
			if (!this.invoice_data || !this.invoice_data.items) return 0;
			return this.invoice_data.items.reduce((sum, item) => {
				return sum + this.calculate_return_amount(item);
			}, 0);
		},
		total_replacement_amount() {
			return this.replacement_items.reduce((sum, item) => {
				return sum + item.qty * item.rate;
			}, 0);
		},
		balance() {
			return this.total_return_amount - this.total_replacement_amount;
		},
		balance_type() {
			if (this.balance > 0) return "info";
			if (this.balance < 0) return "warning";
			return "success";
		},
	},
	watch: {
		value(val) {
			this.dialog = val;
		},
		dialog(val) {
			this.$emit("input", val);
			if (!val) {
				this.reset();
			}
		},
	},
	methods: {
		async load_invoice() {
			if (!this.invoice_search) {
				this.show_message("Please enter invoice number", "error");
				return;
			}

			this.loading = true;
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.sales_return.get_invoice_for_return",
					args: {
						invoice_name: this.invoice_search,
					},
				});

				if (response.message) {
					this.invoice_data = response.message;
					this.invoice_data.items.forEach((item) => {
						item.returned_qty = 0;
					});
					this.show_message("Invoice loaded successfully", "success");
				}
			} catch (error) {
				console.error("Error loading invoice:", error);
				this.show_message("Error loading invoice: " + error.message, "error");
			} finally {
				this.loading = false;
			}
		},

		calculate_return_amount(item) {
			const returned_qty = parseFloat(item.returned_qty) || 0;
			return returned_qty * item.rate;
		},

		async search_replacement_items() {
			if (!this.replacement_search) return;

			this.searching_items = true;
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.posapp.search_items",
					args: {
						search_term: this.replacement_search,
						pos_profile: this.pos_profile.name,
					},
				});

				if (response.message) {
					this.replacement_items_list = response.message;
				}
			} catch (error) {
				console.error("Error searching items:", error);
				this.show_message("Error searching items", "error");
			} finally {
				this.searching_items = false;
			}
		},

		add_replacement_item(item) {
			// Check if item already added
			const exists = this.replacement_items.find((i) => i.item_code === item.item_code);
			if (exists) {
				exists.qty += 1;
			} else {
				this.replacement_items.push({
					item_code: item.item_code,
					item_name: item.item_name,
					qty: 1,
					rate: item.rate,
					warehouse: item.warehouse,
				});
			}
			this.replacement_search = "";
			this.replacement_items_list = [];
		},

		remove_replacement_item(index) {
			this.replacement_items.splice(index, 1);
		},

		async process_return() {
			// Validate
			if (this.total_return_amount <= 0) {
				this.show_message("Please select items to return", "error");
				return;
			}

			if (this.return_type === "Replace" && this.replacement_items.length === 0) {
				this.show_message("Please add replacement items", "error");
				return;
			}

			this.processing = true;
			try {
				// Prepare return items
				const return_items = this.invoice_data.items
					.filter((item) => item.returned_qty > 0)
					.map((item) => ({
						item_code: item.item_code,
						qty: item.returned_qty,
						rate: item.rate,
						warehouse: item.warehouse,
					}));

				const response = await frappe.call({
					method: "posawesome.posawesome.api.sales_return.process_sales_return",
					args: {
						invoice_name: this.invoice_data.name,
						return_items: JSON.stringify(return_items),
						return_type: this.return_type,
						replacement_items:
							this.return_type === "Replace"
								? JSON.stringify(this.replacement_items)
								: null,
						pos_profile: this.pos_profile ? this.pos_profile.name : null,
						pos_opening_shift: this.pos_opening_shift,
					},
				});

				if (response.message) {
					this.show_success_message(response.message);
				}
			} catch (error) {
				console.error("Error processing return:", error);
				this.show_message("Error processing return: " + error.message, "error");
			} finally {
				this.processing = false;
			}
		},

		show_success_message(result) {
			let message = `<div><strong>${this.__("Return Invoice")}:</strong> ${result.return_invoice}</div>`;
			message += `<div><strong>${this.__("Return Amount")}:</strong> ${this.format_currency(result.return_amount)}</div>`;

			if (result.payment_entry) {
				message += `<div><strong>${this.__("Payment Entry")}:</strong> ${result.payment_entry}</div>`;
			}

			if (result.replacement_invoice) {
				message += `<div><strong>${this.__("Replacement Invoice")}:</strong> ${result.replacement_invoice}</div>`;
				message += `<div><strong>${this.__("Balance")}:</strong> ${this.format_currency(result.balance)}</div>`;
			}

			if (result.customer_credit) {
				message += `<div class="mt-2 pa-2 success--text"><strong>${this.__("Customer Credit Saved")}:</strong> ${this.format_currency(result.customer_credit)}</div>`;
			}

			message += `<div class="mt-2">${result.message}</div>`;

			this.success_message = message;
			this.success_dialog = true;
		},

		close_success_dialog() {
			this.success_dialog = false;
			this.close_dialog();
		},

		close_dialog() {
			this.dialog = false;
		},

		reset() {
			this.step = 1;
			this.invoice_search = "";
			this.invoice_data = null;
			this.return_type = "Cash";
			this.replacement_search = "";
			this.replacement_items_list = [];
			this.replacement_items = [];
		},

		format_currency(value) {
			return frappe.format(value, { fieldtype: "Currency" });
		},

		show_message(message, color) {
			this.$emit("show_message", { title: message, color: color });
		},

		__(text) {
			return __(text);
		},
	},
};
</script>

<style scoped>
.v-stepper {
	box-shadow: none;
}
</style>

