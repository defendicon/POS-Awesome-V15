<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div class="pay-action-buttons">
		<v-row class="pay-action-row">
			<v-col cols="12" sm="6" class="pr-sm-1">
				<v-btn
					block
					size="large"
					color="primary"
					theme="dark"
					@click="$emit('submit')"
					:disabled="disabled || loading"
					:loading="loading"
				>
					{{ __("Submit") }}
				</v-btn>
			</v-col>
			<v-col cols="12" sm="6" class="pl-sm-1 mt-2 mt-sm-0">
				<v-btn
					block
					size="large"
					color="success"
					theme="dark"
					@click="$emit('submit-and-print')"
					:disabled="disabled || loading"
					:loading="loading"
				>
					{{ __("Submit & Print") }}
				</v-btn>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
defineProps({
	loading: Boolean,
	disabled: Boolean,
});

defineEmits(["submit", "submit-and-print"]);
</script>

<style scoped>
.pay-action-buttons {
	width: 100%;
	padding: 0 4px 4px;
}

.pay-action-row {
	margin: 0;
}
</style>
