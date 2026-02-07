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
const __ = window.__ || ((t) => t);
defineEmits(["close"]);
</script>

<style scoped>
.closing-header {
	border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	padding: 24px !important;
}

.header-content {
	display: flex;
	align-items: center;
	gap: 20px;
	width: 100%;
}

.header-icon-wrapper {
	background: rgba(var(--v-theme-primary), 0.1);
	padding: 16px;
	border-radius: 16px;
}

.header-icon {
	color: rgb(var(--v-theme-primary));
}

.header-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.header-title {
	font-size: 1.5rem;
	font-weight: 700;
	letter-spacing: -0.5px;
	margin: 0;
	line-height: 1.2;
}

.header-subtitle {
	font-size: 0.875rem;
	font-weight: 500;
	margin: 0;
	line-height: 1.4;
	opacity: 0.7;
}

.header-close-btn {
	opacity: 0.7;
	margin-left: 12px;
}

.header-close-btn:hover {
	background-color: rgba(var(--v-theme-on-surface), 0.04);
	opacity: 1;
}

.header-divider {
	border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
