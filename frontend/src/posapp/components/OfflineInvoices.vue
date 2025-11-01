<template>
	<v-row justify="center">
		<v-dialog v-model="dialog" max-width="1200px" persistent transition="fade-transition">
			<v-card class="pos-card offline-invoices-card elevation-12">
				<!-- Revamped Modern Header -->
				<v-card-title class="offline-header pa-8">
					<div class="header-content-wrapper">
						<div class="header-main-content">
							<div class="header-icon-wrapper-revamped">
								<div class="icon-background">
									<v-icon class="header-icon-revamped" size="32"
										>mdi-file-document-multiple-outline</v-icon
									>
								</div>
								<div class="icon-glow"></div>
							</div>
							<div class="header-text-revamped">
								<h2 class="header-title-revamped">{{ __("Offline Invoices") }}</h2>
								<p class="header-subtitle-revamped">
									{{ __("Manage and synchronize your offline transactions") }}
								</p>
								<div class="header-stats-revamped">
									<v-chip
										v-if="invoices.length > 0"
										color="warning"
										variant="elevated"
										size="default"
										class="status-chip-revamped pending-chip"
										elevation="2"
									>
										<v-icon start size="16">mdi-clock-outline</v-icon>
										{{ invoices.length }} {{ __("Pending Sync") }}
									</v-chip>
									<v-chip
										v-else
										color="success"
										variant="elevated"
										size="default"
										class="status-chip-revamped synced-chip"
										elevation="2"
									>
										<v-icon start size="16">mdi-check-circle</v-icon>
										{{ __("All Synchronized") }}
									</v-chip>
								</div>
							</div>
						</div>
						<div class="header-close-section">
							<v-btn
								icon="mdi-close"
								variant="text"
								size="large"
								color="error"
								class="header-close-btn"
								@click="dialog = false"
							>
								<v-tooltip activator="parent" location="bottom">
									{{ __("Close Dialog") }}
								</v-tooltip>
							</v-btn>
						</div>
					</div>
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

				<!-- Revamped Modern Footer -->
				<v-divider class="footer-divider"></v-divider>
				<v-card-actions class="dialog-actions-container-revamped">
					<div class="actions-left-section">
						<v-btn
							v-if="invoices.length > 0"
							variant="elevated"
							prepend-icon="mdi-sync"
							@click="$emit('sync-all')"
							class="sync-action-btn-revamped"
							size="large"
							elevation="3"
						>
							{{ __("Sync All Invoices") }}
						</v-btn>
						<div v-else class="sync-status-indicator">
							<v-icon color="success" size="20" class="mr-2">mdi-check-circle</v-icon>
							<span class="text-success font-weight-medium">{{
								__("All invoices are synchronized")
							}}</span>
						</div>
					</div>
					<div class="actions-right-section">
						<v-btn
							variant="outlined"
							color="error"
							@click="dialog = false"
							class="close-action-btn-revamped"
							size="large"
							prepend-icon="mdi-close"
						>
							{{ __("Close") }}
						</v-btn>
					</div>
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
/* ========== REVAMPED OFFLINE INVOICES DIALOG ========== */

/* Main Card Styling */
.offline-invoices-card {
	border-radius: 20px !important;
	overflow: hidden;
	background-color: var(--pos-card-bg) !important;
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
	border: 1px solid var(--pos-border);
}

/* ========== REVAMPED HEADER SECTION ========== */
.offline-header {
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%) !important;
	color: white !important;
	border-bottom: none !important;
	position: relative;
	overflow: hidden;
}

.offline-header::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
	pointer-events: none;
}

.offline-header::after {
	content: "";
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
}

/* Header Content Layout */
.header-content-wrapper {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	position: relative;
	z-index: 2;
}

.header-main-content {
	display: flex;
	align-items: center;
	gap: 24px;
	flex: 1;
}

.header-close-section {
	display: flex;
	align-items: center;
}

/* Revamped Icon Wrapper */
.header-icon-wrapper-revamped {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 80px;
	height: 80px;
}

.icon-background {
	position: relative;
	z-index: 2;
	width: 64px;
	height: 64px;
	background: rgba(255, 255, 255, 0.15);
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-radius: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(10px);
	transition: all 0.3s ease;
}

