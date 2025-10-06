<template>
	<v-row justify="center">
		<v-dialog v-model="isOpen" persistent max-width="800px" max-height="90vh">
			<v-card elevation="8" class="opening-dialog-card">
				<!-- Header Section - White Background with Blue Text -->
				<v-card-title class="opening-dialog-header">
					<div class="header-content">
						<div class="header-icon-wrapper">
							<v-icon class="header-icon">mdi-cash-plus</v-icon>
						</div>
						<div class="header-text">
							<h5 class="header-title">{{ __("Create POS Opening Shift") }}</h5>
							<p class="header-subtitle">
								{{ __("Initialize your shift with opening balances") }}
							</p>
						</div>
					</div>
				</v-card-title>

				<!-- Content Section - Optimized for minimal scrolling -->
				<v-card-text class="opening-dialog-content">
					<v-container class="pa-0">
						<v-row>
							<!-- Company and POS Profile in same row for space efficiency -->
							<v-col cols="12" md="6" class="form-field">
								<v-autocomplete
									:items="companies"
									:label="frappe._('Company')"
									v-model="company"
									required
									variant="outlined"
									color="primary"
									density="compact"
									prepend-inner-icon="mdi-domain"
									class="enhanced-field"
									:class="{ 'field-focused': company }"
								/>
							</v-col>

							<v-col cols="12" md="6" class="form-field">
								<v-autocomplete
									:items="pos_profiles"
									:label="frappe._('POS Profile')"
									v-model="pos_profile"
									required
									variant="outlined"
									color="primary"
									density="compact"
									prepend-inner-icon="mdi-point-of-sale"
									class="enhanced-field"
									:class="{ 'field-focused': pos_profile }"
								/>
							</v-col>

							<!-- Payment Methods Section - Compact -->
							<v-col cols="12">
								<div class="section-header-compact">
									<h6 class="section-title-compact">
										<v-icon class="section-icon">mdi-credit-card-multiple</v-icon>
										{{ __("Payment Methods") }}
									</h6>
								</div>

								<v-data-table
									:headers="payments_methods_headers"
									:items="payments_methods"
									item-key="mode_of_payment"
									class="enhanced-table-compact"
									:items-per-page="itemsPerPage"
									hide-default-footer
									density="compact"
									:height="'300px'"
									fixed-header
								>
									<template v-slot:item.amount="{ item }">
										<v-text-field
											v-model="item.amount"
											:rules="[max25chars]"
											type="number"
											density="compact"
											variant="outlined"
											color="primary"
											hide-details
											:prefix="currencySymbol(item.currency)"
											class="amount-input"
										/>
									</template>
								</v-data-table>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>

				<!-- Actions Section -->
				<v-card-actions class="dialog-actions-container">
					<v-btn
						theme="dark"
						@click="go_desk"
						class="pos-action-btn cancel-action-btn"
						size="large"
						elevation="2"
					>
						<v-icon start>mdi-close-circle-outline</v-icon>
						<span>{{ __("Cancel") }}</span>
					</v-btn>
					<v-spacer />
					<v-btn
						theme="dark"
						:disabled="is_loading"
						:loading="is_loading"
						@click="submit_dialog"
						class="pos-action-btn submit-action-btn"
						size="large"
						elevation="2"
					>
						<v-icon start>mdi-check-circle-outline</v-icon>
						<span>{{ __("Submit") }}</span>
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import format from "../../format";
import {
	getOpeningDialogStorage,
	setOpeningDialogStorage,
	setOpeningStorage,
	initPromise,
	checkDbHealth,
} from "../../../offline/index.js";

