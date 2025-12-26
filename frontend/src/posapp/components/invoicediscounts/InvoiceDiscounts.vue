<template>
	<div class="invoice-discounts-page">
		<v-container fluid class="pa-0 h-100">
			<v-card class="h-100 pos-themed-card" flat>
				<v-card-title class="d-flex align-center py-2 px-4 border-bottom">
					<span class="text-h6 font-weight-bold">Invoice Discounts</span>
				</v-card-title>
				<v-card-text class="pa-4 h-100 overflow-y-auto">
					<div class="mb-4" style="max-width: 600px; margin: 0 auto">
						<Customer :pos_profile="posProfile" />
					</div>

					<div class="d-flex justify-center align-center text-medium-emphasis" style="height: 60%">
						<div class="text-center">
							<v-icon size="64" color="primary" class="mb-4">mdi-ticket-percent</v-icon>
							<div class="text-h5">Coming Soon</div>
							<div class="text-body-1 mt-2">Invoice discount management will be available here.</div>
						</div>
					</div>
				</v-card-text>
			</v-card>
		</v-container>
	</div>
</template>

<script>
import Customer from "../pos/Customer.vue";

export default {
	name: "InvoiceDiscounts",
	components: {
		Customer,
	},
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
	},
};
</script>

<style scoped>
.invoice-discounts-page {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.border-bottom {
	border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

:deep([data-theme="dark"]) .border-bottom {
	border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
