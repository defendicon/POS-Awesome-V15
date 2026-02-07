<template>
	<v-dialog
		:model-value="modelValue"
		@update:model-value="$emit('update:modelValue', $event)"
		max-width="520px"
	>
		<v-card>
			<v-card-title>
				<span class="text-h6 text-primary">{{ __("Create Supplier") }}</span>
			</v-card-title>
			<v-card-text>
				<v-text-field
					v-model="form.supplier_name"
					:label="frappe._('Supplier Name')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-select
					v-model="form.supplier_group"
					:items="groups"
					:label="frappe._('Supplier Group')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
					clearable
				/>
				<v-select
					v-model="form.supplier_type"
					:items="['Company', 'Individual']"
					:label="frappe._('Supplier Type')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-text-field
					v-model="form.tax_id"
					:label="frappe._('Tax ID')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-text-field
					v-model="form.mobile_no"
					:label="frappe._('Mobile Number')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-text-field
					v-model="form.email_id"
					:label="frappe._('Email')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="error" variant="text" @click="$emit('update:modelValue', false)">{{
					__("Cancel")
				}}</v-btn>
				<v-btn color="primary" variant="tonal" :loading="loading" :disabled="loading" @click="submit">
					{{ __("Create") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
export default {
	props: {
		modelValue: Boolean,
		groups: Array,
		posProfile: Object,
	},
	emits: ["update:modelValue", "created"],
	data: () => ({
		loading: false,
		form: {
			supplier_name: "",
			supplier_group: "",
			supplier_type: "Company",
			tax_id: "",
			mobile_no: "",
			email_id: "",
		},
	}),
	watch: {
		modelValue(val) {
			if (val) {
				this.resetForm();
			}
		},
	},
	methods: {
		resetForm() {
			this.form = {
				supplier_name: "",
				supplier_group: this.groups[0] || "",
				supplier_type: "Company",
				tax_id: "",
				mobile_no: "",
				email_id: "",
			};
		},
		async submit() {
			if (!this.form.supplier_name) {
				// Use the toast store passed as a prop or inject if available
				// For now let's use frappe.msgprint or similar if available, or just emit error
				this.$emit("error", __("Supplier name is required"));
				return;
			}
			this.loading = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_supplier",
					args: {
						data: {
							...this.form,
							pos_profile: this.posProfile,
						},
					},
				});
				this.$emit("created", message);
				this.$emit("update:modelValue", false);
			} catch (error) {
				console.error("Failed to create supplier:", error);
				this.$emit("error", __("Failed to create supplier"));
			} finally {
				this.loading = false;
			}
		},
	},
};
</script>
