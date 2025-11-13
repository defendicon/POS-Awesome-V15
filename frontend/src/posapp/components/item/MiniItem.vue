<template>
	<div fluid>
		<v-row>
			<v-col cols="12">
				<v-card
					:class="[
						'main mx-auto mt-3 p-4 overflow-y-auto',
						isDarkTheme ? '' : 'bg-grey-lighten-5',
					]"
					:style="isDarkTheme ? 'background-color:#1E1E1E' : ''"
					style="max-height: 94vh; height: 94vh"
				>
					<v-card-title class="text-h5 mb-4">
						<v-icon left class="mr-2">mdi-tag</v-icon>
						{{ __("Create Item") }}
					</v-card-title>

					<v-form ref="itemForm">
						<!-- Item Code and Item Name -->
						<v-row>
							<v-col cols="12" md="6">
								<v-text-field
									v-model="item.item_code"
									:label="__('Item Code') + ' *'"
									density="compact"
									variant="outlined"
									:rules="[v => !!v || __('Item Code is required')]"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>

							<v-col cols="12" md="6">
								<v-text-field
									v-model="item.item_name"
									:label="__('Item Name')"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>
						</v-row>

						<!-- Barcode -->
						<v-row>
							<v-col cols="12" md="6">
								<v-text-field
									v-model="item.barcode"
									:label="__('Barcode')"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									prepend-inner-icon="mdi-barcode"
									hint="Enter product barcode (optional)"
									persistent-hint
								></v-text-field>
							</v-col>
						</v-row>

						<!-- Item Group and Stock UOM -->
						<v-row>
							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="item.item_group"
									:items="itemGroups"
									item-title="name"
									item-value="name"
									:label="__('Item Group') + ' *'"
									density="compact"
									variant="outlined"
									:rules="[v => !!v || __('Item Group is required')]"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>

							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="item.stock_uom"
									:items="uoms"
									item-title="name"
									item-value="name"
									:label="__('Stock UOM') + ' *'"
									density="compact"
									variant="outlined"
									:rules="[v => !!v || __('Stock UOM is required')]"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>
						</v-row>

						<!-- Description -->
						<v-row>
							<v-col cols="12">
								<v-textarea
									v-model="item.description"
									:label="__('Description')"
									density="compact"
									variant="outlined"
									rows="3"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-textarea>
							</v-col>
						</v-row>

						<!-- Additional Fields -->
						<v-row>
							<v-col cols="12" md="6">
								<v-text-field
									v-model.number="item.standard_rate"
									:label="__('Standard Rate')"
									type="number"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>

							<v-col cols="12" md="6">
								<v-text-field
									v-model.number="item.opening_stock"
									:label="__('Opening Stock')"
									type="number"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>
						</v-row>

						<!-- Brand and Valuation Rate -->
						<v-row>
							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="item.brand"
									:items="brands"
									item-title="name"
									item-value="name"
									:label="__('Brand')"
									density="compact"
									variant="outlined"
									clearable
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>

							<v-col cols="12" md="6">
								<v-text-field
									v-model.number="item.valuation_rate"
									:label="__('Valuation Rate')"
									type="number"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>
						</v-row>

						<!-- Checkboxes -->
						<v-row>
							<v-col cols="12" md="4">
								<v-checkbox
									v-model="item.is_stock_item"
									:label="__('Is Stock Item')"
									density="compact"
									:color="isDarkTheme ? 'primary' : 'primary'"
								></v-checkbox>
							</v-col>

							<v-col cols="12" md="4">
								<v-checkbox
									v-model="item.is_sales_item"
									:label="__('Is Sales Item')"
									density="compact"
									:color="isDarkTheme ? 'primary' : 'primary'"
								></v-checkbox>
							</v-col>

							<v-col cols="12" md="4">
								<v-checkbox
									v-model="item.is_purchase_item"
									:label="__('Is Purchase Item')"
									density="compact"
									:color="isDarkTheme ? 'primary' : 'primary'"
								></v-checkbox>
							</v-col>
						</v-row>

						<!-- Action Buttons -->
						<v-row class="mt-3">
							<v-col cols="12" class="d-flex justify-end">
								<v-btn
									color="grey"
									class="mr-2"
									@click="resetForm"
								>
									{{ __("Clear") }}
								</v-btn>
								<v-btn
									color="primary"
									:loading="submitting"
									@click="submitItem"
								>
									{{ __("Submit") }}
								</v-btn>
							</v-col>
						</v-row>
					</v-form>
				</v-card>
			</v-col>
		</v-row>

		<!-- Snackbar for notifications -->
		<v-snackbar v-model="snack" :timeout="snackTimeout" :color="snackColor" location="top right">
			{{ snackText }}
			<template v-slot:actions>
				<v-btn color="white" variant="text" @click="snack = false">{{ __("Close") }}</v-btn>
			</template>
		</v-snackbar>
	</div>
