<template>
	<div v-if="cashier" class="mb-3" data-test="cashier-handover-summary">
		<strong>{{ __("Outgoing cashier") }}: {{ cashier }}</strong>
		<p>
			{{
				__(
					"Offline sales on this device for the current opening shift. This is not a cash drawer closing balance.",
				)
			}}
		</p>
		<div v-if="error" role="alert">{{ error }}</div>
		<div v-for="row in summary" :key="row.currency">
			{{ row.currency }} · {{ __("Sales") }}: {{ money(row.sales, row.currency) }} ·
			{{ __("Cash net of change") }}: {{ money(row.cash, row.currency) }} ·
			{{ __("Pending invoices") }}: {{ row.pending }}
		</div>
		<p>
			{{
				__(
					"Each cashier keeps a separate saved cart. Complete or cancel an exchange before changing cashier.",
				)
			}}
		</p>
	</div>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { getCashierHandoverSummary } from "../../../../offline/cashierHandover";
const props = defineProps<{ cashier: string; profile: any; opening: string; active: boolean }>();
const summary = ref<Awaited<ReturnType<typeof getCashierHandoverSummary>>>([]);
const error = ref("");
const __ = (window as any).__ || ((value: string) => value);
function money(value: number, currency: string) {
	try {
		return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
	} catch {
		return value.toLocaleString();
	}
}
let version = 0;
watch(
	() => [props.cashier, props.profile?.name, props.opening, props.active],
	async () => {
		const run = ++version;
		if (!props.active || !props.cashier || !props.opening) return;
		try {
			const rows = await getCashierHandoverSummary(
				{
					cashier: props.cashier,
					profile: props.profile.name,
					company: props.profile.company,
					opening: props.opening,
				},
				props.profile,
			);
			if (run === version) {
				summary.value = rows;
				error.value = "";
			}
		} catch (err: any) {
			if (run === version) error.value = err?.message || "Unable to read handover summary.";
		}
	},
	{ immediate: true },
);
</script>
