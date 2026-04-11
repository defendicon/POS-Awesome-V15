<template>
	<v-dialog
		v-model="dialog"
		max-width="420"
		transition="dialog-bottom-transition"
		:retain-focus="false"
	>
		<v-card class="pos-themed-card">
			<v-card-title class="text-h6">
				{{ __("Update Price List Rate") }}
			</v-card-title>
			<v-card-text>
				<div v-if="itemLabel" class="text-body-2 mb-3">
					{{ __("Item") }}: <strong>{{ itemLabel }}</strong>
				</div>
				<v-text-field
					ref="rateInputRef"
					v-model="rateInput"
					variant="outlined"
					density="compact"
					type="text"
					inputmode="decimal"
					:prefix="currencyPrefix"
					:label="__('New rate')"
					@keydown.enter.prevent="handleSubmit"
				/>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn color="error" variant="text" @click="handleCancel">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn color="primary" variant="text" @click="handleSubmit">
					{{ __("Apply") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

// @ts-ignore
const __ = window.__ || ((text: string) => text);

const props = defineProps<{
	modelValue: boolean;
	initialRate?: string | number | null;
	itemLabel?: string;
	currencySymbol?: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: boolean];
	submit: [value: string];
	cancel: [];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

const rateInput = ref("");
const rateInputRef = ref<any>(null);

const currencyPrefix = computed(() => {
	return props.currencySymbol ? `${props.currencySymbol} ` : "";
});

watch(
	() => dialog.value,
	(isOpen) => {
		if (!isOpen) return;
		rateInput.value = props.initialRate != null ? String(props.initialRate) : "";
		nextTick(() => {
			setTimeout(() => {
				const inputEl =
					rateInputRef.value?.$el?.querySelector?.("input") || null;
				inputEl?.focus?.();
				inputEl?.select?.();
			}, 60);
		});
	},
	{ immediate: true },
);

const handleCancel = () => {
	emit("cancel");
	emit("update:modelValue", false);
};

const handleSubmit = () => {
	emit("submit", String(rateInput.value ?? "").trim());
	emit("update:modelValue", false);
};
</script>