export default {
	mixins: [format],
	props: ["dialog"],

	data() {
		return {
			isOpen: this.dialog ? this.dialog : false,
			dialog_data: {},
			is_loading: false,
			companies: [],
			company: "",
			pos_profiles_data: [],
			pos_profiles: [],
			pos_profile: "",
			payments_method_data: [],
			payments_methods: [],
			payments_methods_headers: [
				{
					title: __("Mode of Payment"),
					align: "start",
					sortable: false,
					value: "mode_of_payment",
				},
				{
					title: __("Opening Amount"),
					value: "amount",
					align: "center",
					sortable: false,
				},
			],
			itemsPerPage: 100,
			max25chars: (v) => v.length <= 12 || "Input too long!",
			pagination: {},
			snack: false,
			snackColor: "",
			snackText: "",
		};
	},

	watch: {
		company(val) {
			this.pos_profiles = [];
			this.pos_profiles_data.forEach((element) => {
				if (element.company === val) {
					this.pos_profiles.push(element.name);
				}
				if (this.pos_profiles.length) {
					this.pos_profile = this.pos_profiles[0];
				} else {
					this.pos_profile = "";
				}
			});
		},

		pos_profile(val) {
			this.payments_methods = [];
			this.payments_method_data.forEach((element) => {
				if (element.parent === val) {
					this.payments_methods.push({
						mode_of_payment: element.mode_of_payment,
						amount: 0,
						currency: element.currency,
					});
				}
			});
		},
	},

	methods: {
		close_opening_dialog() {
			this.eventBus.emit("close_opening_dialog");
		},

		async get_opening_dialog_data() {
			const vm = this;
			await initPromise;
			await checkDbHealth();

			// Load cached data first for offline usage
			const cached = getOpeningDialogStorage();
			if (cached) {
				try {
					vm.companies = cached.companies.map((c) => c.name);
					vm.pos_profiles_data = cached.pos_profiles_data || [];
					vm.payments_method_data = cached.payments_method || [];
					vm.company = vm.companies[0] || "";
				} catch (e) {
					console.error("Failed to parse opening dialog cache", e);
				}
			}

			frappe.call({
				method: "posawesome.posawesome.api.shifts.get_opening_dialog_data",
				args: {},
				callback: function (r) {
					if (r.message) {
						vm.companies = r.message.companies.map((element) => element.name);
						vm.pos_profiles_data = r.message.pos_profiles_data;
						vm.payments_method_data = r.message.payments_method;
						vm.company = vm.companies[0] || "";
						try {
							setOpeningDialogStorage(r.message);
						} catch (e) {
							console.error("Failed to cache opening dialog data", e);
						}
					}
				},
			});
		},

		submit_dialog() {
			if (!this.payments_methods.length || !this.company || !this.pos_profile) {
				return;
			}

			this.is_loading = true;
			const vm = this;

			return frappe
				.call("posawesome.posawesome.api.shifts.create_opening_voucher", {
					pos_profile: this.pos_profile,
					company: this.company,
					balance_details: this.payments_methods,
				})
				.then((r) => {
					if (r.message) {
						vm.eventBus.emit("register_pos_data", r.message);
						vm.eventBus.emit("set_company", r.message.company);
						try {
							setOpeningStorage(r.message);
						} catch (e) {
							console.error("Failed to cache opening data", e);
						}
						vm.close_opening_dialog();
						vm.is_loading = false;
					}
				});
		},

		go_desk() {
			frappe.set_route("/");
			location.reload();
		},
	},

	mounted() {
		this.get_opening_dialog_data();
	},

	beforeUnmount() {
		// Clean up event listeners if any were added
	},
};
</script>

<style scoped>
/* Main Dialog Card */
.opening-dialog-card {
	border-radius: 16px;
	overflow: hidden;
	background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
	border: 1px solid rgba(25, 118, 210, 0.1);
	transition: all 0.3s ease;
	max-height: 90vh;
	display: flex;
	flex-direction: column;
}

/* Header Section - White Background with Blue Text */
.opening-dialog-header {
	background: white;
	color: #1976d2;
	padding: 16px 24px;
	border-bottom: 2px solid rgba(25, 118, 210, 0.1);
	flex-shrink: 0;
}

.header-content {
	display: flex;
	align-items: center;
	gap: 12px;
}

.header-icon-wrapper {
	background: rgba(25, 118, 210, 0.1);
	border-radius: 50%;
	padding: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}

.header-icon {
	font-size: 20px;
	color: #1976d2;
}

.header-text {
	flex: 1;
}

.header-title {
	font-size: 1.3rem;
	font-weight: 600;
	margin: 0;
	line-height: 1.2;
	color: #1976d2;
}

