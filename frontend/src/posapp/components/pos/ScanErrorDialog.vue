<template>
	<v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent max-width="420" content-class="scan-error-dialog">
		<v-card>
			<v-card-title class="d-flex align-center text-error text-h6">
				<v-icon color="error" class="mr-2">mdi-alert-octagon</v-icon>
				{{ __("Scan Error") }}
			</v-card-title>
			<v-divider></v-divider>
			<v-card-text>
				<p class="scan-error-message">{{ message }}</p>
				<p v-if="code" class="scan-error-code mt-2 mb-0">
					<strong>{{ __("Scanned Code:") }}</strong>
					<span>{{ code }}</span>
				</p>
				<p v-if="details" class="scan-error-details mt-4 mb-0">
					{{ details }}
				</p>
			</v-card-text>
			<v-card-actions class="justify-end">
				<v-btn color="primary" variant="tonal" autofocus @click="$emit('acknowledge')">
					{{ __("OK") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
export default {
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
		message: {
			type: String,
			default: "",
		},
		code: {
			type: String,
			default: "",
		},
		details: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue", "acknowledge"],
};
</script>

<style scoped>
.scan-error-message {
	font-size: 1.1rem;
	font-weight: 500;
}

.scan-error-code {
	padding: 8px 12px;
	background: var(--v-theme-surface-variant);
	border-radius: 4px;
	font-family: monospace;
}

.scan-error-code span {
	margin-left: 8px;
	color: var(--v-theme-primary);
	font-weight: 600;
}

.scan-error-details {
	color: var(--v-theme-on-surface-variant);
	font-size: 0.9rem;
}
</style>
