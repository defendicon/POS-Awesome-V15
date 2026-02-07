<template>
	<v-dialog
		:model-value="modelValue"
		@update:model-value="$emit('update:modelValue', $event)"
		max-width="800px"
		transition="dialog-bottom-transition"
	>
		<v-card>
			<v-card-title class="d-flex align-center">
				<span>{{ __("Packing List") }} ({{ items.length }})</span>
				<v-spacer></v-spacer>
				<v-btn
					icon="mdi-close"
					variant="text"
					density="compact"
					@click="$emit('update:modelValue', false)"
				></v-btn>
			</v-card-title>
			<v-divider></v-divider>
			<v-card-text>
				<v-alert type="warning" density="compact" class="mb-2">
					{{
						__(
							"For 'Product Bundle' items, Warehouse, Serial No and Batch No will be considered from the 'Packing List' table. If Warehouse and Batch No are same for all packing items for any 'Product Bundle' item, those values can be entered in the main Item table; values will be copied to 'Packing List' table.",
						)
					}}
				</v-alert>
				<v-data-table
					:headers="headers"
					:items="items"
					class="elevation-1"
					hide-default-footer
					density="compact"
				>
					<template v-slot:item.index="{ index }">
						{{ index + 1 }}
					</template>
					<template v-slot:item.qty="{ item }">
						{{ formatFloat(item.qty) }}
					</template>
					<template v-slot:item.rate="{ item }">
						<div class="currency-display">
							<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
							<span class="amount-value">{{ formatCurrency(item.rate) }}</span>
						</div>
					</template>
					<template v-slot:item.warehouse="{ item }">
						<v-text-field v-model="item.warehouse" hide-details density="compact" />
					</template>
					<template v-slot:item.batch_no="{ item }">
						<v-text-field v-model="item.batch_no" hide-details density="compact" />
					</template>
					<template v-slot:item.serial_no="{ item }">
						<v-text-field v-model="item.serial_no" hide-details density="compact" />
					</template>
				</v-data-table>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup>
defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},
	items: {
		type: Array,
		default: () => [],
	},
	displayCurrency: {
		type: String,
		default: "",
	},
	formatFloat: {
		type: Function,
		default: (val) => val,
	},
	formatCurrency: {
		type: Function,
		default: (val) => val,
	},
	currencySymbol: {
		type: Function,
		default: () => "",
	},
});

defineEmits(["update:modelValue"]);

const headers = [
	{ title: __("No."), key: "index" },
	{ title: __("Parent Item"), key: "parent_item" },
	{ title: __("Item Code"), key: "item_code" },
	{ title: __("Description"), key: "item_name" },
	{ title: __("Qty"), key: "qty" },
	{ title: __("Rate"), key: "rate" },
	{ title: __("Warehouse"), key: "warehouse" },
	{ title: __("Batch"), key: "batch_no" },
	{ title: __("Serial"), key: "serial_no" },
];
</script>
