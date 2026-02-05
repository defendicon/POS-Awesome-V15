<template>
	<div class="info-gadgets-container">
		<v-menu v-model="menu" :close-on-content-click="false" location="bottom end" offset="10" eager>
			<template v-slot:activator="{ props }">
				<v-btn
					icon
					v-bind="props"
					class="pos-themed-button info-gadgets-btn"
					:aria-label="__('System Information')"
				>
					<v-icon class="pos-text-primary">mdi-information-outline</v-icon>
				</v-btn>
			</template>

			<v-card class="pos-themed-card info-gadgets-menu" width="auto">
				<v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">
					{{ __("System Status") }}
				</v-card-title>
				<v-divider></v-divider>
				<div class="gadgets-row d-flex flex-row pa-4">
					<!-- Cache Usage (Left) -->
					<div class="gadget-col">
						<slot name="cache-usage-meter"></slot>
					</div>

					<v-divider vertical class="mx-4"></v-divider>

					<!-- DB Usage (Center) -->
					<div class="gadget-col">
						<slot name="db-usage-gadget"></slot>
					</div>

					<v-divider vertical class="mx-4"></v-divider>

					<!-- CPU Usage (Right) -->
					<div class="gadget-col">
						<slot name="cpu-gadget"></slot>
					</div>
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
	min-width: 40px;
	min-height: 40px;
	background: rgba(25, 118, 210, 0.08) !important;
	border: 1px solid rgba(25, 118, 210, 0.12);
	border-radius: 12px;
	backdrop-filter: blur(8px);
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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

.gadget-item {
	min-height: 60px;
}

/* Ensure gadgets take full width inside the menu */
.gadget-item :deep(> *) {
	width: 100%;
	justify-content: space-between;
}
</style>
