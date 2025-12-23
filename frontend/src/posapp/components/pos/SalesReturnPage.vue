<template>
	<div fluid>
		<v-row>
			<v-col cols="12">
				<v-card
					class="main mx-auto mt-3 p-4 overflow-y-auto"
					style="max-height: 94vh; height: 94vh"
				>
			<v-card-title class="primary white--text">
				<v-icon left dark>mdi-keyboard-return</v-icon>
				<span class="headline">{{ __("Sales Return") }}</span>
			</v-card-title>

			<v-card-text class="pt-4">
				<v-stepper v-model="step" alt-labels>
					<!-- Step 1: Select Invoice -->
					<v-stepper-header>
						<v-stepper-item :complete="step > 1" :value="1" editable>
							{{ __("Select Invoice") }}
						</v-stepper-item>
						<v-divider></v-divider>
						<v-stepper-item :complete="step > 2" :value="2" :editable="invoice_data != null">
							{{ __("Select Items") }}
						</v-stepper-item>
						<v-divider></v-divider>
						<v-stepper-item :value="3" :editable="total_return_amount > 0">
							{{ __("Return Type") }}
						</v-stepper-item>
					</v-stepper-header>

					<v-stepper-window>
						<!-- Step 1: Select Invoice -->
						<v-stepper-window-item :value="1">
							<v-container>
								<v-row>
									<v-col cols="12" md="6">
										<v-text-field
											v-model="invoice_search"
											:label="__('Invoice Number')"
											outlined
											dense
											@keyup.enter="load_invoice"
											:loading="loading"
											prepend-icon="mdi-magnify"
										></v-text-field>
									</v-col>
									<v-col cols="12" md="2">
										<v-btn
											block
											color="primary"
											@click="load_invoice"
											:loading="loading"
											:disabled="!invoice_search"
										>
											{{ __("Load Invoice") }}
										</v-btn>
									</v-col>
								</v-row>

								<v-alert v-if="invoice_data" type="info" prominent border="left">
									<v-row align="center">
										<v-col class="grow">
											<div class="text-h6">{{ invoice_data.customer_name }}</div>
											<div>
												<strong>{{ __("Invoice") }}:</strong> {{ invoice_data.name }}
											</div>
											<div>
												<strong>{{ __("Date") }}:</strong> {{ invoice_data.posting_date }}
											</div>
											<div>
												<strong>{{ __("Total") }}:</strong>
												{{ format_currency(invoice_data.grand_total) }}
											</div>
										</v-col>
									</v-row>
								</v-alert>

								<v-btn color="primary" @click="step = 2" :disabled="!invoice_data" class="mt-4">
									{{ __("Continue") }}
									<v-icon right>mdi-arrow-right</v-icon>
								</v-btn>
							</v-container>
						</v-stepper-window-item>

						<!-- Step 2: Select Return Items -->
						<v-stepper-window-item :value="2">
							<v-container>
								<v-data-table
									:headers="item_headers"
									:items="invoice_data ? invoice_data.items : []"
									dense
									:items-per-page="10"
									class="elevation-1"
								>
									<template v-slot:[`item.returned_qty`]="{ item }">
										<v-text-field
											v-model.number="item.returned_qty"
											type="number"
											dense
											outlined
											:max="item.qty"
											min="0"
											step="1"
											style="width: 100px"
											hide-details
										></v-text-field>
									</template>
									<template v-slot:[`item.amount`]="{ item }">
										{{ format_currency(item.amount) }}
									</template>
									<template v-slot:[`item.return_amount`]="{ item }">
										<strong>{{ format_currency(calculate_return_amount(item)) }}</strong>
									</template>
								</v-data-table>

								<v-alert type="success" prominent border="left" class="mt-4">
									<div class="text-h6">
										{{ __("Total Return Amount") }}: {{ format_currency(total_return_amount) }}
									</div>
								</v-alert>

								<div class="mt-4">
									<v-btn text @click="step = 1">
										<v-icon left>mdi-arrow-left</v-icon>
										{{ __("Back") }}
									</v-btn>
									<v-btn
										color="primary"
										@click="step = 3"
										:disabled="total_return_amount <= 0"
										class="ml-2"
									>
										{{ __("Continue") }}
										<v-icon right>mdi-arrow-right</v-icon>
									</v-btn>
								</div>
							</v-container>
						</v-stepper-window-item>

						<!-- Step 3: Select Return Type -->
						<v-stepper-window-item :value="3">
							<v-container>
								<v-row>
									<v-col cols="12">
										<v-card
											v-for="type in return_types"
											:key="type.value"
											:class="[
												'mb-3',
												'pa-3',
												return_type === type.value ? 'primary' : '',
											]"
											:outlined="return_type !== type.value"
											@click="return_type = type.value"
											style="cursor: pointer"
										>
											<v-card-title>
												<span :class="return_type === type.value ? 'white--text' : ''">
													{{ type.icon }} {{ type.title }}
												</span>
											</v-card-title>
											<v-card-text
												:class="return_type === type.value ? 'white--text' : ''"
											>
												{{ type.description }}
											</v-card-text>
										</v-card>
									</v-col>
								</v-row>

								<!-- Replacement Items Section -->
								<v-card v-if="return_type === 'Replace'" outlined class="mt-4">
									<v-card-title class="subtitle-1">
										{{ __("Select Replacement Items") }}
									</v-card-title>
									<v-card-text>
										<v-row>
											<v-col cols="12" md="8">
												<v-text-field
													v-model="replacement_search"
													:label="__('Search Item by Name or Code')"
													outlined
													dense
													@keyup.enter="search_replacement_items"
													prepend-icon="mdi-magnify"
												></v-text-field>
											</v-col>
											<v-col cols="12" md="4">
												<v-btn
													block
													color="primary"
													@click="search_replacement_items"
													:loading="searching_items"
												>
													{{ __("Search") }}
												</v-btn>
											</v-col>
										</v-row>

										<v-list dense v-if="replacement_items_list.length > 0">
											<v-list-item
												v-for="item in replacement_items_list"
												:key="item.item_code"
												@click="add_replacement_item(item)"
											>
												<v-list-item-content>
													<v-list-item-title>{{
														item.item_name
													}}</v-list-item-title>
													<v-list-item-subtitle>
														{{ item.item_code }} -
														{{ format_currency(item.rate) }}
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
														<tr
															v-for="(item, index) in replacement_items"
															:key="index"
														>
															<td>{{ item.item_name }}</td>
															<td>
																<v-text-field
																	v-model.number="item.qty"
																	type="number"
																	dense
																	outlined
																	min="1"
																	style="width: 80px"
																	hide-details
																></v-text-field>
															</td>
															<td>{{ format_currency(item.rate) }}</td>
															<td>
																{{ format_currency(item.qty * item.rate) }}
															</td>
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

											<v-alert :type="balance_type" prominent border="left" class="mt-4">
												<div>
													<strong>{{ __("Return Amount") }}:</strong>
													{{ format_currency(total_return_amount) }}
												</div>
												<div>
													<strong>{{ __("Replacement Amount") }}:</strong>
													{{ format_currency(total_replacement_amount) }}
												</div>
												<v-divider class="my-2"></v-divider>
												<div class="text-h6">
													<strong>{{ __("Balance") }}:</strong>
													{{ format_currency(Math.abs(balance)) }}
													<span v-if="balance > 0"
														>({{ __("Refund to Customer") }})</span
													>
													<span v-else-if="balance < 0"
														>({{ __("Customer Pays") }})</span
													>
													<span v-else>({{ __("Exact Match") }})</span>
												</div>
											</v-alert>
										</div>
									</v-card-text>
								</v-card>

								<div class="mt-4">
									<v-btn text @click="step = 2">
										<v-icon left>mdi-arrow-left</v-icon>
										{{ __("Back") }}
									</v-btn>
									<v-btn
										color="success"
										@click="process_return"
										:loading="processing"
										:disabled="
											return_type === 'Replace' && replacement_items.length === 0
										"
										class="ml-2"
									>
										<v-icon left>mdi-check</v-icon>
										{{ __("Process Return") }}
									</v-btn>
								</div>
							</v-container>
						</v-stepper-window-item>
					</v-stepper-window>
				</v-stepper>
			</v-card-text>
		</v-card>
			</v-col>
		</v-row>

		<!-- Success Dialog -->
		<v-dialog v-model="success_dialog" max-width="600px">
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
	</div>
