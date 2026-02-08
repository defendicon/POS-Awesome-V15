<template>
	<v-row align="center" class="items px-3 py-2 mt-0" v-if="pos_profile.posa_use_delivery_charges">
		<v-col cols="12" sm="8" class="pb-0 mb-0 pr-0 pt-0">
			<v-autocomplete
				ref="deliveryChargesInput"
				density="compact"
				clearable
				auto-select-first
				variant="solo"
				color="primary"
				:label="deliveryChargesLabel"
				v-model="internal_selected_delivery_charge"
				:items="delivery_charges"
				item-title="name"
				item-value="name"
				return-object
				class="pos-themed-input sleek-field"
				:no-data-text="__('Charges not found')"
				hide-details
				:customFilter="deliveryChargesFilter"
				:disabled="readonly"
				@update:model-value="onUpdate"
			>
				<template v-slot:item="{ props, item }">
					<v-list-item v-bind="props">
						<v-list-item-title
							class="text-primary text-subtitle-1"
							v-html="item.raw.name"
						></v-list-item-title>
						<v-list-item-subtitle v-html="`Rate: ${item.raw.rate}`"></v-list-item-subtitle>
					</v-list-item>
				</template>
			</v-autocomplete>
		</v-col>
		<v-col cols="12" sm="4" class="pb-0 mb-0 pt-0">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="rateLabel"
				class="pos-themed-input sleek-field"
				hide-details
				:model-value="formatCurrency(delivery_charges_rate)"
				:prefix="currencySymbol()"
				disabled
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { POSProfile, DeliveryCharge } from "../../../types/models";

interface Props {
	pos_profile: POSProfile | any;
	delivery_charges?: DeliveryCharge[] | any[];
	selected_delivery_charge?: DeliveryCharge | string | null;
	delivery_charges_rate?: number;
	deliveryChargesFilter?: (_val: any, _query: string, _item: any) => boolean;
	formatCurrency: (_val: number | undefined) => string;
	currencySymbol: () => string;
	readonly?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	"update:selected_delivery_charge": [val: any];
}>();

const __ = (str: string) => (window.__ ? window.__(str) : str);

const internal_selected_delivery_charge = ref(props.selected_delivery_charge);
const deliveryChargesInput = ref<any>(null);

const deliveryChargesLabel = computed(() => frappe._("Delivery Charges"));
const rateLabel = computed(() => frappe._("Delivery Charges Rate"));

watch(
	() => props.selected_delivery_charge,
	(val) => {
		internal_selected_delivery_charge.value = val;
	},
);

const onUpdate = (val: any) => {
	emit("update:selected_delivery_charge", val);
};

const focusDeliveryCharges = () => {
	const el = deliveryChargesInput.value?.$el || deliveryChargesInput.value;
	const input = el?.querySelector("input");
	if (input) {
		input.focus();
		input.select?.();
	}
};

defineExpose({
	focusDeliveryCharges,
});
</script>

<style scoped></style>
