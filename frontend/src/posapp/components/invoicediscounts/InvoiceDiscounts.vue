<template>
	<div class="invoice-discounts-page">
		<v-container fluid class="pa-0 h-100">
			<v-card class="h-100 pos-themed-card" flat>
				<v-card-title class="d-flex align-center py-2 px-4 border-bottom">
					<span class="text-h6 font-weight-bold">Invoice Discounts</span>
				</v-card-title>
				<v-card-text class="pa-4 h-100 overflow-y-auto">
					<div class="d-flex justify-center align-center h-100 text-medium-emphasis">
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
export default {
	name: "InvoiceDiscounts",
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