.header-subtitle {
	font-size: 0.85rem;
	opacity: 0.8;
	margin: 2px 0 0 0;
	line-height: 1.3;
	color: #1976d2;
}

/* Content Section - Optimized for minimal scrolling */
.opening-dialog-content {
	padding: 20px 24px;
	background: white;
	flex: 1;
	overflow-y: auto;
}

.section-header-compact {
	margin-bottom: 12px;
}

.section-title-compact {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 1rem;
	font-weight: 600;
	color: #1976d2;
	margin-bottom: 0;
}

.section-icon {
	color: #1976d2;
	font-size: 18px;
}

/* Form Fields - Compact */
.form-field {
	margin-bottom: 12px;
}

.enhanced-field {
	transition: all 0.3s ease;
}

.enhanced-field:hover {
	transform: translateY(-1px);
}

.field-focused {
	background: rgba(25, 118, 210, 0.02);
	border-radius: 8px;
}

/* Enhanced Table - Compact */
.enhanced-table-compact {
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
	border: 1px solid rgba(25, 118, 210, 0.1);
}

.enhanced-table-compact :deep(.v-data-table__wrapper) {
	border-radius: 8px;
}

.enhanced-table-compact :deep(th) {
	background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
	color: #1976d2;
	font-weight: 600;
	border-bottom: 1px solid rgba(25, 118, 210, 0.1);
	padding: 8px 12px;
}

.enhanced-table-compact :deep(td) {
	padding: 6px 12px;
}

.enhanced-table-compact :deep(tr:hover) {
	background: rgba(25, 118, 210, 0.04);
}

/* Amount Editor - Compact */
.amount-editor {
	width: 100%;
}

.amount-display-compact {
	display: flex;
	align-items: center;
	justify-content: center;
	/* Add this to center the content horizontally */
	gap: 4px;
	padding: 4px 8px;
	background: rgba(25, 118, 210, 0.05);
	border-radius: 6px;
	transition: all 0.3s ease;
	cursor: pointer;
	min-height: 32px;
}

.amount-display-compact:hover {
	background: rgba(25, 118, 210, 0.1);
	transform: scale(1.01);
}

.currency-symbol {
	font-weight: 600;
	color: #1976d2;
	font-size: 0.9rem;
}

.amount-value {
	font-weight: 500;
	color: #333;
	font-size: 0.9rem;
}

.amount-input {
	margin-top: 4px;
}

/* Actions Section - Compact */
.opening-dialog-actions-compact {
	padding: 24px;
	display: flex;
	gap: 24px;
}

.action-btn-revamped {
	padding: 16px 24px !important;
	border-radius: 12px !important;
	font-weight: 700 !important;
	text-transform: uppercase !important;
	letter-spacing: 1px !important;
	font-size: 1.3rem !important;
	transition: all 0.3s ease !important;
	position: relative;
	overflow: hidden;
	min-width: 180px !important;
	border: none !important;
}

.action-btn-revamped .v-icon {
	font-size: 1.8rem !important;
}

.button-text {
	position: relative;
	z-index: 2;
}

.cancel-btn-revamped {
	background: linear-gradient(135deg, #ff5252 0%, #d32f2f 100%) !important;
	box-shadow: 0 4px 20px rgba(211, 47, 47, 0.4) !important;
}

.cancel-btn-revamped:hover {
	box-shadow: 0 6px 25px rgba(211, 47, 47, 0.6) !important;
	transform: translateY(-3px);
}

.cancel-btn-revamped:active {
	transform: translateY(1px);
	box-shadow: 0 2px 10px rgba(211, 47, 47, 0.4) !important;
}

.submit-btn-revamped {
	background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%) !important;
	box-shadow: 0 4px 20px rgba(46, 125, 50, 0.4) !important;
}

.submit-btn-revamped:hover {
	box-shadow: 0 6px 25px rgba(46, 125, 50, 0.6) !important;
	transform: translateY(-3px);
}

.submit-btn-revamped:hover:before {
	opacity: 1;
}

.submit-btn-revamped:active {
	transform: translateY(1px);
	box-shadow: 0 2px 10px rgba(46, 125, 50, 0.4) !important;
}

