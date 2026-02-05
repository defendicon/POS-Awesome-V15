<template>
	<v-dialog
		:model-value="modelValue"
		max-width="330"
		transition="dialog-bottom-transition"
		@update:model-value="$emit('update:modelValue', $event)"
	>
		<v-card>
			<v-card-title class="text-h5">
				<span class="text-h5 text-primary">{{ __("Cancel Sale ?") }}</span>
			</v-card-title>
			<v-card-text>
				This would cancel and delete the current sale. To save it as Draft, click the "Save and Clear"
				instead.
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn ref="confirmBtn" color="error" autofocus @click="onConfirm">
					{{ __("Yes, Cancel sale") }}
				</v-btn>
				<v-btn color="warning" @click="$emit('update:modelValue', false)">{{ __("Back") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";

defineOptions({
	name: "CancelSaleDialog",
});

const props = defineProps({
	modelValue: Boolean,
});

const emit = defineEmits(["update:modelValue", "confirm"]);
const confirmBtn = ref(null);
const __ = window.__ || ((text) => text);

function onConfirm() {
	emit("confirm");
}

watch(
	() => props.modelValue,
	(val) => {
		if (val) {
			nextTick(() => {
				setTimeout(() => {
					confirmBtn.value?.$el?.focus();
				}, 100);
			});
		}
	},
);
</script>
