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
							<v-alert type="error" dense border="start" class="mx-4">
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

<script>
/* global __, frappe */
export default {
	data: () => ({
		dialog: false,
		singleSelect: true,
		selected: [],
		dialog_data: "",
		company: "",
		customer: "",
		mode_of_payment: "",
		full_name: "",
		mobile_no: "",
		isLoading: false,
		isSubmitting: false,
		errorMessage: "",
		headers: [
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
		],
	}),
	computed: {},
	watch: {},
	methods: {
		close_dialog() {
			this.dialog = false;
		},
		search_by_enter(e) {
			if (e.keyCode === 13) {
				this.search();
			}
		},
		async search() {
			if (this.isLoading || this.isSubmitting) {
				return;
			}

			this.errorMessage = "";
			this.isLoading = true;

			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.m_pesa.get_mpesa_draft_payments",
					args: {
						company: this.company,
						mode_of_payment: this.mode_of_payment,
						mobile_no: this.mobile_no,
						full_name: this.full_name,
					},
				});

				this.dialog_data = message;
			} catch (error) {
				console.error("Failed to search M-Pesa payments:", error);
				this.errorMessage = __("Unable to fetch M-Pesa payments");
			} finally {
				this.isLoading = false;
			}
		},
		async submit_dialog() {
			if (this.isSubmitting || this.selected.length === 0) {
				return;
			}

			this.errorMessage = "";
			this.isSubmitting = true;

			try {
				const selected_payment = this.selected[0].name;
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.m_pesa.submit_mpesa_payment",
					args: {
						mpesa_payment: selected_payment,
						customer: this.customer,
					},
				});

				this.eventBus.emit("set_mpesa_payment", message);
				this.dialog = false;
			} catch (error) {
				console.error("Failed to submit M-Pesa payment:", error);
				this.errorMessage = __("Unable to submit the selected payment");
			} finally {
				this.isSubmitting = false;
			}
		},
		formatCurrency(value) {
			return this.$options.mixins[0].methods.formatCurrency.call(this, value, 2);
		},
	},
	created: function () {
		this.eventBus.on("open_mpesa_payments", (data) => {
			this.dialog = true;
			this.full_name = "";
			this.mobile_no = "";
			this.company = data.company;
			this.customer = data.customer;
			this.mode_of_payment = data.mode_of_payment;
			this.dialog_data = "";
			this.selected = [];
			this.errorMessage = "";
			this.isLoading = false;
			this.isSubmitting = false;
		});
	},
	beforeUnmount() {
		this.eventBus.off("open_mpesa_payments");
	},
};
</script>
