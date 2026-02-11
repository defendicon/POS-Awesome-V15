<template>
	<v-card class="pa-4 pos-themed-card">
		<div class="text-h6 mb-1">{{ __("Cash Movement") }}</div>
		<div class="text-body-2 text-grey mb-4">
			{{ __("Book expense or deposit from active shift.") }}
		</div>

		<v-alert
			v-if="enabled && !allowExpense && !allowDeposit"
			type="warning"
			variant="tonal"
			density="compact"
			class="mb-3"
		>
			{{ __("No cash movement type is allowed for this POS Profile.") }}
		</v-alert>

		<v-row dense>
			<v-col cols="12" md="4">
				<v-select
					v-model="movementType"
					:items="movementTypes"
					variant="outlined"
					density="compact"
					:label="__('Movement Type')"
					:disabled="submitting || !enabled || movementTypes.length === 0"
				/>
			</v-col>
			<v-col cols="12" md="4">
				<v-text-field
					v-model.number="amount"
					type="number"
					min="0"
					step="0.01"
					variant="outlined"
					density="compact"
					:label="__('Amount')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" md="4" v-if="movementType === 'Expense'">
				<v-text-field
					v-model="expenseAccount"
					variant="outlined"
					density="compact"
					:label="__('Expense Account (Optional Override)')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" md="4" v-if="movementType === 'Deposit'">
				<v-text-field
					v-model="targetAccount"
					variant="outlined"
					density="compact"
					:label="__('Back Office Cash Account (Optional Override)')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12">
				<v-textarea
					v-model="remarks"
					variant="outlined"
					density="compact"
					rows="2"
					auto-grow
					:label="__('Remarks')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" class="d-flex ga-2">
				<v-btn
					color="primary"
					:disabled="submitting || !enabled || !allowExpense || movementType !== 'Expense'"
					:loading="submitting && movementType === 'Expense'"
					@click="onSubmit('Expense')"
				>
					{{ __("Submit Expense") }}
				</v-btn>
				<v-btn
					color="secondary"
					:disabled="submitting || !enabled || !allowDeposit || movementType !== 'Deposit'"
					:loading="submitting && movementType === 'Deposit'"
					@click="onSubmit('Deposit')"
				>
					{{ __("Submit Deposit") }}
				</v-btn>
			</v-col>
		</v-row>
	</v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

type MovementType = "Expense" | "Deposit";

const __ = window.__ || ((text: string, _args?: any[]) => text);

const props = defineProps<{
	context: any;
	submitting: boolean;
}>();

const emit = defineEmits<{
	(e: "submit", payload: any): void;
}>();

const movementType = ref<MovementType | null>("Expense");
const amount = ref<number>(0);
const remarks = ref<string>("");
const expenseAccount = ref<string>("");
const targetAccount = ref<string>("");

const enabled = computed(() => !!props.context?.enable_cash_movement);
const allowExpense = computed(() => !!props.context?.allow_pos_expense);
const allowDeposit = computed(() => !!props.context?.allow_cash_deposit);
const movementTypes = computed(() => {
	const types: Array<{ title: string; value: MovementType }> = [];
	if (allowExpense.value) {
		types.push({ title: __("Expense"), value: "Expense" });
	}
	if (allowDeposit.value) {
		types.push({ title: __("Deposit"), value: "Deposit" });
	}
	return types;
});

watch(
	() => props.context,
	(newContext) => {
		if (!newContext) return;
		expenseAccount.value = newContext.default_expense_account || "";
		targetAccount.value = newContext.back_office_cash_account || "";
	},
	{ immediate: true, deep: true },
);

watch(
	movementTypes,
	(types) => {
		const selectedIsAllowed = types.some((type) => type.value === movementType.value);
		if (!selectedIsAllowed && types.length) {
			const firstType = types[0];
			movementType.value = firstType ? firstType.value : null;
		}
	},
	{ immediate: true },
);

function onSubmit(type: MovementType) {
	emit("submit", {
		movementType: type,
		amount: amount.value,
		remarks: remarks.value,
		expenseAccount: expenseAccount.value,
		targetAccount: targetAccount.value,
	});
}
</script>