</template>

<script>
/* global frappe */
export default {
	name: "MiniItem",
	data() {
		return {
			item: {
				item_code: "",
				item_name: "",
				barcode: "",
				item_group: "",
				stock_uom: "",
				description: "",
				standard_rate: 0,
				opening_stock: 0,
				brand: "",
				valuation_rate: 0,
				is_stock_item: true,
				is_sales_item: true,
				is_purchase_item: true,
			},
			itemGroups: [],
			uoms: [],
			brands: [],
			submitting: false,
			snack: false,
			snackText: "",
			snackColor: "success",
			snackTimeout: 3000,
		};
	},
	computed: {
		isDarkTheme() {
			const themeMode = this.$theme?.theme?.value ?? "light";
			return themeMode === "dark";
		},
	},
	mounted() {
		this.loadInitialData();
	},
	methods: {
		async loadInitialData() {
			try {
				// Load Item Groups
				const itemGroupsResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Item Group",
						fields: ["name"],
						filters: { is_group: 0 },
						limit_page_length: 100,
					},
				});
				this.itemGroups = itemGroupsResponse.message || [];

				// Load UOMs
				const uomsResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "UOM",
						fields: ["name"],
						limit_page_length: 100,
					},
				});
				this.uoms = uomsResponse.message || [];

				// Set default UOM
				if (this.uoms.length > 0) {
					const defaultUom = this.uoms.find(uom => uom.name === "Nos") || this.uoms[0];
					this.item.stock_uom = defaultUom.name;
				}

				// Load Brands
				const brandsResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Brand",
						fields: ["name"],
						limit_page_length: 100,
					},
				});
				this.brands = brandsResponse.message || [];

			} catch (error) {
				console.error("Error loading initial data:", error);
				this.showMessage("Failed to load initial data", "error");
			}
		},
		async submitItem() {
			// Validate form
			const formValid = await this.$refs.itemForm.validate();
			if (!formValid.valid) {
				this.showMessage("Please fill all required fields", "error");
				return;
			}

			this.submitting = true;
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.item.create_item",
					args: {
						item_data: {
							item_code: this.item.item_code,
							item_name: this.item.item_name || this.item.item_code,
							barcode: this.item.barcode,
							item_group: this.item.item_group,
							stock_uom: this.item.stock_uom,
							description: this.item.description,
							standard_rate: this.item.standard_rate,
							opening_stock: this.item.opening_stock,
							brand: this.item.brand,
							valuation_rate: this.item.valuation_rate,
							is_stock_item: this.item.is_stock_item ? 1 : 0,
							is_sales_item: this.item.is_sales_item ? 1 : 0,
							is_purchase_item: this.item.is_purchase_item ? 1 : 0,
						},
					},
				});

				if (response.message && response.message.name) {
					this.showMessage(`Item ${response.message.name} created successfully`, "success");
					this.resetForm();
				} else {
					this.showMessage("Failed to create Item", "error");
				}
			} catch (error) {
				console.error("Error creating item:", error);
				this.showMessage(error.message || "Failed to create Item", "error");
			} finally {
				this.submitting = false;
			}
		},
		resetForm() {
			this.item = {
				item_code: "",
				item_name: "",
				barcode: "",
				item_group: "",
				stock_uom: this.uoms.length > 0 ? (this.uoms.find(uom => uom.name === "Nos") || this.uoms[0]).name : "",
				description: "",
				standard_rate: 0,
				opening_stock: 0,
				brand: "",
				valuation_rate: 0,
				is_stock_item: true,
				is_sales_item: true,
				is_purchase_item: true,
			};
			if (this.$refs.itemForm) {
				this.$refs.itemForm.reset();
			}
		},
		showMessage(text, color = "success") {
			this.snackText = text;
			this.snackColor = color;
			this.snack = true;
		},
	},
};
</script>

<style scoped>
.main {
	border-radius: 8px;
}
</style>

