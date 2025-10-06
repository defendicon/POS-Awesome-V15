<template>
	<v-row justify="center">
		<v-dialog v-model="dialog" max-width="1000px" persistent>
                       <v-card class="pos-card offline-invoices-card">
				<!-- Enhanced White Header -->
				<v-card-title class="offline-header pa-6">
					<div class="header-content">
						<div class="header-icon-wrapper">
							<v-icon class="header-icon" size="40">mdi-file-document-multiple</v-icon>
						</div>
						<div class="header-text">
							<h3 class="header-title">{{ __("Offline Invoices") }}</h3>
							<p class="header-subtitle">{{ __("Manage your offline transactions") }}</p>
							<div class="header-stats">
								<v-chip
									v-if="invoices.length > 0"
									color="primary"
									variant="flat"
									size="small"
									class="status-chip mr-2"
								>
									<v-icon start size="14">mdi-clock-outline</v-icon>
									{{ invoices.length }} {{ __("Pending") }}
								</v-chip>
								<v-chip
									v-else
									color="success"
									variant="flat"
									size="small"
									class="status-chip"
								>
									<v-icon start size="14">mdi-check-circle</v-icon>
									{{ __("All Synced") }}
								</v-chip>
							</div>
						</div>
					</div>
					<v-spacer></v-spacer>
					<!-- Removed the header-actions div with the Sync All button -->
				</v-card-title>

				<v-divider class="header-divider"></v-divider>

				<v-card-text class="pa-0 white-background">
					<v-container fluid class="pa-6">
						<!-- Enhanced Empty State -->
						<div v-if="!invoices.length" class="empty-state text-center py-12">
							<div class="empty-icon-wrapper mb-4">
								<v-icon size="80" color="success" class="empty-icon"
									>mdi-check-circle-outline</v-icon
								>
							</div>
							<h3 class="text-h5 mb-3 text-grey-darken-2 font-weight-medium">
								{{ __("All Caught Up!") }}
							</h3>
							<p class="text-body-1 text-grey-darken-1 mb-0">
								{{ __("No offline invoices pending synchronization") }}
							</p>
						</div>

						<!-- Enhanced Invoices Table -->
						<div v-else class="table-container">
							<div class="table-header mb-4">
								<h4 class="text-h6 text-grey-darken-2 mb-1">{{ __("Pending Invoices") }}</h4>
								<p class="text-body-2 text-grey">
									{{ __("These invoices will be synced when connection is restored") }}
								</p>
							</div>

							<v-data-table
								:headers="headers"
								:items="invoices"
								class="elevation-0 rounded-lg white-table"
								:items-per-page="15"
								:items-per-page-options="[15, 25, 50]"
							>
								<template #item.customer="{ item }">
									<div class="customer-cell">
										<v-avatar size="32" color="primary" class="mr-3">
											<v-icon size="18" color="white">mdi-account</v-icon>
										</v-avatar>
										<div>
											<div class="font-weight-medium text-grey-darken-2">
												{{ item.invoice.customer_name || item.invoice.customer }}
											</div>
											<div class="text-caption text-grey">{{ __("Customer") }}</div>
										</div>
									</div>
								</template>

								<template #item.posting_date="{ item }">
									<v-chip size="small" color="info" variant="tonal" class="date-chip">
										<v-icon start size="14">mdi-calendar</v-icon>
										{{ item.invoice.posting_date }}
									</v-chip>
								</template>

								<template #item.grand_total="{ item }">
									<div class="amount-cell text-right">
										<div class="text-h6 font-weight-bold text-success">
											{{ currencySymbol(item.invoice.currency) }}
											{{
												formatCurrency(
													item.invoice.grand_total || item.invoice.rounded_total,
												)
											}}
										</div>
										<div class="text-caption text-grey">{{ __("Total Amount") }}</div>
									</div>
								</template>

								<template #item.actions="{ index }">
									<v-btn
										v-if="posProfile.posa_allow_delete_offline_invoice"
										icon
										color="error"
										size="small"
										variant="text"
										@click="removeInvoice(index)"
										class="delete-btn"
									>
										<v-icon size="18">mdi-delete-outline</v-icon>
										<v-tooltip activator="parent" location="top">
											{{ __("Delete Invoice") }}
										</v-tooltip>
									</v-btn>
								</template>
							</v-data-table>
						</div>
					</v-container>
				</v-card-text>

				<!-- Enhanced Footer -->
				<v-divider></v-divider>
				<v-card-actions class="dialog-actions-container">
					<v-btn
						v-if="invoices.length > 0"
						theme="dark"
						variant="elevated"
						prepend-icon="mdi-sync"
						@click="$emit('sync-all')"
						class="pos-action-btn sync-action-btn"
						size="large"
						elevation="2"
					>
						{{ __("Sync All") }}
					</v-btn>
					<v-spacer></v-spacer>
					<v-btn
						color="error"
						variant="flat"
						@click="dialog = false"
						class="pos-action-btn cancel-action-btn"
						size="large"
						elevation="2"
					>
						<v-icon start>mdi-close-circle-outline</v-icon>
						<span>{{ __("Close") }}</span>
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import format from "../format";
import {
	getOfflineInvoices,
	deleteOfflineInvoice,
	getPendingOfflineInvoiceCount,
} from "../../offline/index.js";

