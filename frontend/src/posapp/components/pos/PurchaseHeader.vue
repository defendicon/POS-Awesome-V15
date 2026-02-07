<template>
	<v-container class="pa-0">
		<v-row dense class="mb-2">
			<v-col cols="12" md="6">
				<v-autocomplete
					:model-value="supplier"
					@update:model-value="$emit('update:supplier', $event)"
					:items="supplierOptions"
					item-title="supplier_name"
					item-value="name"
					:label="frappe._('Supplier')"
					density="compact"
					variant="outlined"
					color="primary"
					hide-details="auto"
					:loading="supplierLoading"
					@update:search="$emit('search-supplier', $event)"
					:custom-filter="() => true"
					:no-data-text="supplierLoading ? __('Loading suppliers...') : __('Suppliers not found')"
					class="pos-themed-input"
					clearable
				>
					<template #append-inner>
						<v-tooltip v-if="allowCreateSupplier" text="Add new supplier">
							<template #activator="{ props }">
								<v-icon
									v-bind="props"
									class="cursor-pointer"
									@mousedown.prevent.stop
									@click.stop="$emit('create-supplier')"
								>
									mdi-plus
								</v-icon>
							</template>
						</v-tooltip>
					</template>
				</v-autocomplete>
			</v-col>
			<v-col cols="12" md="6">
				<v-autocomplete
					:model-value="warehouse"
					@update:model-value="$emit('update:warehouse', $event)"
					:items="warehouseOptions"
					item-title="warehouse_name"
					item-value="name"
					:label="frappe._('Warehouse')"
					density="compact"
					variant="outlined"
					color="primary"
					hide-details="auto"
					clearable
					:loading="warehouseLoading"
					class="pos-themed-input"
				/>
			</v-col>
		</v-row>

		<v-row dense class="mb-4">
			<v-col cols="6">
				<VueDatePicker
					:model-value="transactionDate"
					@update:model-value="$emit('update:transactionDate', $event)"
					model-type="format"
					format="dd-MM-yyyy"
					:enable-time-picker="false"
					auto-apply
					:placeholder="frappe._('Posting Date')"
					class="pos-themed-input"
				/>
			</v-col>
			<v-col cols="6">
				<VueDatePicker
					:model-value="scheduleDate"
					@update:model-value="$emit('update:scheduleDate', $event)"
					model-type="format"
					format="dd-MM-yyyy"
					:enable-time-picker="false"
					auto-apply
					:placeholder="frappe._('Required By')"
					class="pos-themed-input"
				/>
			</v-col>
		</v-row>

		<div class="d-flex gap-4 mb-4">
			<v-switch
				v-if="posProfile.posa_allow_purchase_receipt"
				:model-value="receiveNow"
				@update:model-value="$emit('update:receiveNow', $event)"
				density="compact"
				hide-details
				color="success"
				:label="__('Receive now')"
				class="ma-0"
			></v-switch>
			<v-switch
				:model-value="createInvoice"
				@update:model-value="$emit('update:createInvoice', $event)"
				density="compact"
				hide-details
				color="primary"
				:label="__('Create Bill')"
				class="ma-0 ml-4"
			></v-switch>
		</div>
	</v-container>
</template>

<script>
export default {
	props: {
		supplier: String,
		supplierOptions: Array,
		supplierLoading: Boolean,
		allowCreateSupplier: Boolean,
		warehouse: String,
		warehouseOptions: Array,
		warehouseLoading: Boolean,
		transactionDate: String,
		scheduleDate: String,
		receiveNow: Boolean,
		createInvoice: Boolean,
		posProfile: Object,
	},
	emits: [
		"update:supplier",
		"update:warehouse",
		"update:transactionDate",
		"update:scheduleDate",
		"update:receiveNow",
		"update:createInvoice",
		"search-supplier",
		"create-supplier",
	],
};
</script>