.icon-glow {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 80px;
	height: 80px;
	background: radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%);
	border-radius: 50%;
	opacity: 0;
	transition: opacity 0.3s ease;
	animation: iconPulse 2s infinite ease-in-out;
}

@keyframes iconPulse {
	0%,
	100% {
		opacity: 0.3;
		transform: translate(-50%, -50%) scale(1);
	}
	50% {
		opacity: 0.6;
		transform: translate(-50%, -50%) scale(1.1);
	}
}

.header-icon-revamped {
	color: white !important;
	filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));
}

.icon-background:hover {
	transform: scale(1.05);
	background: rgba(255, 255, 255, 0.25);
	border-color: rgba(255, 255, 255, 0.5);
}

.icon-background:hover + .icon-glow {
	opacity: 0.8;
}

/* Header Text Styling */
.header-text-revamped {
	flex: 1;
	color: white;
}

.header-title-revamped {
	margin: 0 0 8px 0;
	font-weight: 700;
	color: white !important;
	font-size: 2rem;
	letter-spacing: -0.5px;
	text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-subtitle-revamped {
	margin: 0 0 16px 0;
	font-size: 16px;
	color: rgba(255, 255, 255, 0.9) !important;
	font-weight: 400;
	letter-spacing: 0.2px;
}

.header-stats-revamped {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
}

/* Status Chips */
.status-chip-revamped {
	font-weight: 600 !important;
	border-radius: 12px !important;
	padding: 0 16px !important;
	height: 36px !important;
	backdrop-filter: blur(10px);
	transition: all 0.3s ease;
}

.pending-chip {
	background: linear-gradient(135deg, #ff9800 0%, #ffc107 100%) !important;
	color: white !important;
	box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3) !important;
}

.synced-chip {
	background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%) !important;
	color: white !important;
	box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3) !important;
}

.status-chip-revamped:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2) !important;
}

/* Header Close Button - Neutral with Red Icon */
.header-close-btn {
	width: 48px !important;
	height: 48px !important;
	border-radius: 12px !important;
	background: rgba(255, 255, 255, 0.15) !important;
	border: 1px solid rgba(255, 255, 255, 0.2) !important;
	color: #f44336 !important;
	transition: all 0.3s ease !important;
	backdrop-filter: blur(10px);
}

.header-close-btn:hover {
	background: rgba(244, 67, 54, 0.1) !important;
	border-color: rgba(244, 67, 54, 0.3) !important;
	transform: scale(1.05) !important;
	color: #d32f2f !important;
}

/* Force red color for the close icon */
.header-close-btn .v-icon {
	color: #f44336 !important;
}

.header-close-btn:hover .v-icon {
	color: #d32f2f !important;
}

/* Footer Divider */
.footer-divider {
	border-color: rgba(25, 118, 210, 0.1) !important;
	background: linear-gradient(90deg, transparent 0%, rgba(25, 118, 210, 0.2) 50%, transparent 100%);
	height: 2px;
}

/* Content containers */

.white-background {
	background: var(--pos-card-bg);
}

.empty-state {
	padding: var(--dynamic-xl) var(--dynamic-md);
	background: var(--pos-card-bg);
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
	background: var(--pos-card-bg);
}

.table-header {
	padding: 0 var(--dynamic-xs);
	color: var(--pos-text-secondary);
}

.white-table {
	background: var(--pos-card-bg);
	border: 1px solid var(--pos-border);
	border-radius: var(--border-radius-lg);
	overflow: hidden;
}

.white-table :deep(th),
.white-table :deep(td) {
	border-bottom: 1px solid var(--pos-border);
}

:deep(.v-data-table-header) {
	background: var(--pos-table-header-bg);
	border-bottom: 2px solid var(--pos-border);
}

:deep(.v-data-table-header th) {
	font-weight: 600;
	color: var(--pos-text-primary);
	font-size: 0.875rem;
	padding: var(--dynamic-md);
}

:deep(.v-data-table__tr) {
	border-bottom: 1px solid var(--pos-border);
}

:deep(.v-data-table__tr:hover) {
	background-color: var(--pos-table-row-hover);
}

