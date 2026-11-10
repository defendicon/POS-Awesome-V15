<template>
	<v-alert
		v-if="candidates.length || warning"
		type="info"
		variant="tonal"
		data-test="restart-cart-recovery"
	>
		<strong>{{ __("Saved carts from a previous session") }}</strong>
		<div>
			{{
				__(
					"Recover a cart only after checking its customer and saved time. Your current sale must be empty.",
				)
			}}
		</div>
		<div v-if="warning">{{ warning }}</div>
		<div
			v-for="candidate in candidates"
			:key="candidate.key"
			class="d-flex flex-wrap align-center ga-2 mt-2"
		>
			<span>{{ candidate.snapshot.invoice.customer_name || candidate.snapshot.invoice.customer }}</span>
			<span>{{ new Date(candidate.snapshot.saved_at).toLocaleString() }}</span>
			<span>{{ candidate.snapshot.invoice.items.length }} {{ __("items") }}</span>
			<span v-if="candidate.snapshot.invoice.grand_total != null"
				>{{ candidate.snapshot.invoice.currency }} {{ candidate.snapshot.invoice.grand_total }}</span
			>
			<v-btn :disabled="busy || hasItems" size="small" @click="$emit('recover', candidate.key)">{{
				__("Recover cart")
			}}</v-btn>
		</div>
		<v-btn variant="text" size="small" :disabled="busy" @click="$emit('refresh')">{{
			__("Refresh saved carts")
		}}</v-btn>
	</v-alert>
</template>

<script setup lang="ts">
import type { RestartCartCandidate } from "../../../utils/cartRecovery";
defineProps<{ candidates: RestartCartCandidate[]; warning: string; busy: boolean; hasItems: boolean }>();
defineEmits<{ (event: "recover", key: string): void; (event: "refresh"): void }>();
const __ = window.__ || ((text: string) => text);
</script>
