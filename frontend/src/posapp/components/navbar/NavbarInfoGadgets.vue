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
					icon
					v-bind="props"
					class="pos-themed-button info-gadgets-btn"
					:aria-label="__('System Information')"
				>
					<v-icon class="pos-text-primary">mdi-information-outline</v-icon>
				</v-btn>
			</template>

			<v-card class="pos-themed-card info-gadgets-menu" min-width="300">
				<v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">
					{{ __("System Status") }}
				</v-card-title>
				<v-divider></v-divider>
				<v-list class="pa-0 bg-transparent">
					<!-- Cache Usage -->
					<v-list-item class="gadget-item py-2">
						<slot name="cache-usage-meter"></slot>
					</v-list-item>
					<v-divider></v-divider>

					<!-- DB Usage -->
					<v-list-item class="gadget-item py-2">
						<slot name="db-usage-gadget"></slot>
					</v-list-item>
					<v-divider></v-divider>

					<!-- CPU Usage -->
					<v-list-item class="gadget-item py-2">
						<slot name="cpu-gadget"></slot>
					</v-list-item>
				</v-list>
			</v-card>
		</v-menu>
	</div>
</template>

<script>
export default {
	name: "NavbarInfoGadgets",
	data() {
		return {
			menu: false,
		};
	},
};
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
