<template>
	<v-row justify="center">
		<v-dialog
			v-model="ordersDialog"
			:max-width="ordersDialogMaxWidth"
			:fullscreen="isCompactOrders"
			:width="ordersDialogWidth"
			scrollable
			content-class="sales-orders-dialog-content"
			:theme="isDarkTheme ? 'dark' : 'light'"
		>
			<v-card class="sales-orders-card pos-themed-card" :theme="isDarkTheme ? 'dark' : 'light'">
				<v-card-title class="sales-orders-card__title">
					<div class="sales-orders-card__title-copy">
						<span class="text-h5 text-primary">{{ __("Select Sales Orders") }}</span>
						<span class="sales-orders-card__subtitle">
							{{ __("Find a sales order quickly and load it into the current sale.") }}
						</span>
					</div>
					<v-btn
						icon="mdi-close"
						variant="text"
						color="medium-emphasis"
						:aria-label="__('Close sales orders dialog')"
						@click="close_dialog"
					/>
				</v-card-title>
				<v-card-text class="sales-orders-card__body">
					<v-container class="sales-orders-card__content">
						<v-row class="mb-4">
							<v-col cols="12" sm="8">
								<v-text-field
									color="primary"
									:label="frappe._('Order ID')"
									hide-details
									v-model="order_name"
									density="compact"
									clearable
									class="pos-themed-input"
								></v-text-field>
							</v-col>
							<v-col cols="12" sm="4">
								<v-btn
									block
									variant="text"
									color="primary"
									:loading="isLoading"
									:disabled="isLoading || isSubmitting"
									@click="search_orders"
								>
									{{ __("Search") }}
								</v-btn>
							</v-col>
						</v-row>
						<v-row v-if="errorMessage">
							<v-col cols="12" class="pt-0">
								<v-alert type="error" density="compact" border="start">
									{{ errorMessage }}
								</v-alert>
							</v-col>
						</v-row>
						<v-row no-gutters>
							<v-col cols="12" class="pa-1">
								<div v-if="isCompactOrders" class="sales-orders-list">
									<button
										v-for="item in dialog_data"
										:key="item.name"
										type="button"
										class="sales-orders-item"
										:class="{ 'sales-orders-item--selected': isSelectedOrder(item) }"
										@click="selectOrder(item)"
									>
										<div class="sales-orders-item__top">
											<div class="sales-orders-item__identity">
												<strong>{{ item.customer_name || __("Walk-in Customer") }}</strong>
												<span>{{ item.name }}</span>
											</div>
											<div class="sales-orders-item__amount">
												{{ currencySymbol(item.currency) }}
												{{ formatCurrency(item.grand_total) }}
											</div>
										</div>
										<div class="sales-orders-item__meta">
											<span>{{ item.transaction_date }}</span>
											<v-chip
												v-if="isSelectedOrder(item)"
												size="small"
												color="primary"
												variant="flat"
											>
												{{ __("Selected") }}
											</v-chip>
										</div>
									</button>
								</div>
								<v-data-table
									v-else
									:headers="headers"
									:items="dialog_data"
									item-key="name"
									class="elevation-1 sales-orders-table"
									show-select
									v-model="selected"
									return-object
									select-strategy="single"
								>
									<!-- <template v-slot:item.posting_time="{ item }">
                          {{ item.posting_time.split(".")[0] }}
                        </template> -->
									<template v-slot:item.grand_total="{ item }">
										{{ currencySymbol(item.currency) }}
										{{ formatCurrency(item.grand_total) }}
									</template>
								</v-data-table>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions class="sales-orders-card__footer">
					<v-btn color="error" variant="tonal" @click="close_dialog">
						{{ __("Close") }}
					</v-btn>
					<v-btn
						color="success"
						:loading="isSubmitting"
						:disabled="isSubmitting || selected.length === 0"
						@click="submit_dialog"
					>
						{{ __("Select") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import { computed } from "vue";
import format from "../../../format";
import { useUIStore } from "../../../stores/uiStore.js";
import { useInvoiceStore } from "../../../stores/invoiceStore.js";
import { storeToRefs } from "pinia";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useTheme } from "../../../composables/core/useTheme";
import { loadDocumentSourceRecord } from "../../../utils/documentSources";
export default {
	// props: ["draftsDialog"],
	mixins: [format],
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const responsive = useResponsive();
		const theme = useTheme();
		const isCompactOrders = computed(() => responsive.windowWidth.value < 1100);
		const ordersDialogWidth = computed(() =>
			responsive.windowWidth.value < 600 ? "100vw" : "min(980px, 96vw)",
		);
		const ordersDialogMaxWidth = computed(() =>
			responsive.windowWidth.value < 1100 ? "100vw" : "980px",
		);
		const { ordersDialog, ordersData } = storeToRefs(uiStore);
		return {
			uiStore,
			invoiceStore,
			ordersDialog,
			ordersData,
			isCompactOrders,
			ordersDialogWidth,
			ordersDialogMaxWidth,
			isDarkTheme: theme.isDark,
		};
	},
	mounted() {
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile;
			},
			{ deep: true, immediate: true },
		);
	},
	data: () => ({
		// draftsDialog: false, // Moved to store
		singleSelect: true,
		pos_profile: {},
		selected: [],
		dialog_data: [],
		order_name: "",
		isLoading: false,
		isSubmitting: false,
		errorMessage: "",
		headers: [
			{
				title: __("Customer"),
				key: "customer_name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Date"),
				align: "start",
				sortable: true,
				key: "transaction_date",
			},
			//   {
			//     title: __("Time"),
			//     align: "start",
			//     sortable: true,
			//     key: "posting_time",
			//   },
			{
				title: __("Order"),
				key: "name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Amount"),
				key: "grand_total",
				align: "end",
				sortable: false,
			},
		],
	}),
	computed: {},
	methods: {
		isSelectedOrder(item) {
			return Array.isArray(this.selected) && this.selected.some((entry) => entry?.name === item?.name);
		},
		selectOrder(item) {
			this.selected = item ? [item] : [];
		},
		close_dialog() {
			this.uiStore.closeOrders();
		},

		clearSelected() {
			this.selected = [];
		},

		async search_orders() {
			if (this.isLoading || this.isSubmitting) {
				return;
			}

			this.errorMessage = "";
			this.isLoading = true;

			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.sales_orders.search_orders",
					args: {
						order_name: this.order_name,
						company: this.pos_profile.company,
						currency: this.pos_profile.currency,
					},
				});

				this.dialog_data = message || [];
			} catch (error) {
				console.error("Failed to search sales orders:", error);
				this.errorMessage = __("Unable to fetch sales orders");
			} finally {
				this.isLoading = false;
			}
		},

		async submit_dialog() {
			if (this.isSubmitting || this.selected.length === 0) {
				return;
			}

			this.isSubmitting = true;
			this.errorMessage = "";

			try {
				await loadDocumentSourceRecord({
					source: "order",
					record: this.selected[0],
					posProfile: this.pos_profile,
					invoiceStore: this.invoiceStore,
					uiStore: {
						closeDrafts: () => {},
						closeInvoiceManagement: () => {},
					},
					closeDrafts: false,
					closeInvoiceManagement: false,
				});
				this.uiStore.closeOrders();
			} catch (error) {
				console.error("Failed to submit sales order:", error);
				this.errorMessage = __("Unable to load the selected sales order");
			} finally {
				this.isSubmitting = false;
			}
		},
	},
	created: function () {
		// Watcher handled via store storeToRefs
	},
	watch: {
		ordersDialog(value) {
			if (!value) {
				this.clearSelected();
			}
		},
		ordersData: {
			handler(data) {
				this.clearSelected();
				this.dialog_data = data || [];
				this.order_name = "";
				this.errorMessage = "";
				this.isLoading = false;
				this.isSubmitting = false;
			},
			immediate: true,
		},
	},
	// beforeUnmount() {
	// 	this.eventBus.off("open_orders");
	// },
};
</script>

