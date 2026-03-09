<template>
	<v-row justify="center">
		<v-dialog v-model="dialog" max-width="800">
			<v-card
				class="mpesa-dialog-card pos-themed-card pos-dialog-shell"
				style="--pos-dialog-max-width: 800px; --pos-dialog-max-height: 760px"
			>
				<v-card-title class="mpesa-dialog-card__title pos-dialog-header">
					<div class="pos-dialog-header__main">
						<div class="mpesa-dialog-card__icon">
							<v-icon size="22">mdi-cellphone-link</v-icon>
						</div>
						<div>
							<div class="text-h5 text-primary">{{ __("Select Payment") }}</div>
							<div class="text-body-2 text-medium-emphasis">
								{{ __("Find and attach an M-Pesa draft payment") }}
							</div>
						</div>
					</div>
					<v-btn
						icon="mdi-close"
						variant="text"
						class="pos-dialog-close pos-touch-target pos-focus-ring"
						:aria-label="__('Close M-Pesa payment dialog')"
						@click="close_dialog"
					/>
				</v-card-title>
				<v-container class="mpesa-dialog-card__content pos-dialog-body">
					<v-row class="mb-4">
						<v-text-field
							color="primary"
							:label="frappe._('Full Name')"
							class="pos-themed-input mx-4"
							hide-details
							v-model="full_name"
							density="compact"
							clearable
						></v-text-field>
						<v-text-field
							color="primary"
							:label="frappe._('Mobile No')"
							class="pos-themed-input mx-4"
							hide-details
							v-model="mobile_no"
							density="compact"
							clearable
						></v-text-field>
						<v-btn
							variant="text"
							class="ml-2 pos-touch-target pos-focus-ring"
							color="primary"
							theme="dark"
							:loading="isLoading"
							:disabled="isLoading || isSubmitting"
							@click="search"
							>{{ __("Search") }}</v-btn
						>
					</v-row>
					<v-row v-if="errorMessage">
						<v-col cols="12" class="pt-0">
							<v-alert type="error" density="compact" border="start" class="mx-4">
								{{ errorMessage }}
							</v-alert>
						</v-col>
					</v-row>
					<v-row v-else-if="isLoading">
						<v-col cols="12" class="pt-0">
							<div class="mpesa-results-state">
								<v-progress-circular indeterminate color="primary" size="28" width="3" />
								<div class="mpesa-results-state__title">{{ __("Searching payments...") }}</div>
								<div class="mpesa-results-state__subtitle">
									{{ __("Matching M-Pesa drafts will appear here.") }}
								</div>
							</div>
						</v-col>
					</v-row>
					<v-row v-else-if="showNoResults">
						<v-col cols="12" class="pt-0">
							<div class="mpesa-results-state">
								<v-icon size="38" color="medium-emphasis">mdi-magnify-close</v-icon>
								<div class="mpesa-results-state__title">{{ __("No matching payments found") }}</div>
								<div class="mpesa-results-state__subtitle">
									{{ __("Try another phone number or full name, then search again.") }}
								</div>
								<v-btn
									variant="text"
									color="primary"
									class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
									@click="resetSearch"
								>
									{{ __("Clear Search") }}
								</v-btn>
							</div>
						</v-col>
					</v-row>
					<v-row>
						<v-col cols="12" class="pa-1" v-if="dialog_data.length">
							<v-data-table
								:headers="headers"
								:items="dialog_data"
								item-key="name"
								class="elevation-1"
								show-select
								v-model="selected"
								return-object
								select-strategy="single"
							>
								<template v-slot:item.amount="{ item }">{{
									formatCurrency(item.amount)
								}}</template>
								<template v-slot:item.posting_date="{ item }">{{
									item.posting_date.slice(0, 16)
								}}</template>
							</v-data-table>
						</v-col>
					</v-row>
				</v-container>
				<v-card-actions class="mt-4 mpesa-dialog-card__actions pos-dialog-actions">
					<v-spacer></v-spacer>
					<v-btn
						color="error mx-2"
						theme="dark"
						class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
						@click="close_dialog"
					>{{ __("Close") }}</v-btn>
					<v-btn
						v-if="selected.length"
						color="success"
						theme="dark"
						class="pos-dialog-action-btn pos-touch-target pos-focus-ring"
						:loading="isSubmitting"
						:disabled="isSubmitting"
						@click="submit_dialog"
						>{{ __("Submit") }}</v-btn
					>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { formatUtils } from "../../../format";

defineOptions({
	name: "MpesaPayments",
});

const frappe = window.frappe;
const __ = window.__ || ((text) => text);
const eventBus = inject("eventBus");

