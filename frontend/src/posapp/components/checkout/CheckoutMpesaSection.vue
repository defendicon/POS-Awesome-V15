<template>
	<v-row justify="center">
		<v-dialog v-model="dialog" max-width="800px" min-width="800px">
			<v-card>
				<v-card-title>
					<span class="text-h5 text-primary">{{ __("Select Payment") }}</span>
				</v-card-title>
				<v-container>
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
							class="ml-2"
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
					<v-row>
						<v-col cols="12" class="pa-1" v-if="dialog_data">
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
				<v-card-actions class="mt-4">
					<v-spacer></v-spacer>
					<v-btn color="error mx-2" theme="dark" @click="close_dialog">Close</v-btn>
					<v-btn
						v-if="selected.length"
						color="success"
						theme="dark"
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
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { formatUtils } from "../../../format";

defineOptions({
	name: "MpesaPayments",
});

const frappe = window.frappe;
const __ = window.__ || ((text) => text);
const eventBus = inject("eventBus");

const dialog = ref(false);
const selected = ref([]);
const dialog_data = ref("");
const company = ref("");
const customer = ref("");
const mode_of_payment = ref("");
const full_name = ref("");
const mobile_no = ref("");
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref("");

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

async function search() {
	if (isLoading.value || isSubmitting.value) {
		return;
	}

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

		dialog_data.value = message;
	} catch (error) {
		console.error("Failed to search M-Pesa payments:", error);
		errorMessage.value = __("Unable to fetch M-Pesa payments");
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
		dialog_data.value = "";
		selected.value = [];
		errorMessage.value = "";
		isLoading.value = false;
		isSubmitting.value = false;
	});
});

onBeforeUnmount(() => {
	eventBus?.off("open_mpesa_payments");
});
</script>
