<template>
	<v-dialog
		v-model="dialog"
		max-width="400"
		transition="dialog-bottom-transition"
		:retain-focus="false"
	>
		<v-card>
			<v-card-title class="text-h6">
				{{ __("Open Payments?") }}
			</v-card-title>
			<v-card-text>
				{{ __("Payments are not open. Do you want to open payments and submit?") }}
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="error" variant="text" @click="onCancel">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn ref="confirmPaymentBtn" color="primary" variant="text" @click="onConfirm">
					{{ __("Yes") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

// @ts-ignore
const __ = window.__ || ((s: string) => s);

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: boolean];
	confirm: [];
	cancel: [];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

const confirmPaymentBtn = ref<HTMLElement | null>(null);

const focus = () => {
	nextTick(() => {
		setTimeout(() => {
			// @ts-ignore
			confirmPaymentBtn.value?.$el?.focus();
		}, 100);
	});
};

watch(dialog, (val) => {
	if (val) {
		focus();
	}
});

defineExpose({ focus });

const onCancel = () => {
	emit("cancel");
};

const onConfirm = () => {
	emit("confirm");
};
</script>