:deep(.v-data-table__td) {
	padding: var(--dynamic-md);
	border-bottom: 1px solid var(--pos-border);
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

/* ========== RESPONSIVE DESIGN ========== */
@media (max-width: 768px) {
	.offline-invoices-card {
		margin: 16px !important;
		border-radius: 16px !important;
	}

	.offline-header {
		padding: 24px !important;
	}

	.header-main-content {
		gap: 16px;
	}

	.header-icon-wrapper-revamped {
		width: 60px;
		height: 60px;
	}

	.icon-background {
		width: 48px;
		height: 48px;
	}

	.header-title-revamped {
		font-size: 1.5rem;
	}

	.header-subtitle-revamped {
		font-size: 14px;
	}

	.dialog-actions-container-revamped {
		flex-direction: column-reverse;
		gap: 16px !important;
		padding: 20px !important;
		min-height: auto;
	}

	.actions-left-section,
	.actions-right-section {
		width: 100%;
		justify-content: center;
	}

	.sync-action-btn-revamped,
	.close-action-btn-revamped {
		min-width: 100% !important;
		margin: 0;
	}

	.table-container {
		overflow-x: auto;
		margin: 0 -16px;
		padding: 0 16px;
	}
}

@media (max-width: 480px) {
	.header-content-wrapper {
		flex-direction: column;
		gap: 16px;
		align-items: flex-start;
	}

	.header-close-section {
		align-self: flex-end;
		position: absolute;
		top: 16px;
		right: 16px;
	}

	.header-main-content {
		width: 100%;
		padding-right: 60px;
	}
}

/* ========== REVAMPED FOOTER ACTIONS ========== */
.dialog-actions-container-revamped {
	background-color: var(--pos-card-bg) !important;
	border-top: 1px solid var(--pos-border) !important;
	padding: 24px 32px !important;
	display: flex !important;
	align-items: center !important;
	justify-content: space-between !important;
	gap: 24px !important;
	min-height: 80px !important;
	width: 100% !important;
	visibility: visible !important;
	opacity: 1 !important;
}

.actions-left-section {
	display: flex;
	align-items: center;
	flex: 1;
}

.actions-right-section {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-shrink: 0;
}

/* Sync Button */
.sync-action-btn-revamped {
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%) !important;
	color: white !important;
	border-radius: 14px !important;
	text-transform: none !important;
	font-weight: 600 !important;
	padding: 12px 28px !important;
	min-width: 180px !important;
	height: 48px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3) !important;
	letter-spacing: 0.5px;
	font-size: 15px !important;
}

.sync-action-btn-revamped:hover {
	transform: translateY(-3px) scale(1.02) !important;
	box-shadow: 0 8px 25px rgba(25, 118, 210, 0.4) !important;
	background: linear-gradient(135deg, #1565c0 0%, #1976d2 100%) !important;
}

.sync-action-btn-revamped:active {
	transform: translateY(-1px) scale(0.98) !important;
}

/* Close Button - Neutral with Red Text and Icon */
.close-action-btn-revamped {
	background: var(--pos-button-bg) !important;
	color: #f44336 !important;
	border: 2px solid #f44336 !important;
	border-radius: 14px !important;
	text-transform: none !important;
	font-weight: 600 !important;
	padding: 12px 24px !important;
	min-width: 120px !important;
	height: 48px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow: 0 2px 8px rgba(244, 67, 54, 0.2) !important;
	font-size: 15px !important;
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
	visibility: visible !important;
	opacity: 1 !important;
}

.close-action-btn-revamped:hover {
	background: rgba(244, 67, 54, 0.05) !important;
	border-color: #d32f2f !important;
	transform: translateY(-2px) !important;
	box-shadow: 0 4px 16px rgba(244, 67, 54, 0.3) !important;
	color: #d32f2f !important;
}

.close-action-btn-revamped:active {
	transform: translateY(0px) !important;
}

/* Force red color for icon and text */
.close-action-btn-revamped .v-icon,
.close-action-btn-revamped span {
	color: #f44336 !important;
}

.close-action-btn-revamped:hover .v-icon,
.close-action-btn-revamped:hover span {
	color: #d32f2f !important;
}

/* Sync Status Indicator */
.sync-status-indicator {
	display: flex;
	align-items: center;
	padding: 12px 20px;
	background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(102, 187, 106, 0.05) 100%);
	border: 1px solid rgba(76, 175, 80, 0.2);
	border-radius: 12px;
	box-shadow: 0 2px 8px rgba(76, 175, 80, 0.15);
}

.sync-status-indicator span {
	font-size: 15px;
	letter-spacing: 0.3px;
}
</style>