export default {
	name: "OfflineInvoicesDialog",
	mixins: [format],
	props: {
		modelValue: Boolean,
		posProfile: {
			type: Object,
			default: () => ({}),
		},
	},
	emits: ["update:modelValue", "deleted", "sync-all"],
	data() {
		return {
			dialog: this.modelValue,
			invoices: [],
			headers: [
				{
					title: this.__("Customer"),
					value: "customer",
					align: "start",
					width: "35%",
				},
				{
					title: this.__("Date"),
					value: "posting_date",
					align: "center",
					width: "20%",
				},
				{
					title: this.__("Amount"),
					value: "grand_total",
					align: "end",
					width: "25%",
				},
				{
					title: this.__("Actions"),
					value: "actions",
					align: "center",
					width: "20%",
					sortable: false,
				},
			],
		};
	},
	watch: {
		modelValue(val) {
			this.dialog = val;
			if (val) {
				this.loadInvoices();
			}
		},
		dialog(val) {
			this.$emit("update:modelValue", val);
		},
	},
	methods: {
		loadInvoices() {
			this.invoices = getOfflineInvoices();
		},
		removeInvoice(index) {
			if (!this.posProfile.posa_allow_delete_offline_invoice) {
				return;
			}
			deleteOfflineInvoice(index);
			this.loadInvoices();
			this.$emit("deleted", getPendingOfflineInvoiceCount());
		},
	},
};
</script>

<style>
/* Uses standardized pos-card class directly in the template */
.offline-invoices-card {
       border-radius: var(--border-radius-xl) !important;
       overflow: hidden;
}

/* Header styling */
.offline-header {
	background: var(--surface-primary);
	color: var(--text-primary);
	border-bottom: 1px solid var(--field-border);
	position: relative;
}

.offline-header::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 4px;
	background: linear-gradient(90deg, var(--primary-start) 0%, var(--primary-end) 100%);
}

/* Layout styles */
.header-content {
	display: flex;
	align-items: center;
	gap: var(--dynamic-md);
}

.header-icon-wrapper {
	background: linear-gradient(135deg, var(--primary-start) 0%, var(--primary-end) 100%);
	border-radius: var(--border-radius-md);
	padding: var(--dynamic-md);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: var(--shadow-md);
}

.header-icon {
	color: white;
}

.header-text {
	flex: 1;
}

.header-title {
	margin: 0 0 var(--dynamic-xs) 0;
	font-weight: 700;
	color: var(--text-primary);
	font-size: 1.5rem;
}

.header-subtitle {
	margin: 0 0 var(--dynamic-sm) 0;
	font-size: 14px;
	color: var(--text-secondary);
	font-weight: 400;
}

.header-stats {
	display: flex;
	gap: var(--dynamic-xs);
}

.status-chip {
	font-weight: 600;
	border-radius: var(--border-radius-md);
}

.header-actions {
	display: flex;
	gap: var(--dynamic-sm);
}

.sync-btn {
	border-radius: var(--border-radius-md);
}

.header-divider {
	border-color: var(--field-border);
}

