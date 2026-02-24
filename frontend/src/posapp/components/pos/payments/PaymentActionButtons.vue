<template>
	<v-card flat class="cards mb-0 mt-3 pa-0">
		<v-row align="start" no-gutters>
			<v-col cols="12" sm="6">
				<v-btn
					ref="submitButton"
					block
					size="large"
					color="primary"
					theme="dark"
					class="submit-btn"
					@click="$emit('submit')"
					:loading="loading"
					:disabled="loading || validatePayment"
					:class="{ 'submit-highlight': highlightSubmit }"
				>
					{{ __("Submit") }}
				</v-btn>
			</v-col>
			<v-col cols="12" sm="6" class="payment-action-col">
				<v-btn
					block
					size="large"
					color="success"
					theme="dark"
					@click="$emit('submit-and-print')"
					:loading="loading"
					:disabled="loading || validatePayment"
				>
					{{ __("Submit & Print") }}
				</v-btn>
			</v-col>
			<v-col cols="12">
				<v-btn
					block
					class="mt-2 pa-1"
					size="large"
					color="error"
					theme="dark"
					@click="$emit('cancel')"
				>
					{{ __("Cancel Payment") }}
				</v-btn>
			</v-col>
		</v-row>
	</v-card>
</template>

<script setup>
defineProps({
	loading: Boolean,
	validatePayment: Boolean,
	highlightSubmit: Boolean,
});

defineEmits(["submit", "submit-and-print", "cancel"]);

const __ = window.__;
</script>

<style scoped>
.payment-action-col {
	padding-inline-start: 4px;
}

@media (max-width: 600px) {
	.payment-action-col {
		padding-inline-start: 0;
		padding-top: 6px;
	}
}
</style>
