<template>
	<v-dialog
		:model-value="modelValue"
		@update:model-value="$emit('update:modelValue', $event)"
		persistent
		max-width="420"
		content-class="scan-error-dialog"
	>
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

<script setup>
defineOptions({
	name: "ScanErrorDialog",
});

defineProps({
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
});

defineEmits(["update:modelValue", "acknowledge"]);

const __ = window.__ || ((text) => text);
</script>

<style scoped>
.scan-error-message {
	font-size: 1.05rem;
	font-weight: 600;
	margin: 0;
}

.scan-error-code {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--v-theme-surface-variant);
	border-radius: 4px;
	font-family: monospace;
	font-size: 0.95rem;
}

.scan-error-code span {
	margin-left: 8px;
	color: var(--v-theme-primary);
	font-weight: 600;
}

.scan-error-details {
	color: rgba(var(--v-theme-on-surface), 0.72);
	font-size: 0.9rem;
	line-height: 1.4;
	margin-top: 12px;
}

:deep(.scan-error-dialog) {
	border-radius: 16px;
}

:deep(.v-theme--dark) .scan-error-dialog .scan-error-code {
	background-color: rgba(var(--v-theme-error), 0.25);
	color: rgb(var(--v-theme-on-error));
}

:deep(.v-theme--dark) .scan-error-dialog .scan-error-details {
	color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
