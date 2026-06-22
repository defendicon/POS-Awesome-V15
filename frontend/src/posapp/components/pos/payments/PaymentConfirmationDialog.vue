<template>
	<v-dialog v-model="dialog" max-width="400" transition="dialog-bottom-transition" :retain-focus="false">
		<v-card>
			<v-card-title class="text-h6">
				{{ __("Open Payments?") }}
			</v-card-title>
			<v-card-text>
				<p class="mb-4">
					{{ __("Payments are not open. Enter the received amount and press Enter to submit.") }}
				</p>
				<v-text-field
					ref="amountField"
					v-model="amountInput"
					:label="__('Received Amount')"
					:prefix="currencySymbol"
					:error-messages="amountError"
					type="number"
					inputmode="decimal"
					min="0"
					step="any"
					variant="outlined"
					density="comfortable"
					autocomplete="off"
					@focus="selectAmount"
					@keydown.enter.prevent="onConfirm"
				/>
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="error" variant="text" @click="onCancel">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn color="primary" variant="text" @click="onConfirm">
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
	amount?: number;
	currencySymbol?: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: boolean];
	confirm: [amount: number];
	cancel: [];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

const amountField = ref<any>(null);
const amountInput = ref("0");
const amountError = ref("");

const resetAmount = () => {
	const amount = Math.abs(Number(props.amount) || 0);
	amountInput.value = String(amount);
	amountError.value = "";
};

const selectAmount = (event: FocusEvent) => {
	(event.target as HTMLInputElement | null)?.select?.();
};

const focus = () => {
	nextTick(() => {
		const focusInput = () => {
			const input = amountField.value?.$el?.querySelector?.("input") as HTMLInputElement | undefined;
			if (!input || document.activeElement === input) {
				return;
			}
			input?.focus();
			input?.select();
		};

		focusInput();
		setTimeout(focusInput, 100);
	});
};

watch(dialog, (val) => {
	if (val) {
		resetAmount();
		focus();
	}
});

defineExpose({ focus });

const onCancel = () => {
	emit("cancel");
};

const onConfirm = () => {
	if (String(amountInput.value).trim() === "") {
		amountError.value = __("Enter a valid amount");
		focus();
		return;
	}
	const amount = Number(amountInput.value);
	if (!Number.isFinite(amount) || amount < 0) {
		amountError.value = __("Enter a valid amount");
		focus();
		return;
	}
	amountError.value = "";
	emit("confirm", amount);
};
</script>