.submit-btn-revamped:disabled {
	background: linear-gradient(135deg, #9e9e9e 0%, #757575 100%) !important;
	box-shadow: none !important;
	transform: none !important;
	opacity: 0.7;
}

/* Responsive Design */
@media (max-width: 768px) {
	.opening-dialog-header {
		padding: 12px 16px;
	}

	.header-content {
		gap: 8px;
	}

	.header-title {
		font-size: 1.2rem;
	}

	.opening-dialog-content {
		padding: 16px;
	}

	.opening-dialog-actions-compact {
		padding: 12px 16px;
	}

	.action-btn-compact {
		padding: 6px 12px;
		min-width: 70px;
	}
}

@media (max-width: 480px) {
	.header-content {
		flex-direction: column;
		text-align: center;
		gap: 8px;
	}

	.opening-dialog-content {
		padding: 12px;
	}

	.action-btn-compact {
		margin-left: 4px;
		padding: 6px 10px;
		min-width: 60px;
	}
}

/* Animation Effects */
@keyframes slideInFromTop {
	from {
		opacity: 0;
		transform: translateY(-20px);
	}

	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.opening-dialog-card {
	animation: slideInFromTop 0.4s ease-out;
}

/* Focus and Interaction States */
.enhanced-field :deep(.v-field--focused) {
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.enhanced-table-compact :deep(.v-data-table-row--clickable:hover) {
	background: rgba(25, 118, 210, 0.04) !important;
}

/* Enhanced focus states for form fields */
.enhanced-field :deep(.v-field--focused .v-field__outline) {
	border-color: rgba(25, 118, 210, 0.3) !important;
	border-width: 1px !important;
}

.enhanced-field :deep(.v-field--focused .v-field__overlay) {
	background: rgba(25, 118, 210, 0.02);
}

/* Action buttons with improved naming and styling */
.dialog-actions-container {
	background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
	border-top: 1px solid #e0e0e0;
	padding: 16px 24px;
	gap: 12px;
}

.pos-action-btn {
	border-radius: 12px;
	text-transform: none;
	font-weight: 600;
	padding: 12px 32px;
	min-width: 120px;
	transition: all 0.3s ease;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.pos-action-btn,
.pos-action-btn .v-icon,
.pos-action-btn span,
.pos-action-btn :deep(.v-btn__content) {
	color: white !important;
}

.cancel-action-btn {
	background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%) !important;
}

.cancel-action-btn:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(211, 47, 47, 0.4);
}

.submit-action-btn {
	background: linear-gradient(135deg, #388e3c 0%, #2e7d32 100%) !important;
}

.submit-action-btn:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(46, 125, 50, 0.4);
}

.submit-action-btn:disabled {
	opacity: 0.6;
	transform: none;
}

/* Dark theme overrides */
:deep([data-theme="dark"]) .opening-dialog-card,
:deep(.v-theme--dark) .opening-dialog-card,
::v-deep([data-theme="dark"]) .opening-dialog-card,
::v-deep(.v-theme--dark) .opening-dialog-card {
	background: #1e1e1e !important;
}

:deep([data-theme="dark"]) .opening-dialog-header,
:deep(.v-theme--dark) .opening-dialog-header,
::v-deep([data-theme="dark"]) .opening-dialog-header,
::v-deep(.v-theme--dark) .opening-dialog-header {
	background: #1e1e1e !important;
	color: #fff !important;
	border-bottom: 1px solid #373737;
}

:deep([data-theme="dark"]) .opening-dialog-content,
:deep(.v-theme--dark) .opening-dialog-content,
::v-deep([data-theme="dark"]) .opening-dialog-content,
::v-deep(.v-theme--dark) .opening-dialog-content {
	background: #1e1e1e !important;
}

:deep([data-theme="dark"]) .dialog-actions-container,
:deep(.v-theme--dark) .dialog-actions-container,
::v-deep([data-theme="dark"]) .dialog-actions-container,
::v-deep(.v-theme--dark) .dialog-actions-container {
	background: #1e1e1e !important;
	border-top: 1px solid #373737;
}
</style>
