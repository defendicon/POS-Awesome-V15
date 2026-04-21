<template>
	<v-row justify="center">
		<v-dialog
			v-model="draftsDialog"
			:max-width="draftsDialogMaxWidth"
			:fullscreen="isCompactDrafts"
			:width="draftsDialogWidth"
			scrollable
			:theme="isDarkTheme ? 'dark' : 'light'"
			content-class="drafts-dialog-content"
		>
			<v-card
				variant="flat"
				:theme="isDarkTheme ? 'dark' : 'light'"
				:class="[
					'pos-themed-card drafts-dialog-card',
					isDarkTheme ? 'drafts-dialog-card--dark' : 'drafts-dialog-card--light',
				]"
			>
				<v-card-title class="drafts-dialog-card__title">
					<div class="drafts-dialog-card__title-copy">
						<span class="text-h5 text-primary">{{ __("Load Sales Invoice") }}</span>
						<span class="drafts-dialog-card__subtitle">
							{{ __("Load previously saved invoices") }}
						</span>
					</div>
					<v-btn
						icon="mdi-close"
						variant="text"
						color="medium-emphasis"
						:aria-label="__('Close drafts dialog')"
						@click="close_dialog"
					/>
				</v-card-title>
				<v-card-text class="drafts-dialog-card__body">
					<v-container class="drafts-dialog-card__content">
						<v-row no-gutters>
							<v-col cols="12" class="pa-1">
								<div v-if="isCompactDrafts" class="drafts-dialog-list">
									<button
										v-for="item in draftsData"
										:key="item.name"
										type="button"
										class="drafts-dialog-item"
										:class="{ 'drafts-dialog-item--selected': isSelectedDraft(item) }"
										@click="selectDraft(item)"
									>
										<div class="drafts-dialog-item__top">
											<div class="drafts-dialog-item__identity">
												<strong>{{ item.customer_name || __("Walk-in Customer") }}</strong>
												<span>{{ item.name }}</span>
											</div>
											<div class="drafts-dialog-item__amount">
												{{ currencySymbol(item.currency) }}
												{{ formatCurrency(item.grand_total) }}
											</div>
										</div>
										<div class="drafts-dialog-item__meta">
											<span>{{ item.posting_date }}</span>
											<span>{{ item.posting_time?.split(".")[0] || "" }}</span>
										</div>
										<div class="drafts-dialog-item__chips">
											<v-chip
												v-if="isSelectedDraft(item)"
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
									:items="draftsData"
									item-value="name"
									:class="[
										'elevation-1 drafts-dialog-table',
										isDarkTheme ? 'drafts-dialog-table--dark' : 'drafts-dialog-table--light',
									]"
									:theme="isDarkTheme ? 'dark' : 'light'"
									show-select
									v-model="selected"
									select-strategy="single"
									return-object
								>
									<template v-slot:item.posting_time="{ item }">
										{{ item.posting_time.split(".")[0] }}
									</template>
									<template v-slot:item.grand_total="{ item }">
										{{ currencySymbol(item.currency) }}
										{{ formatCurrency(item.grand_total) }}
									</template>
								</v-data-table>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions class="drafts-dialog-card__footer">
					<v-btn color="error" variant="tonal" @click="close_dialog">
						{{ __("Close") }}
					</v-btn>
					<v-btn color="success" :disabled="selected.length === 0" @click="submit_dialog">
						{{ __("Load Sale") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import { computed } from "vue";
import format from "../../../format";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { storeToRefs } from "pinia";
import { useTheme } from "../../../composables/core/useTheme";
import { useResponsive } from "../../../composables/core/useResponsive";
import { fetchDraftInvoiceDoc } from "../../../utils/draftInvoices";

export default {
	// props: ["draftsDialog"],
	mixins: [format],
	setup() {
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const theme = useTheme();
		const responsive = useResponsive();
		const isCompactDrafts = computed(() => responsive.windowWidth.value < 1100);
		const draftsDialogWidth = computed(() =>
			responsive.windowWidth.value < 600 ? "100vw" : "min(960px, 96vw)",
		);
		const draftsDialogMaxWidth = computed(() =>
			responsive.windowWidth.value < 1100 ? "100vw" : "960px",
		);
		const { draftsDialog, draftsData } = storeToRefs(uiStore);
		return {
			toastStore,
			uiStore,
			invoiceStore,
			draftsDialog,
			draftsData,
			isDarkTheme: theme.isDark,
			isCompactDrafts,
			draftsDialogWidth,
			draftsDialogMaxWidth,
		};
	},
	data: () => ({
		// draftsDialog: false, // Moved to uiStore
		singleSelect: true,
		selected: [],
		dialog_data: {},
		headers: [
			{
				title: __("Customer"),
				value: "customer_name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Date"),
				align: "start",
				sortable: true,
				value: "posting_date",
			},
			{
				title: __("Time"),
				align: "start",
				sortable: true,
				value: "posting_time",
			},
			{
				title: __("Invoice"),
				value: "name",
				align: "start",
				sortable: true,
			},
			{
				title: __("Amount"),
				value: "grand_total",
				align: "end",
				sortable: false,
			},
		],
	}),
	computed: {},
	methods: {
		isSelectedDraft(item) {
			return Array.isArray(this.selected) && this.selected.some((entry) => entry?.name === item?.name);
		},
		selectDraft(item) {
			this.selected = item ? [item] : [];
		},
		close_dialog() {
			this.uiStore.closeDrafts();
		},

		async submit_dialog() {
			if (this.selected.length > 0) {
				const selectedDraft = this.selected[0];

				try {
					const message = await fetchDraftInvoiceDoc({
						draft: selectedDraft,
						posProfile: this.uiStore.posProfile,
					});
					if (message) {
						this.invoiceStore.triggerLoadInvoice(message);
					}
				} catch (error) {
					console.error("Error loading draft invoice:", error);
					this.toastStore.show({
						title: __("Unable to load draft invoice"),
						color: "error",
					});
					return;
				}

				this.uiStore.closeDrafts();
			} else {
				this.toastStore.show({
					title: `Select an invoice to load`,
					color: "error",
				});
			}
		},
	},
	created: function () {
		// Watcher is not needed if we bind v-model="draftsDialog" to store ref
	},
	watch: {
		draftsDialog(value) {
			if (!value) {
				this.selected = [];
				return;
			}

			if (!this.uiStore.invoiceManagementDialog) {
				this.uiStore.closeDrafts();
				this.uiStore.openInvoiceManagement(
					"drafts",
					this.uiStore.draftSource || "invoice",
				);
			}
		},
		draftsData: {
			handler(data) {
				this.dialog_data = data || [];
			},
			immediate: true,
		},
	},
};
</script>

<style scoped>
.drafts-dialog-content {
	background: transparent !important;
}

.drafts-dialog-card {
	background: var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
	display: flex;
	flex-direction: column;
	max-height: min(92vh, 980px);
}

.drafts-dialog-table {
	background: var(--pos-surface) !important;
	color: var(--pos-text-primary) !important;
}

.drafts-dialog-card--light {
	background: #ffffff !important;
	color: #212121 !important;
	border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.drafts-dialog-card--dark {
	background: #242b33 !important;
	color: #ffffff !important;
}

.drafts-dialog-table--light {
	background: #ffffff !important;
	color: #212121 !important;
}

.drafts-dialog-table--dark {
	background: #1e1e1e !important;
	color: #ffffff !important;
}

.drafts-dialog-card :deep(.v-card-title),
.drafts-dialog-card :deep(.v-card-subtitle),
.drafts-dialog-card :deep(.v-card-text),
.drafts-dialog-card :deep(.v-card-actions) {
	background: transparent !important;
	color: var(--pos-text-primary) !important;
}

.drafts-dialog-card--light :deep(.v-card-title),
.drafts-dialog-card--light :deep(.v-card-subtitle),
.drafts-dialog-card--light :deep(.v-card-text),
.drafts-dialog-card--light :deep(.v-card-actions),
.drafts-dialog-card--light :deep(.v-table),
.drafts-dialog-card--light :deep(.v-table__wrapper),
.drafts-dialog-card--light :deep(table),
.drafts-dialog-card--light :deep(thead),
.drafts-dialog-card--light :deep(tbody),
.drafts-dialog-card--light :deep(tr),
.drafts-dialog-card--light :deep(th),
.drafts-dialog-card--light :deep(td) {
	background: #ffffff !important;
	color: #212121 !important;
}

.drafts-dialog-card--dark :deep(.v-card-title),
.drafts-dialog-card--dark :deep(.v-card-subtitle),
.drafts-dialog-card--dark :deep(.v-card-text),
.drafts-dialog-card--dark :deep(.v-card-actions) {
	color: #ffffff !important;
}

.drafts-dialog-card__title {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 20px 12px;
}

.drafts-dialog-card__title-copy {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.drafts-dialog-card__subtitle {
	font-size: 0.95rem;
	color: var(--pos-text-muted);
}

.drafts-dialog-card__body {
	flex: 1;
	padding: 0;
	overflow: auto;
}

.drafts-dialog-card__content {
	padding: 0 16px 16px;
}

.drafts-dialog-list {
	display: grid;
	gap: 12px;
}

.drafts-dialog-item {
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
	transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.drafts-dialog-item--selected {
	border-color: rgba(var(--v-theme-primary), 0.6);
	box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.3);
}

.drafts-dialog-item__top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.drafts-dialog-item__identity {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.drafts-dialog-item__identity strong {
	font-size: 1rem;
}

.drafts-dialog-item__identity span,
.drafts-dialog-item__meta {
	color: var(--pos-text-muted);
	font-size: 0.88rem;
}

.drafts-dialog-item__amount {
	font-weight: 700;
	font-size: 1rem;
	text-align: right;
}

.drafts-dialog-item__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 12px;
}

.drafts-dialog-card__footer {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
	background: color-mix(in srgb, var(--pos-surface-raised) 92%, transparent);
	backdrop-filter: blur(10px);
	border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

@media (max-width: 959px) {
	.drafts-dialog-card {
		max-height: 100vh;
		border-radius: 0;
	}

	.drafts-dialog-card__title {
		padding: 18px 16px 10px;
	}

	.drafts-dialog-card__content {
		padding: 0 12px 12px;
	}

	.drafts-dialog-card__footer {
		padding-inline: 16px;
		justify-content: stretch;
	}

	.drafts-dialog-card__footer :deep(.v-btn) {
		flex: 1;
	}
}
</style>
