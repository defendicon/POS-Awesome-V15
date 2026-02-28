<template>
	<v-row justify="center">
		<v-dialog
			v-model="draftsDialog"
			max-width="900px"
			:theme="isDarkTheme ? 'dark' : 'light'"
			content-class="drafts-dialog-content"
		>
			<!-- <template v-slot:activator="{ on, attrs }">
        <v-btn color="primary" theme="dark" v-bind="attrs" v-on="on">Open Dialog</v-btn>
      </template>-->
			<v-card
				variant="flat"
				:theme="isDarkTheme ? 'dark' : 'light'"
				:class="[
					'pos-themed-card drafts-dialog-card',
					isDarkTheme ? 'drafts-dialog-card--dark' : 'drafts-dialog-card--light',
				]"
			>
				<v-card-title>
					<span class="text-h5 text-primary">{{ __("Load Sales Invoice") }}</span>
				</v-card-title>
				<v-card-subtitle>
					<span class="text-primary">{{ __("Load previously saved invoices") }}</span>
				</v-card-subtitle>
				<v-card-text class="pa-0">
					<v-container>
						<v-row no-gutters>
							<v-col cols="12" class="pa-1">
								<v-data-table
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
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="close_dialog">Close</v-btn>
					<v-btn color="success" theme="dark" @click="submit_dialog">Load Sale</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import format from "../../../format";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { storeToRefs } from "pinia";
import { useTheme } from "../../../composables/core/useTheme";

export default {
	// props: ["draftsDialog"],
	mixins: [format],
	setup() {
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const theme = useTheme();
		const { draftsDialog, draftsData } = storeToRefs(uiStore);
		return {
			toastStore,
			uiStore,
			invoiceStore,
			draftsDialog,
			draftsData,
			isDarkTheme: theme.isDark,
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
		close_dialog() {
			this.uiStore.closeDrafts();
		},

		async submit_dialog() {
			if (this.selected.length > 0) {
				const selectedDraft = this.selected[0];
				const doctype =
					selectedDraft?.doctype ||
					(this.uiStore.posProfile?.create_pos_invoice_instead_of_sales_invoice
						? "POS Invoice"
						: "Sales Invoice");

				try {
					const { message } = await frappe.call({
						method: "posawesome.posawesome.api.invoices.get_draft_invoice_doc",
						args: {
							invoice_name: selectedDraft.name,
							doctype,
						},
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
</style>