const dialog = ref(false);
const selected = ref([]);
const dialog_data = ref([]);
const company = ref("");
const customer = ref("");
const mode_of_payment = ref("");
const full_name = ref("");
const mobile_no = ref("");
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref("");
const hasSearched = ref(false);

const showNoResults = computed(() => {
	return hasSearched.value && !isLoading.value && !errorMessage.value && dialog_data.value.length === 0;
});

const headers = [
	{
		title: __("Full Name"),
		value: "full_name",
		align: "start",
		sortable: true,
	},
	{
		title: __("Mobile No"),
		value: "mobile_no",
		align: "start",
		sortable: true,
	},
	{
		title: __("Amount"),
		value: "amount",
		align: "start",
		sortable: true,
	},
	{
		title: __("Date"),
		align: "start",
		sortable: true,
		value: "posting_date",
	},
];

function close_dialog() {
	dialog.value = false;
}

function resetSearch() {
	full_name.value = "";
	mobile_no.value = "";
	dialog_data.value = [];
	selected.value = [];
	hasSearched.value = false;
	errorMessage.value = "";
}

async function search() {
	if (isLoading.value || isSubmitting.value) {
		return;
	}

	hasSearched.value = true;
	errorMessage.value = "";
	isLoading.value = true;

	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.m_pesa.get_mpesa_draft_payments",
			args: {
				company: company.value,
				mode_of_payment: mode_of_payment.value,
				mobile_no: mobile_no.value,
				full_name: full_name.value,
			},
		});

		dialog_data.value = Array.isArray(message) ? message : [];
	} catch (error) {
		console.error("Failed to search M-Pesa payments:", error);
		errorMessage.value = __("Unable to fetch M-Pesa payments");
		dialog_data.value = [];
	} finally {
		isLoading.value = false;
	}
}

async function submit_dialog() {
	if (isSubmitting.value || selected.value.length === 0) {
		return;
	}

	errorMessage.value = "";
	isSubmitting.value = true;

	try {
		const selected_payment = selected.value[0].name;
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.m_pesa.submit_mpesa_payment",
			args: {
				mpesa_payment: selected_payment,
				customer: customer.value,
			},
		});

		eventBus?.emit("set_mpesa_payment", message);
		dialog.value = false;
	} catch (error) {
		console.error("Failed to submit M-Pesa payment:", error);
		errorMessage.value = __("Unable to submit the selected payment");
	} finally {
		isSubmitting.value = false;
	}
}

function formatCurrency(value) {
	if (value === null || value === undefined) {
		value = 0;
	}
	let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
	if (isNaN(number)) number = 0;
	let prec = 2;
	if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
		prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
	}

	const locale = formatUtils.getNumberLocale();
	let formatted = number.toLocaleString(locale, {
		minimumFractionDigits: prec,
		maximumFractionDigits: prec,
		useGrouping: true,
	});

	formatted = formatUtils.toArabicNumerals(formatted);
	return formatted;
}

onMounted(() => {
	eventBus?.on("open_mpesa_payments", (data) => {
		dialog.value = true;
		full_name.value = "";
		mobile_no.value = "";
		company.value = data.company;
		customer.value = data.customer;
		mode_of_payment.value = data.mode_of_payment;
		dialog_data.value = [];
		selected.value = [];
		errorMessage.value = "";
		isLoading.value = false;
		isSubmitting.value = false;
		hasSearched.value = false;
	});
});

onBeforeUnmount(() => {
	eventBus?.off("open_mpesa_payments");
});
</script>

<style scoped>
.mpesa-dialog-card {
	width: min(800px, calc(100vw - 24px));
	max-height: min(84dvh, 760px);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.mpesa-dialog-card__title,
.mpesa-dialog-card__actions {
	flex: 0 0 auto;
}

.mpesa-dialog-card__icon {
	width: 44px;
	height: 44px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 12px;
	background: linear-gradient(135deg, rgba(25, 118, 210, 0.16), rgba(66, 165, 245, 0.12));
	color: var(--pos-primary);
}

.mpesa-dialog-card__content {
	flex: 1 1 auto;
	overflow-y: auto;
}

.mpesa-results-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-height: 220px;
	padding: 20px 16px;
	border: 1px dashed rgba(148, 163, 184, 0.35);
	border-radius: 18px;
	background: rgba(248, 250, 252, 0.72);
	text-align: center;
}

.mpesa-results-state__title {
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.mpesa-results-state__subtitle {
	max-width: 34ch;
	font-size: 0.9rem;
	color: var(--pos-text-secondary);
}

@media (max-width: 600px) {
	.mpesa-dialog-card {
		width: min(800px, calc(100vw - 16px));
	}
}
</style>
