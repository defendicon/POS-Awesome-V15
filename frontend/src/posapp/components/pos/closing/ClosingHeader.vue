<template>
	<v-card-title class="closing-header pa-6 d-flex align-center">
		<div class="header-content">
			<div class="header-icon-wrapper">
				<v-icon class="header-icon" size="40">mdi-store-clock-outline</v-icon>
			</div>
			<div class="header-text">
				<h3 class="header-title">{{ __("Closing POS Shift") }}</h3>
				<p class="header-subtitle">
					{{ __("Reconcile payment methods and close shift") }}
				</p>
			</div>
		</div>
		<v-spacer></v-spacer>
		<v-btn
			icon="mdi-close"
			variant="text"
			density="comfortable"
			class="header-close-btn"
			:title="__('Close')"
			@click="$emit('close')"
		></v-btn>
	</v-card-title>
	<v-divider class="header-divider"></v-divider>
</template>

<script setup>
import { inject } from "vue";
const __ = window.__ || ((t) => t);
defineEmits(["close"]);
</script>

<style scoped>
.closing-header {
	background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
	border-bottom: 1px solid #e0e0e0;
	padding: 24px !important;
}

.header-content {
	display: flex;
	align-items: center;
	gap: 20px;
	width: 100%;
}

.header-icon-wrapper {
	background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
	padding: 16px;
	border-radius: 16px;
	box-shadow: 0 4px 12px rgba(33, 150, 243, 0.15);
	border: 1px solid rgba(255, 255, 255, 0.6);
}

.header-icon {
	color: #1976d2;
}

.header-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.header-title {
	font-size: 1.5rem;
	font-weight: 700;
	color: #1a237e;
	letter-spacing: -0.5px;
	margin: 0;
	line-height: 1.2;
}

.header-subtitle {
	font-size: 0.875rem;
	font-weight: 500;
	color: #5f6368;
	margin: 0;
	line-height: 1.4;
}

.header-close-btn {
	color: #5f6368 !important;
	margin-left: 12px;
}

.header-close-btn:hover {
	background-color: rgba(0, 0, 0, 0.04);
	color: #202124 !important;
}

.header-divider {
	border-color: rgba(0, 0, 0, 0.06);
}
</style>
