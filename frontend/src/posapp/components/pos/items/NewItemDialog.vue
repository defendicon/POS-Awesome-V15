<template>
	<v-dialog
		:model-value="modelValue"
		@update:model-value="$emit('update:modelValue', $event)"
		max-width="500px"
	>
		<v-card>
			<v-card-title class="text-h6 pa-4">
				{{ __("Create New Item") }}
			</v-card-title>
			<v-card-text class="pa-4">
				<v-form ref="formRef" @submit.prevent="submit">
					<v-row dense>
						<v-col cols="12">
							<v-text-field
								v-model="form.item_code"
								:label="frappe._('Item Code')"
								density="compact"
								variant="outlined"
								class="pos-themed-input"
								:rules="[(v) => !!v || __('* Required')]"
							></v-text-field>
						</v-col>
						<v-col cols="12">
							<v-text-field
								v-model="form.item_name"
								:label="frappe._('Item Name')"
								density="compact"
								variant="outlined"
								class="pos-themed-input"
								:rules="[(v) => !!v || __('* Required')]"
							></v-text-field>
						</v-col>
						<v-col cols="12">
							<v-select
								v-model="form.item_group"
								:items="itemsGroup.filter((g) => g !== 'ALL')"
								:label="frappe._('Item Group')"
								density="compact"
								variant="outlined"
								class="pos-themed-input"
								:rules="[(v) => !!v || __('* Required')]"
							></v-select>
						</v-col>
						<v-col cols="6">
							<v-autocomplete
								v-model="form.stock_uom"
								:items="uomList"
								:label="frappe._('Stock UOM')"
								density="compact"
								variant="outlined"
								class="pos-themed-input"
								:rules="[(v) => !!v || __('* Required')]"
							></v-autocomplete>
						</v-col>
						<v-col cols="6">
							<v-text-field
								v-model="form.standard_rate"
								:label="frappe._('Standard Rate')"
								type="number"
								density="compact"
								variant="outlined"
								class="pos-themed-input"
							></v-text-field>
						</v-col>
					</v-row>
				</v-form>
			</v-card-text>
			<v-card-actions class="pa-4 pt-0">
				<v-spacer></v-spacer>
				<v-btn color="error" variant="text" @click="close">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn color="primary" variant="tonal" @click="submit" :loading="loading">
					{{ __("Create") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from "vue";
import itemService from "../../../services/itemService";

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},
	itemsGroup: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(["update:modelValue", "item-created"]);

const loading = ref(false);
const formRef = ref(null);
const uomList = ref([]);

const form = reactive({
	item_code: "",
	item_name: "",
	item_group: "",
	stock_uom: "Nos",
	standard_rate: 0,
});

const resetForm = () => {
	form.item_code = "";
	form.item_name = "";
	// Auto-select a sensible item group
	form.item_group =
		props.itemsGroup.length > 1 && props.itemsGroup[1] !== "ALL"
			? props.itemsGroup[1]
			: props.itemsGroup[0] !== "ALL"
				? props.itemsGroup[0]
				: "";
	form.stock_uom = "Nos";
	form.standard_rate = 0;
};

watch(
	() => props.modelValue,
	(val) => {
		if (val) {
			resetForm();
		}
	},
);

const getUOMs = async () => {
	if (uomList.value.length) return;
	try {
		const r = await itemService.getUOMs();
		if (r) {
			uomList.value = r.map((d) => d.name);
		}
	} catch (e) {
		console.error("Failed to fetch UOMs", e);
		// Fallback
		uomList.value = ["Nos", "Kg", "Meter", "Box"];
	}
};

const close = () => {
	emit("update:modelValue", false);
};

const submit = async () => {
	if (!formRef.value) return;

	const { valid } = await formRef.value.validate();
	if (!valid) {
		frappe.msgprint(__("Please fill all required fields"));
		return;
	}

	loading.value = true;
	try {
		const res = await itemService.createItem({
			item_code: form.item_code,
			item_name: form.item_name,
			item_group: form.item_group,
			stock_uom: form.stock_uom,
			standard_rate: form.standard_rate,
		});

		const newItem = res.message || res;
		newItem.actual_qty = 0; // Initialize stock

		frappe.show_alert({
			message: __("Item created successfully"),
			indicator: "green",
		});

		emit("item-created", newItem);
		close();
	} catch (e) {
		console.error(e);
		frappe.msgprint(__("Failed to create item"));
	} finally {
		loading.value = false;
	}
};

onMounted(() => {
	getUOMs();
});
</script>