/* Content containers */
.white-background {
	background: var(--surface-primary);
}

.empty-state {
	padding: var(--dynamic-xl) var(--dynamic-md);
	background: var(--surface-primary);
}

.empty-icon-wrapper {
	display: inline-block;
	padding: 20px;
	background: rgba(76, 175, 80, 0.1);
	border-radius: 50%;
}

.empty-icon {
	filter: drop-shadow(0 2px 8px rgba(76, 175, 80, 0.3));
}

.table-container {
	background: var(--surface-primary);
}

.table-header {
	padding: 0 var(--dynamic-xs);
	color: var(--text-secondary);
}

.white-table {
	background: var(--surface-primary);
	border: 1px solid var(--field-border);
	border-radius: var(--border-radius-lg);
	overflow: hidden;
}

.white-table :deep(th),
.white-table :deep(td) {
	border-bottom: 1px solid var(--field-border);
}

:deep(.v-data-table-header) {
	background: var(--table-header-bg);
	border-bottom: 2px solid var(--field-border);
}

:deep(.v-data-table-header th) {
	font-weight: 600;
	color: var(--table-header-text);
	font-size: 0.875rem;
	padding: var(--dynamic-md);
}

:deep(.v-data-table__tr) {
	border-bottom: 1px solid var(--field-border);
}

:deep(.v-data-table__tr:hover) {
	background-color: var(--table-row-hover);
}

:deep(.v-data-table__td) {
	padding: var(--dynamic-md);
	border-bottom: 1px solid var(--field-border);
}

/* Enhanced Cell Styling */
.customer-cell {
	display: flex;
	align-items: center;
}

.amount-cell {
	font-family: "Roboto Mono", monospace;
}

.date-chip {
	border-radius: var(--border-radius-sm);
	font-weight: 500;
}

.delete-btn {
	border-radius: var(--border-radius-sm);
	transition: all 0.2s ease;
}

.delete-btn:hover {
	background-color: rgba(244, 67, 54, 0.08);
	transform: scale(1.05);
}

.close-btn {
	border-radius: var(--border-radius-sm);
	text-transform: none;
	font-weight: 500;
	padding: var(--dynamic-sm) var(--dynamic-lg);
}

/* Responsive Design */
@media (max-width: 768px) {
	.offline-header {
		padding: var(--dynamic-md) !important;
	}

	.header-content {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--dynamic-md);
	}

	.header-actions {
		width: 100%;
		justify-content: flex-end;
	}

	.table-container {
		overflow-x: auto;
	}
}

/* Action Buttons */
.dialog-actions-container {
	background: linear-gradient(135deg, var(--dialog-bg-start) 0%, var(--dialog-bg-end) 100%) !important;
	border-top: 1px solid var(--dialog-border) !important;
	padding: var(--dynamic-md) var(--dynamic-lg) !important;
	gap: var(--dynamic-sm) !important;
}

.pos-action-btn {
	border-radius: var(--border-radius-md) !important;
	text-transform: none !important;
	font-weight: 600 !important;
	padding: var(--dynamic-md) var(--dynamic-xl) !important;
	min-width: 120px !important;
	transition: all 0.3s ease !important;
	color: var(--text-primary) !important;
}

.pos-action-btn .v-icon,
.pos-action-btn span {
	color: var(--text-primary) !important;
}

.cancel-action-btn {
	background: linear-gradient(135deg, var(--cancel-start) 0%, var(--cancel-end) 100%) !important;
}

.sync-action-btn {
	background: linear-gradient(135deg, var(--primary-start) 0%, var(--primary-end) 100%) !important;
}

.cancel-action-btn:hover,
.sync-action-btn:hover {
	transform: translateY(-2px) !important;
}

.cancel-action-btn:hover {
	box-shadow: 0 6px 20px rgba(211, 47, 47, 0.4) !important;
}

.sync-action-btn:hover {
	box-shadow: 0 6px 20px rgba(25, 118, 210, 0.4) !important;
}

.pos-action-btn:disabled {
	opacity: 0.6 !important;
	transform: none !important;
	box-shadow: none !important;
}

.pos-action-btn:disabled .v-icon,
.pos-action-btn:disabled span {
	color: var(--text-primary) !important;
}
</style>
