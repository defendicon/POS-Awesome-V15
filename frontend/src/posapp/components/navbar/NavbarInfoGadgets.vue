<template>
	<div class="info-gadgets-container">
		<v-menu
			v-model="menu"
			:close-on-content-click="false"
			location="bottom end"
			offset="10"
			eager
		>
			<template v-slot:activator="{ props }">
				<v-btn
					v-bind="props"
					class="pos-themed-button info-gadgets-btn pos-touch-target pos-focus-ring"
					:aria-label="__('System Information')"
				>
					<v-icon class="pos-text-primary">mdi-information-outline</v-icon>
					<span class="info-gadgets-btn__label">{{ __("Health") }}</span>
				</v-btn>
			</template>

			<v-card class="pos-themed-card info-gadgets-menu">
				<div class="info-gadgets-menu__header">
					<div>
						<div class="info-gadgets-menu__title">{{ __("System Health") }}</div>
						<div class="info-gadgets-menu__subtitle">
							{{ __("Open detailed cache, database, and server diagnostics only when needed.") }}
						</div>
					</div>
				</div>
				<v-divider></v-divider>
				<div class="info-gadgets-menu__body">
					<section class="diagnostic-section">
						<div class="diagnostic-section__title">{{ __("Cache") }}</div>
						<slot name="cache-usage-meter"></slot>
					</section>

					<section class="diagnostic-section">
						<div class="diagnostic-section__title">{{ __("Database") }}</div>
						<slot name="db-usage-gadget"></slot>
					</section>

					<section class="diagnostic-section">
						<div class="diagnostic-section__title">{{ __("Server") }}</div>
						<slot name="cpu-gadget"></slot>
					</section>
				</div>
			</v-card>
		</v-menu>
	</div>
</template>

<script setup>
import { ref } from "vue";

defineOptions({
	name: "NavbarInfoGadgets",
});

const __ = window.__ || ((text) => text);
const menu = ref(false);
</script>

<style scoped>
.info-gadgets-container {
	display: flex;
	align-items: center;
}

.info-gadgets-btn {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 0 14px !important;
	background: rgba(25, 118, 210, 0.08) !important;
	border: 1px solid rgba(25, 118, 210, 0.12);
	border-radius: 999px;
	backdrop-filter: blur(8px);
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.info-gadgets-btn__label {
	color: #1976d2;
	font-size: 0.875rem;
	font-weight: 600;
	letter-spacing: 0.01em;
}

.info-gadgets-btn:hover {
	transform: translateY(-1px);
	background: rgba(25, 118, 210, 0.12) !important;
	border-color: rgba(25, 118, 210, 0.2);
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.15);
}

.info-gadgets-btn .pos-text-primary {
	color: #1976d2 !important;
}

.info-gadgets-menu {
	width: min(440px, calc(100vw - 24px));
	max-width: min(440px, calc(100vw - 24px));
	max-height: min(80vh, 760px);
	overflow: hidden;
}

.info-gadgets-menu__header {
	padding: 16px 18px 14px;
}

.info-gadgets-menu__title {
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.info-gadgets-menu__subtitle {
	margin-top: 4px;
	font-size: 0.82rem;
	line-height: 1.4;
	color: var(--pos-text-secondary);
}

.info-gadgets-menu__body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	overflow-y: auto;
}

.diagnostic-section {
	padding: 14px;
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-md);
	background: var(--pos-surface-raised);
}

.diagnostic-section__title {
	margin-bottom: 10px;
	font-size: 0.82rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.diagnostic-section :deep(> *) {
	width: 100%;
}

@media (max-width: 1100px) {
	.info-gadgets-btn__label {
		display: none;
	}

	.info-gadgets-btn {
		padding: 0 !important;
		border-radius: 12px;
	}
}
</style>