<style scoped>
.sales-orders-dialog-content {
	background: transparent !important;
}

.sales-orders-card {
	display: flex;
	flex-direction: column;
	max-height: min(92vh, 980px);
	background: var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
	border: 1px solid var(--pos-border);
}

.sales-orders-card__title {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 20px 12px;
	border-bottom: 1px solid var(--pos-border);
}

.sales-orders-card__title-copy {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.sales-orders-card__subtitle {
	font-size: 0.95rem;
	color: var(--pos-text-muted);
}

.sales-orders-card__body {
	flex: 1;
	padding: 0;
	overflow: auto;
}

.sales-orders-card__content {
	padding: 0 16px 16px;
}

.sales-orders-list {
	display: grid;
	gap: 12px;
}

.sales-orders-item {
	width: 100%;
	border: 1px solid rgba(var(--v-theme-primary), 0.16);
	border-radius: 18px;
	background: var(--pos-surface);
	color: var(--pos-text-primary);
	padding: 16px;
	text-align: left;
	display: flex;
	flex-direction: column;
	gap: 10px;
	transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.sales-orders-item--selected {
	border-color: rgba(var(--v-theme-primary), 0.6);
	box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.3);
}

.sales-orders-item__top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.sales-orders-item__identity {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.sales-orders-item__identity strong {
	font-size: 1rem;
}

.sales-orders-item__identity span {
	font-size: 0.88rem;
	color: var(--pos-text-muted);
}

.sales-orders-item__amount {
	font-weight: 700;
	font-size: 1rem;
	text-align: right;
}

.sales-orders-item__meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	font-size: 0.88rem;
	color: var(--pos-text-muted);
}

.sales-orders-card__footer {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
	background: color-mix(in srgb, var(--pos-surface-raised) 92%, transparent);
	backdrop-filter: blur(10px);
	border-top: 1px solid var(--pos-border);
}

.sales-orders-table :deep(.v-table),
.sales-orders-table :deep(.v-table__wrapper),
.sales-orders-table :deep(table),
.sales-orders-table :deep(thead),
.sales-orders-table :deep(tbody),
.sales-orders-table :deep(tr),
.sales-orders-table :deep(td),
.sales-orders-table :deep(th) {
	background: var(--pos-surface) !important;
	color: var(--pos-text-primary) !important;
}

.sales-orders-table :deep(th) {
	background: var(--pos-table-header-bg) !important;
}

.sales-orders-table :deep(tbody tr:hover) {
	background: var(--pos-table-row-hover) !important;
}

@media (max-width: 959px) {
	.sales-orders-card {
		max-height: 100vh;
		border-radius: 0;
	}

	.sales-orders-card__title {
		padding: 18px 16px 10px;
	}

	.sales-orders-card__content {
		padding: 0 12px 12px;
	}

	.sales-orders-card__footer {
		padding-inline: 16px;
		justify-content: stretch;
	}

	.sales-orders-card__footer :deep(.v-btn) {
		flex: 1;
	}
}
</style>