</template>

<script>
/* global frappe, __ */
export default {
	name: "SalesReturnPage",
	data() {
		return {
			step: 1,
			invoice_search: "",
			invoice_data: null,
			loading: false,
			return_type: "Cash",
			return_types: [
				{
					value: "Cash",
					icon: "💵",
					title: __("Cash Return"),
					description: __("Refund cash to customer"),
				},
				{
					value: "Replace",
					icon: "🔄",
					title: __("Replace with Another Item"),
					description: __("Exchange returned items with new items"),
				},
				{
					value: "Credit",
					icon: "💳",
					title: __("Customer Credit"),
					description: __("Save as credit for future purchases"),
				},
			],
			replacement_search: "",
			replacement_items_list: [],
			replacement_items: [],
			searching_items: false,
			processing: false,
			success_dialog: false,
			success_message: "",
			item_headers: [
				{ text: __("Item Code"), value: "item_code" },
				{ text: __("Item Name"), value: "item_name" },
				{ text: __("Qty"), value: "qty" },
				{ text: __("Rate"), value: "rate" },
				{ text: __("Amount"), value: "amount" },
				{ text: __("Return Qty"), value: "returned_qty" },
				{ text: __("Return Amount"), value: "return_amount" },
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
	methods: {
		async load_invoice() {
			if (!this.invoice_search) {
				frappe.show_alert({ message: __("Please enter invoice number"), indicator: "red" });
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
					frappe.show_alert({
						message: __("Invoice loaded successfully"),
						indicator: "green",
					});
				}
			} catch (error) {
				console.error("Error loading invoice:", error);
				frappe.show_alert({
					message: __("Error loading invoice: ") + error.message,
					indicator: "red",
				});
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
				// Get POS profile from invoice data or use a default
				const pos_profile = this.invoice_data?.pos_profile || null;
				
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: pos_profile,
						search_value: this.replacement_search,
						limit: 20,
					},
				});

				if (response.message) {
					// Map the response to a simpler format
					this.replacement_items_list = response.message.map(item => ({
						item_code: item.item_code,
						item_name: item.item_name,
						rate: item.rate || item.price_list_rate || 0,
						warehouse: item.actual_qty > 0 ? item.warehouse : null,
					}));
				}
			} catch (error) {
				console.error("Error searching items:", error);
				frappe.show_alert({ message: __("Error searching items"), indicator: "red" });
			} finally {
				this.searching_items = false;
			}
		},

		add_replacement_item(item) {
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
			if (this.total_return_amount <= 0) {
				frappe.show_alert({
					message: __("Please select items to return"),
					indicator: "red",
				});
				return;
			}

			if (this.return_type === "Replace" && this.replacement_items.length === 0) {
				frappe.show_alert({
					message: __("Please add replacement items"),
					indicator: "red",
				});
				return;
			}

			this.processing = true;
			try {
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
					},
				});

				if (response.message) {
					this.show_success_message(response.message);
				}
			} catch (error) {
				console.error("Error processing return:", error);
				frappe.show_alert({
					message: __("Error processing return: ") + error.message,
					indicator: "red",
				});
			} finally {
				this.processing = false;
			}
		},

		show_success_message(result) {
			let message = `<div><strong>${__("Return Invoice")}:</strong> ${result.return_invoice}</div>`;
			message += `<div><strong>${__("Return Amount")}:</strong> ${this.format_currency(result.return_amount)}</div>`;

			if (result.payment_entry) {
				message += `<div><strong>${__("Payment Entry")}:</strong> ${result.payment_entry}</div>`;
			}

			if (result.replacement_invoice) {
				message += `<div><strong>${__("Replacement Invoice")}:</strong> ${result.replacement_invoice}</div>`;
				message += `<div><strong>${__("Balance")}:</strong> ${this.format_currency(result.balance)}</div>`;
			}

			if (result.customer_credit) {
				message += `<div class="mt-2 pa-2 success--text"><strong>${__("Customer Credit Saved")}:</strong> ${this.format_currency(result.customer_credit)}</div>`;
			}

			message += `<div class="mt-2">${result.message}</div>`;

			this.success_message = message;
			this.success_dialog = true;
		},

		close_success_dialog() {
			this.success_dialog = false;
			this.reset();
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
			// Use simple number formatting to avoid HTML output
			if (value === null || value === undefined) return "0.00";
			const num = parseFloat(value) || 0;
			return num.toFixed(2);
		},
		
		format_currency_with_symbol(value) {
			const formatted = this.format_currency(value);
			return `${formatted}`;
		},
	},
};
</script>

<style scoped>
.v-stepper {
	box-shadow: none;
}
</style>

