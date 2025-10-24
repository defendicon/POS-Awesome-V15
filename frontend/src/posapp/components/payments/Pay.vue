<template>
	<div fluid :class="rtlClasses">
		<v-row v-show="!dialog">
			<v-col md="8" cols="12" class="pb-2 pr-0">
				<v-card
					:class="[
						'main mx-auto mt-3 p-3 pb-16 overflow-y-auto',
						isDarkTheme ? '' : 'bg-grey-lighten-5',
					]"
					:style="isDarkTheme ? 'background-color:#1E1E1E' : ''"
					style="max-height: 94vh; height: 94vh"
				>
					<Customer></Customer>
					<v-divider></v-divider>
					<div>
						<v-row>
							<v-col md="7" cols="12">
								<p>
									<strong>{{ __("Invoices") }}</strong>
									<span v-if="total_outstanding_amount" class="text-primary"
										>{{ __("- Total Outstanding") }} :
										{{ currencySymbol(pos_profile.currency) }}
										{{ formatCurrency(total_outstanding_amount) }}</span
									>
								</p>
							</v-col>
							<v-col md="5" cols="12">
								<p v-if="total_selected_invoices" class="golden--text text-end">
									<span>{{ __("Total Selected :") }}</span>
									<span>
										{{ currencySymbol(pos_profile.currency) }}
										{{ formatCurrency(total_selected_invoices) }}
									</span>
									<small>({{ selected_invoices.length }} invoice(s))</small>
								</p>
							</v-col>
						</v-row>
						<v-row align="center" no-gutters class="mb-1">
							<v-col md="4" cols="12">
								<v-select
									density="compact"
									variant="outlined"
									hide-details
									clearable
									class="dark-field"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									v-model="pos_profile_search"
									:items="pos_profiles_list"
									item-value="name"
									label="Select POS Profile"
								></v-select>
							</v-col>
							<v-col> </v-col>
							<v-col md="3" cols="12">
								<v-btn block color="warning" theme="dark" @click="get_outstanding_invoices">{{
									__("Search")
								}}</v-btn>
							</v-col>
							<v-col md="3" cols="12">
								<v-btn
									v-if="selected_invoices.length"
									block
									color="error"
									theme="dark"
									@click="
										selected_invoices = [];
										$forceUpdate();
									"
									>{{ __("Clear") }}</v-btn
								>
							</v-col>
						</v-row>
						<v-data-table
							:headers="invoices_headers"
							:items="outstanding_invoices"
							item-key="voucher_no"
							class="elevation-1 mt-0"
							:loading="invoices_loading"
							@click:row="selectSingleInvoice"
							:item-class="isSelected"
						>
							<template v-slot:item.actions="{ item }">
								<v-checkbox
									:model-value="isInvoiceSelected(item)"
									color="primary"
									@click.stop="toggleInvoiceSelection(item)"
								>
								</v-checkbox>
							</template>
							<template v-slot:item.invoice_amount="{ item }">
								{{ currencySymbol(item.currency) }}
								{{ formatCurrency(item.invoice_amount) }}
							</template>
							<template v-slot:item.outstanding_amount="{ item }">
								<span class="text-primary"
									>{{ currencySymbol(item?.currency || pos_profile.currency) }}
									{{ formatCurrency(item?.outstanding_amount || 0) }}</span
								>
							</template>
						</v-data-table>
						<v-divider></v-divider>
					</div>
					<div v-if="pos_profile.posa_allow_reconcile_payments && unallocated_payments.length">
						<v-row>
							<v-col md="7" cols="12">
								<p>
									<strong>{{ __("Payments") }}</strong>
									<span v-if="total_unallocated_amount" class="text-primary">
										{{ __("- Total Unallocated") }} :
										{{ currencySymbol(pos_profile.currency) }}
										{{ formatCurrency(total_unallocated_amount) }}
									</span>
								</p>
							</v-col>
							<v-col md="5" cols="12">
								<p v-if="total_selected_payments" class="golden--text text-end">
									<span>{{ __("Total Selected :") }}</span>
									<span>
										{{ currencySymbol(pos_profile.currency) }}
										{{ formatCurrency(total_selected_payments) }}
									</span>
								</p>
							</v-col>
						</v-row>
						<v-data-table
							:headers="unallocated_payments_headers"
							:items="unallocated_payments"
							item-key="name"
							class="elevation-1 mt-0"
							:loading="unallocated_payments_loading"
						>
							<template v-slot:item.select="{ item }">
								<v-checkbox
									v-model="selected_payments"
									:value="item"
									color="primary"
									hide-details
									@click.stop
								></v-checkbox>
							</template>
							<template v-slot:item.paid_amount="{ item }">
								{{ currencySymbol(item.currency) }}
								{{ formatCurrency(item.paid_amount) }}
							</template>
							<template v-slot:item.unallocated_amount="{ item }">
								<span class="text-primary"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.unallocated_amount) }}</span
								>
							</template>
						</v-data-table>
						<v-divider></v-divider>
					</div>
					<div v-if="pos_profile.posa_allow_mpesa_reconcile_payments">
						<v-row>
							<v-col md="8" cols="12">
								<p>
									<span
										><strong>{{ __("Search Mpesa Payments") }}</strong></span
									>
								</p>
							</v-col>
							<v-col md="4" cols="12" v-if="total_selected_mpesa_payments">
								<p class="golden--text text-end">
									<span>{{ __("Total Selected :") }}</span>
									<span>
										{{ currencySymbol(pos_profile.currency) }}
										{{ formatCurrency(total_selected_mpesa_payments) }}
									</span>
								</p>
							</v-col>
						</v-row>
						<v-row align="center" no-gutters class="mb-1">
							<v-col md="4" cols="12" class="mr-1">
								<v-text-field
									density="compact"
									variant="outlined"
									color="primary"
									:label="frappe._('Search by Name')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									class="dark-field"
									v-model="mpesa_search_name"
									clearable
								></v-text-field>
							</v-col>
							<v-col md="4" cols="12" class="mr-1">
								<v-text-field
									density="compact"
									variant="outlined"
									color="primary"
									:label="frappe._('Search by Mobile')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									class="dark-field"
									v-model="mpesa_search_mobile"
									clearable
								></v-text-field>
							</v-col>
							<v-col> </v-col>
							<v-col md="3" cols="12">
								<v-btn
									block
									color="warning"
									theme="dark"
									@click="get_draft_mpesa_payments_register"
									>{{ __("Search") }}</v-btn
								>
							</v-col>
						</v-row>
						<v-data-table
							:headers="mpesa_payment_headers"
							:items="mpesa_payments"
							item-key="name"
							class="elevation-1 mt-0"
							:single-select="singleSelect"
							show-select
							v-model="selected_mpesa_payments"
							:loading="mpesa_payments_loading"
							checkbox-color="primary"
						>
							<template v-slot:item.amount="{ item }">
								<span class="text-primary">
									{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.amount) }}
								</span>
							</template>
						</v-data-table>
					</div>
				</v-card>
			</v-col>
			<v-col md="4" cols="12" class="pb-3">
				<v-card
					:class="['invoices mx-auto mt-3 p-3', isDarkTheme ? '' : 'bg-grey-lighten-5']"
					:style="isDarkTheme ? 'background-color:#1E1E1E' : ''"
					style="max-height: 94vh; height: 94vh"
				>
					<strong>
						<h4 class="text-primary">Totals</h4>
						<v-row>
							<v-col md="7" class="mt-1">
								<span>{{ __("Total Invoices:") }}</span>
							</v-col>
							<v-col md="5">
								<v-text-field
									class="p-0 m-0 dark-field"
									density="compact"
									color="primary"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									:model-value="formatCurrency(total_selected_invoices)"
									readonly
									flat
									:prefix="currencySymbol(pos_profile.currency)"
								></v-text-field>
								<small v-if="selected_invoices.length" class="text-primary"
									>{{ selected_invoices.length }} invoice(s) selected</small
								>
							</v-col>
						</v-row>

						<v-row v-if="total_selected_payments">
							<v-col md="7" class="mt-1"
								><span>{{ __("Total Payments:") }}</span></v-col
							>
							<v-col md="5">
								<v-text-field
									class="p-0 m-0 dark-field"
									density="compact"
									color="primary"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									:model-value="formatCurrency(total_selected_payments)"
									readonly
									flat
									:prefix="currencySymbol(pos_profile.currency)"
								></v-text-field>
							</v-col>
						</v-row>

						<v-row v-if="total_selected_mpesa_payments">
							<v-col md="7" class="mt-1"
								><span>{{ __("Total Mpesa:") }}</span></v-col
							>
							<v-col md="5">
								<v-text-field
									class="p-0 m-0 dark-field"
									density="compact"
									color="primary"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									:model-value="formatCurrency(total_selected_mpesa_payments)"
									readonly
									flat
									:prefix="currencySymbol(pos_profile.currency)"
								></v-text-field>
							</v-col>
						</v-row>

						<v-divider v-if="payment_methods.length"></v-divider>
						<div v-if="pos_profile.posa_allow_make_new_payments">
							<h4 class="text-primary">Make New Payment</h4>
							<v-row
								v-if="payment_methods.length"
								v-for="method in payment_methods"
								:key="method.row_id"
							>
								<v-col md="7"
									><span class="mt-1">{{ __(method.mode_of_payment) }}:</span>
								</v-col>
								<v-col md="5">
									<div class="d-flex align-center">
										<div class="mr-1 text-primary">
											{{ currencySymbol(pos_profile.currency) }}
										</div>
										<v-text-field
											class="p-0 m-0 dark-field"
											density="compact"
											color="primary"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											hide-details
											v-model="method.amount"
											type="number"
											flat
											@input="$forceUpdate()"
										></v-text-field>
									</div>
								</v-col>
							</v-row>
						</div>

						<v-divider></v-divider>
						<v-row>
							<v-col md="7">
								<h4 class="text-primary mt-1">{{ __("Difference:") }}</h4>
							</v-col>
							<v-col md="5">
								<v-text-field
									class="p-0 m-0 dark-field"
									density="compact"
									color="primary"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									:model-value="formatCurrency(total_of_diff)"
									readonly
									flat
									:prefix="currencySymbol(pos_profile.currency)"
								></v-text-field>
							</v-col>
						</v-row>
					</strong>
					<div class="pb-6 pr-6" style="position: absolute; bottom: 0; width: 100%">
						<v-row>
							<v-col cols="6" class="pr-1">
								<v-btn
									block
									size="large"
									color="primary"
									theme="dark"
									@click="submit"
									:disabled="vaildatPayment || isSubmitting"
									:loading="isSubmitting"
								>
									{{ __("Submit") }}
								</v-btn>
							</v-col>
							<v-col cols="6" class="pl-1">
								<v-btn
									block
									size="large"
									color="success"
									theme="dark"
									@click="submit_and_print()"
									:disabled="vaildatPayment || isSubmitting"
									:loading="isSubmitting"
								>
									{{ __("Submit & Print") }}
								</v-btn>
							</v-col>
						</v-row>
					</div>
				</v-card>
			</v-col>
		</v-row>
	</div>
</template>

<script>
import format from "../../format";
import Customer from "../pos/Customer.vue";
import UpdateCustomer from "../pos/UpdateCustomer.vue";
import {
    getOpeningStorage,
    setOpeningStorage,
    initPromise,
    checkDbHealth,
    saveOfflinePayment,
    syncOfflinePayments,
    getPendingOfflinePaymentCount,
    isOffline,
    getCustomerStorage,
    getOfflineCustomers,
} from "../../../offline/index.js";
import { silentPrint } from "../../plugins/print.js";
import { useRtl } from "../../composables/useRtl.js";

export default {
    mixins: [format],
    setup() {
        const { isRtl, rtlStyles, rtlClasses } = useRtl();
        return {
            isRtl,
            rtlStyles,
            rtlClasses
        };
    },
    data: function () {
        return {
            dialog: false,
            pos_profile: "",
            pos_opening_shift: "",
            customer_name: "",
            customer_info: "",
            company: "",
            singleSelect: true,
            invoices_loading: false,
            unallocated_payments_loading: false,
            mpesa_payments_loading: false,
            payment_methods: [],
            outstanding_invoices: [],
            unallocated_payments: [],
            mpesa_payments: [],
            selected_invoices: [],
            selected_payments: [],
            selected_mpesa_payments: [],
            pos_profiles_list: [],
            pos_profile_search: "",
            payment_methods_list: [],
            mpesa_search_name: "",
            mpesa_search_mobile: "",
            invoices_headers: [
                {
                    title: "",
                    align: "start",
                    sortable: false,
                    key: "actions",
                    width: "50px",
                },
                {
                    title: __("Invoice"),
                    align: "start",
                    sortable: true,
                    key: "voucher_no",
                },
                {
                    title: __("Customer"),
                    align: "start",
                    sortable: true,
                    key: "customer_name",
                },
                {
                    title: __("Date"),
                    align: "start",
                    sortable: true,
                    key: "posting_date",
                },
                {
                    title: __("Due Date"),
                    align: "start",
                    sortable: true,
                    key: "due_date",
                },
                {
                    title: __("Total"),
                    align: "end",
                    sortable: true,
                    key: "invoice_amount",
                },
                {
                    title: __("Outstanding"),
                    align: "end",
                    sortable: true,
                    key: "outstanding_amount",
                },
            ],
            unallocated_payments_headers: [
                {
                    title: "",
                    align: "center",
                    sortable: false,
                    key: "select",
                    width: "50px",
                },
                {
                    title: __("Payment ID"),
                    align: "start",
                    sortable: true,
                    key: "name",
                },
                {
                    title: __("Customer"),
                    align: "start",
                    sortable: true,
                    key: "customer_name",
                },
                {
                    title: __("Date"),
                    align: "start",
                    sortable: true,
                    key: "posting_date",
                },
                {
                    title: __("Mode"),
                    align: "start",
                    sortable: true,
                    key: "mode_of_payment",
                },
                {
                    title: __("Paid"),
                    align: "end",
                    sortable: true,
                    key: "paid_amount",
                },
                {
                    title: __("Unallocated"),
                    align: "end",
                    sortable: true,
                    key: "unallocated_amount",
                },
            ],
            mpesa_payment_headers: [
                {
                    title: __("Payment ID"),
                    align: "start",
                    sortable: true,
                    key: "transid",
                },
                {
                    title: __("Full Name"),
                    align: "start",
                    sortable: true,
                    key: "full_name",
                },
                {
                    title: __("Nobile Number"),
                    align: "start",
                    sortable: true,
                    key: "mobile_no",
                },
                {
                    title: __("Date"),
                    align: "start",
                    sortable: true,
                    key: "posting_date",
                },
                {
                    title: __("Amount"),
                    align: "end",
                    sortable: true,
                    key: "amount",
                },
            ],
            isSubmitting: false,
        };
    },

    components: {
        Customer,
        UpdateCustomer,
    },

    methods: {
        async check_opening_entry() {
            var vm = this;
            await initPromise;
            await checkDbHealth();
            return frappe
                .call("posawesome.posawesome.api.shifts.check_opening_shift", {
                    user: frappe.session.user,
                })
                .then((r) => {
                    if (r.message) {
                        this.pos_profile = r.message.pos_profile;
                        this.pos_opening_shift = r.message.pos_opening_shift;
                        this.company = r.message.company.name;
                        vm.eventBus.emit("payments_register_pos_profile", r.message);
                        vm.eventBus.emit("set_company", r.message.company);
                        this.set_payment_methods();
                        try {
                            setOpeningStorage(r.message);
                        } catch (e) {
                            console.error("Failed to cache opening data", e);
                        }

                        // Initialize pos_profile_search as empty
                        this.pos_profile_search = "";

                        // Initialize the dropdown list with profiles but don't select any
                        this.pos_profiles_list = [];
                        // Add current profile to the list but don't select it
                        if (r.message.pos_profile && r.message.pos_profile.name) {
                            this.pos_profiles_list.push(r.message.pos_profile.name);
                        }

                        this.payment_methods_list = [];
                        this.pos_profile.payments.forEach((element) => {
                            this.payment_methods_list.push(element.mode_of_payment);
                        });
                        this.get_available_pos_profiles();
                        this.get_outstanding_invoices();
                        this.get_draft_mpesa_payments_register();
                    } else {
                        const data = getOpeningStorage();
                        if (data) {
                            this.pos_profile = data.pos_profile;
                            this.pos_opening_shift = data.pos_opening_shift;
                            this.company = data.company.name;
                            vm.eventBus.emit("payments_register_pos_profile", data);
                            vm.eventBus.emit("set_company", data.company);
                            this.set_payment_methods();
                            this.payment_methods_list = [];
                            this.pos_profile.payments.forEach((element) => {
                                this.payment_methods_list.push(element.mode_of_payment);
                            });
                            this.get_available_pos_profiles();
                            this.get_outstanding_invoices();
                            this.get_draft_mpesa_payments_register();
                            return;
                        }
                        this.create_opening_voucher();
                    }
                })
                .catch(() => {
                    const data = getOpeningStorage();
                    if (data) {
                        this.pos_profile = data.pos_profile;
                        this.pos_opening_shift = data.pos_opening_shift;
                        this.company = data.company.name;
                        vm.eventBus.emit("payments_register_pos_profile", data);
                        vm.eventBus.emit("set_company", data.company);
                        this.set_payment_methods();
                        this.payment_methods_list = [];
                        this.pos_profile.payments.forEach((element) => {
                            this.payment_methods_list.push(element.mode_of_payment);
                        });
                        this.get_available_pos_profiles();
                        this.get_outstanding_invoices();
                        this.get_draft_mpesa_payments_register();
                        return;
                    }
                    this.create_opening_voucher();
                });
        },
        get_available_pos_profiles() {
            if (!this.pos_profile.posa_allow_mpesa_reconcile_payments) return;
            return frappe
                .call("posawesome.posawesome.api.payment_entry.get_available_pos_profiles", {
                    company: this.company,
                    currency: this.pos_profile.currency,
                })
                .then((r) => {
                    if (r.message) {
                        this.pos_profiles_list = r.message;
                    }
                });
        },
        create_opening_voucher() {
            this.dialog = true;
        },
        async fetch_customer_details() {
            var vm = this;
            if (!this.customer_name) return;

            // When offline, attempt to load details from cached customers
            if (isOffline()) {
                try {
                    const cached = (getCustomerStorage() || []).find(
                        (c) => c.name === vm.customer_name || c.customer_name === vm.customer_name,
                    );
                    if (cached) {
                        vm.customer_info = { ...cached };
                        vm.set_mpesa_search_params();
                        vm.eventBus.emit("set_customer_info_to_edit", vm.customer_info);
                        return;
                    }
                    const queued = (getOfflineCustomers() || [])
                        .map((e) => e.args)
                        .find((c) => c.customer_name === vm.customer_name);
                    if (queued) {
                        vm.customer_info = { ...queued, name: queued.customer_name };
                        vm.set_mpesa_search_params();
                        vm.eventBus.emit("set_customer_info_to_edit", vm.customer_info);
                    }
                } catch (error) {
                    console.error("Failed to fetch cached customer", error);
                }
                return;
            }

            try {
                                const r = await frappe.call({
                                        method: "posawesome.posawesome.api.customers.get_customer_info",
                                        args: {
                                                customer: vm.customer_name,
                                        },
                                });
				const message = r.message;
				if (!r.exc) {
					vm.customer_info = {
						...message,
					};
					vm.set_mpesa_search_params();
					vm.eventBus.emit("set_customer_info_to_edit", vm.customer_info);
				}
			} catch (error) {
				console.error("Failed to fetch customer details", error);
			}
		},
		onInvoiceSelected(event) {
			if (event && event.item && event.item.customer) {
				this.eventBus.emit("set_customer", event.item.customer);
				// Force UI to update total calculations
				this.$nextTick(() => {
					this.$forceUpdate();
				});
			}
		},
		get_outstanding_invoices() {
			this.invoices_loading = true;
			// Reset selection completely
			this.selected_invoices = [];

			if (isOffline()) {
				this.outstanding_invoices = [];
				this.invoices_loading = false;
				return;
			}

			return frappe
				.call("posawesome.posawesome.api.payment_entry.get_outstanding_invoices", {
					customer: this.customer_name,
					company: this.company,
					currency: this.pos_profile.currency,
					pos_profile: this.pos_profile_search || null,
				})
				.then((r) => {
					if (r.message) {
						this.outstanding_invoices = r.message;
						this.invoices_loading = false;
						// Force refresh UI after data is loaded
						this.$nextTick(() => {
							this.$forceUpdate();
						});
					}
				});
		},
		get_unallocated_payments() {
			if (!this.pos_profile.posa_allow_reconcile_payments) return;
			this.unallocated_payments_loading = true;
			if (!this.customer_name) {
				this.unallocated_payments = [];
				this.unallocated_payments_loading = false;
				return;
			}

			if (isOffline()) {
				this.unallocated_payments = [];
				this.unallocated_payments_loading = false;
				return;
			}
			return frappe
				.call("posawesome.posawesome.api.payment_entry.get_unallocated_payments", {
					customer: this.customer_name,
					company: this.company,
					currency: this.pos_profile.currency,
				})
				.then((r) => {
					if (r.message) {
						this.unallocated_payments = r.message;
						this.unallocated_payments_loading = false;
					}
				});
		},
		set_mpesa_search_params() {
			if (!this.pos_profile.posa_allow_mpesa_reconcile_payments) return;
			if (!this.customer_name) return;
			this.mpesa_search_name = this.customer_info.customer_name.split(" ")[0];
			if (this.customer_info.mobile_no) {
				this.mpesa_search_mobile =
					this.customer_info.mobile_no.substring(0, 4) +
					" ***** " +
					this.customer_info.mobile_no.substring(9);
			}
		},
		get_draft_mpesa_payments_register() {
			if (!this.pos_profile.posa_allow_mpesa_reconcile_payments) return;
			const vm = this;
			this.mpesa_payments_loading = true;

			if (isOffline()) {
				this.mpesa_payments = [];
				this.mpesa_payments_loading = false;
				return;
			}
			return frappe
				.call("posawesome.posawesome.api.m_pesa.get_mpesa_draft_payments", {
					company: vm.company,
					mode_of_payment: null,
					full_name: vm.mpesa_search_name || null,
					mobile_no: vm.mpesa_search_mobile || null,
					payment_methods_list: vm.payment_methods_list,
				})
				.then((r) => {
					if (r.message) {
						vm.mpesa_payments = r.message;
					} else {
						vm.mpesa_payments = [];
					}
					vm.mpesa_payments_loading = false;
				});
		},
		set_payment_methods() {
			// get payment methods from pos profile
			if (!this.pos_profile.posa_allow_make_new_payments) return;
			this.payment_methods = [];
			this.pos_profile.payments.forEach((method) => {
				this.payment_methods.push({
					mode_of_payment: method.mode_of_payment,
					amount: 0,
					row_id: method.name,
				});
			});
		},
		clear_all(with_customer_info = true) {
			this.customer_name = "";
			if (with_customer_info) {
				this.customer_info = "";
			}
			this.mpesa_search_mobile = "";
			this.mpesa_search_name = "";
			this.mpesa_payments = [];
			this.selected_mpesa_payments = [];
			this.outstanding_invoices = [];
			this.unallocated_payments = [];
			this.selected_invoices = [];
			this.selected_payments = [];
			this.selected_mpesa_payments = [];
			this.set_payment_methods();
		},
		submit() {
			if (this.isSubmitting) return;
			this.isSubmitting = true;
			const customer = this.customer_name;
			const vm = this;

			if (!customer) {
				this.isSubmitting = false;
				frappe.throw(__("Please select a customer"));
				return;
			}

			// Check if we have selected invoices
			if (this.selected_invoices.length == 0) {
				this.isSubmitting = false;
				frappe.throw(__("Please select an invoice"));
				return;
			}

			// Calculate payment values
			let total_payments =
				this.total_selected_payments +
				this.total_selected_mpesa_payments +
				this.total_payment_methods;

			if (total_payments <= 0) {
				this.isSubmitting = false;
				frappe.throw(__("Please make a payment or select an payment"));
				return;
			}

			this.payment_methods.forEach((payment) => {
				payment.amount = flt(payment.amount);
			});

			const payload = {};
			payload.customer = customer;
			payload.company = this.company;
			payload.currency = this.pos_profile.currency;
			payload.pos_opening_shift_name = this.pos_opening_shift.name;
			payload.pos_profile_name = this.pos_profile.name;
			payload.pos_profile = this.pos_profile;
			payload.payment_methods = this.payment_methods;
			payload.selected_invoices = this.selected_invoices;
			payload.selected_payments = this.selected_payments;
			payload.total_selected_invoices = flt(this.total_selected_invoices);
			payload.selected_mpesa_payments = this.selected_mpesa_payments;
			payload.total_selected_payments = flt(this.total_selected_payments);
			payload.total_payment_methods = flt(this.total_payment_methods);
			payload.total_selected_mpesa_payments = flt(this.total_selected_mpesa_payments);

			if (isOffline()) {
				try {
					saveOfflinePayment({ args: { payload } });
					vm.eventBus.emit("show_message", {
						title: __("Payment saved offline"),
						color: "warning",
					});
					vm.clear_all(false);
					vm.customer_name = customer;
					vm.get_outstanding_invoices();
					vm.get_unallocated_payments();
					vm.set_mpesa_search_params();
					vm.get_draft_mpesa_payments_register();
				} catch (error) {
					frappe.msgprint(
						__("Cannot Save Offline Payment: ") + (error.message || __("Unknown error")),
					);
				}
				vm.isSubmitting = false;
				return;
			}

			frappe.call({
				method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
				args: { payload },
				freeze: true,
				freeze_message: __("Processing Payment"),
				callback: function (r) {
					vm.isSubmitting = false;
					if (r.message) {
						frappe.utils.play_sound("submit");
						vm.clear_all(false);
						vm.customer_name = customer;
						vm.get_outstanding_invoices();
						vm.get_unallocated_payments();
						vm.set_mpesa_search_params();
						vm.get_draft_mpesa_payments_register();
					}
				},
				error: function () {
					vm.isSubmitting = false;
				},
			});
		},
		submit_and_print() {
			if (this.isSubmitting) return;
			this.isSubmitting = true;
			const customer = this.customer_name;
			const vm = this;
			if (!customer) {
				this.isSubmitting = false;
				frappe.throw(__("Please select a customer"));
				return;
			}

			// Check if we have selected invoices
			if (this.selected_invoices.length == 0) {
				this.isSubmitting = false;
				frappe.throw(__("Please select an invoice"));
				return;
			}

			// Calculate payment values
			let total_payments =
				this.total_selected_payments +
				this.total_selected_mpesa_payments +
				this.total_payment_methods;

			if (total_payments <= 0) {
				this.isSubmitting = false;
				frappe.throw(__("Please make a payment or select an payment"));
				return;
			}

			this.payment_methods.forEach((payment) => {
				payment.amount = flt(payment.amount);
			});

			const payload = {};
			payload.customer = customer;
			payload.company = this.company;
			payload.currency = this.pos_profile.currency;
			payload.pos_opening_shift_name = this.pos_opening_shift.name;
			payload.pos_profile_name = this.pos_profile.name;
			payload.pos_profile = this.pos_profile;
			payload.payment_methods = this.payment_methods;
			payload.selected_invoices = this.selected_invoices;
			payload.selected_payments = this.selected_payments;
			payload.total_selected_invoices = flt(this.total_selected_invoices);
			payload.selected_mpesa_payments = this.selected_mpesa_payments;
			payload.total_selected_payments = flt(this.total_selected_payments);
			payload.total_payment_methods = flt(this.total_payment_methods);
			payload.total_selected_mpesa_payments = flt(this.total_selected_mpesa_payments);

			if (isOffline()) {
				try {
					saveOfflinePayment({ args: { payload } });
					vm.eventBus.emit("show_message", {
						title: __("Payment saved offline"),
						color: "warning",
					});
					vm.clear_all(false);
					vm.customer_name = customer;
					vm.get_outstanding_invoices();
					vm.get_unallocated_payments();
					vm.set_mpesa_search_params();
					vm.get_draft_mpesa_payments_register();
				} catch (error) {
					frappe.msgprint(
						__("Cannot Save Offline Payment: ") + (error.message || __("Unknown error")),
					);
				}
				vm.isSubmitting = false;
				return;
			}

			frappe.call({
				method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
				args: { payload },
				freeze: true,
				freeze_message: __("Processing Payment"),
				callback: function (r) {
					vm.isSubmitting = false;
					if (r.message) {
						console.log("Server response:", JSON.stringify(r.message));
						frappe.utils.play_sound("submit");

						// Extract payment name from server response
						const payment_name =
							r.message.new_payments_entry && r.message.new_payments_entry.length > 0
								? r.message.new_payments_entry[0].name
								: null;

						if (payment_name) {
							console.log("Opening print view with payment name:", payment_name);
							vm.load_print_page(payment_name);
						} else {
							console.log("No payment_name found in response");
							frappe.msgprint(
								__(
									"Payment submitted but print function could not be executed. Payment name not found.",
								),
							);
						}
						vm.clear_all(false);
						vm.customer_name = customer;
						vm.get_outstanding_invoices();
						vm.get_unallocated_payments();
						vm.set_mpesa_search_params();
						vm.get_draft_mpesa_payments_register();
					}
				},
				error: function () {
					vm.isSubmitting = false;
				},
			});
		},
		selectSingleInvoice(item) {
			console.log("Row clicked:", item);
			if (item) {
				this.toggleInvoiceSelection(item);
			}
		},
		isInvoiceSelected(item) {
			return this.selected_invoices.some((i) => i.voucher_no === item.voucher_no);
		},
		toggleInvoiceSelection(item) {
			if (this.isInvoiceSelected(item)) {
				// If already selected, unselect it
				this.selected_invoices = this.selected_invoices.filter(
					(i) => i.voucher_no !== item.voucher_no,
				);
			} else {
				// Add this invoice to selection - support multiple selection
				this.selected_invoices.push(item);

				if (item.customer && !this.customer_name) {
					this.eventBus.emit("set_customer", item.customer);
				}
			}

			// Force UI update
			this.$nextTick(() => {
				console.log("Selected invoices:", this.selected_invoices);
				console.log("Total selected amount:", this.total_selected_invoices);
				this.$forceUpdate();
			});
		},
		isSelected(item) {
			return this.isInvoiceSelected(item) ? "selected-row bg-primary bg-lighten-4" : "";
		},

		load_print_page(payment_name) {
			if (!payment_name) {
				frappe.msgprint(__("Payment name not found. Cannot open print view."));
				return;
			}

			const doctype = "Payment Entry";
			const docname = payment_name;
			const print_format = this.pos_profile.payment_entry_print_format;
			const letter_head = this.pos_profile.letter_head || 0;
			const lang_code = frappe.boot.lang;

			if (this.pos_profile.qz_printing) {
				this._print_via_qz(doctype, docname, print_format, letter_head, lang_code);
				console.log("Attempting QZ print from Pay.vue");
			} else {
				this._print_regular(doctype, docname, print_format, letter_head);
				console.log("Printing via regular method from Pay.vue");
			}
		},

		/**
         * Load QZ Tray library from local file with CDN fallback
         * QZ Tray library (v2.2.2) is stored locally at /assets/posawesome/js/qz-tray.js
         * This ensures printing functionality works even without internet connection
         */
        _load_qz_library() {
            return new Promise((resolve, reject) => {
                if (typeof qz !== "undefined") {
                    console.log("QZ library already loaded");
                    resolve();
                    return;
                }

                console.log("Loading QZ library from local file...");
                const script = document.createElement("script");
                // Load from local file instead of CDN
                script.src = "/assets/posawesome/js/qz-tray.js";
                script.onload = () => {
                    console.log("QZ library script loaded from local file");
                    // Wait a bit for the library to initialize
                    setTimeout(() => {
                        if (typeof qz !== "undefined") {
                            console.log("QZ library initialized successfully from local file");
                            resolve();
                        } else {
                            console.error("QZ library loaded from local file but qz object not available");
                            reject(new Error("QZ library loaded but qz object not available"));
                        }
                    }, 1000);
                };
                script.onerror = (error) => {
                    console.error("Failed to load QZ library from local file:", error);
                    console.log("Trying CDN fallback...");
                    
                    // Remove the failed script element
                    document.head.removeChild(script);
                    
                    // Create new script element for CDN fallback
                    const fallbackScript = document.createElement("script");
                    fallbackScript.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.2/qz-tray.js";
                    fallbackScript.onload = () => {
                        console.log("QZ library script loaded from CDN fallback");
                        setTimeout(() => {
                            if (typeof qz !== "undefined") {
                                console.log("QZ library initialized successfully from CDN");
                                resolve();
                            } else {
                                console.error("QZ library loaded from CDN but qz object not available");
                                reject(new Error("QZ library loaded but qz object not available"));
                            }
                        }, 1000);
                    };
                    fallbackScript.onerror = (fallbackError) => {
                        console.error("Failed to load QZ library from CDN:", fallbackError);
                        reject(new Error("Failed to load QZ library script from both local file and CDN"));
                    };
                    document.head.appendChild(fallbackScript);
                };
                document.head.appendChild(script);
            });
        },

        _print_regular(doctype, docname, print_format, letter_head) {
            const url =
                frappe.urllib.get_base_url() +
                "/printview?doctype=" +
                encodeURIComponent(doctype) +
                "&name=" +
                docname +
                "&trigger_print=1" +
                "&format=" +
                print_format +
                "&no_letterhead=" +
                letter_head;

            if (this.pos_profile?.posa_silent_print) {
                silentPrint(url);
            } else {
                window.open(url, "_blank");
            }
        },

        async _print_via_qz(doctype, docname, print_format, letter_head, lang_code) {
            // Check if QZ library is loaded, if not, load it
            if (typeof qz === "undefined") {
                try {
                    await this._load_qz_library();
                } catch (error) {
                    frappe.show_alert({
                        message: __(
                            "QZ Tray library could not be loaded. Please ensure QZ Tray is installed and running.",
                        ),
                        indicator: "orange",
                    });
                    this._print_regular(doctype, docname, print_format, letter_head);
                    return;
                }
            }

            try {
                const print_format_printer_map = this._get_print_format_printer_map();
                const mapped_printer = this._get_mapped_printer(print_format_printer_map, doctype, print_format);

                if (mapped_printer.length === 1) {
                    await this._print_with_mapped_printer(
                        doctype,
                        docname,
                        print_format,
                        letter_head,
                        lang_code,
                        mapped_printer[0],
                    );
                } else if (await this._is_raw_printing(print_format)) {
                    frappe.show_alert(
                        {
                            message: __("Printer mapping not set."),
                            subtitle: __(
                                "Please set a printer mapping for this print format in the Printer Settings",
                            ),
                            indicator: "warning",
                        },
                        14,
                    );
                    await this._printer_setting_dialog(doctype, print_format, docname, letter_head, lang_code);
                } else {
                    this._print_regular(doctype, docname, print_format, letter_head);
                }
            } catch (error) {
                console.error("QZ printing failed:", error);
                frappe.show_alert({
                    message: __("QZ printing failed, using regular print."),
                    indicator: "orange",
                });
                this._print_regular(doctype, docname, print_format, letter_head);
            }
        },

        async _print_with_mapped_printer(doctype, docname, print_format, letter_head, lang_code, printer_map) {
            if (await this._is_raw_printing(print_format)) {
                try {
                    // Check if QZ Tray is already connected before attempting to connect
                    if (!qz.websocket.isActive()) {
                        await qz.websocket.connect();
                    }
                    
                    // Get raw commands
                    const rawCommands = await this._get_raw_commands(doctype, docname, print_format, lang_code);
                    
                    // Create config and print using QZ Tray
                    const config = qz.configs.create(printer_map.printer);
                    const data = [rawCommands];
                    await qz.print(config, data);
                    
                    frappe.show_alert({
                        message: __("Print job sent successfully"),
                        indicator: "green"
                    });
                } catch (error) {
                    console.error("QZ Raw printing failed:", error);
                    frappe.show_alert({
                        message: __("QZ Raw printing failed: ") + error.message,
                        indicator: "red"
                    });
                    this._print_regular(doctype, docname, print_format, letter_head);
                }
            } else {
                try {
                    // Check if QZ Tray is already connected before attempting to connect
                    if (!qz.websocket.isActive()) {
                        await qz.websocket.connect();
                    }
                    
                    // Get PDF URL
                    const url = frappe.urllib.get_base_url() +
                        "/printview?doctype=" +
                        encodeURIComponent(doctype) +
                        "&name=" +
                        docname +
                        "&format=" +
                        print_format +
                        "&no_letterhead=" +
                        letter_head;
                    
                    // Print PDF using QZ Tray
                    const config = qz.configs.create(printer_map.printer);
                    const data = [{
                        type: 'pixel',
                        format: 'pdf',
                        flavor: 'file',
                        data: url
                    }];
                    await qz.print(config, data);
                    
                    frappe.show_alert({
                        message: __("Print job sent successfully"),
                        indicator: "green"
                    });
                } catch (error) {
                    console.error("QZ PDF printing failed:", error);
                    frappe.show_alert({
                        message: __("QZ PDF printing failed: ") + error.message,
                        indicator: "red"
                    });
                    this._print_regular(doctype, docname, print_format, letter_head);
                }
            }
        },

        async _get_raw_commands(doctype, docname, print_format, lang_code) {
            return new Promise((resolve, reject) => {
                // First ensure we have the document by fetching from server
                frappe.db
                    .get_doc(doctype, docname)
                    .then((doc) => {
                        if (!doc || !doc.name) {
                            reject(new Error("Document not found for printing"));
                            return;
                        }

                        frappe.call({
                            method: "frappe.www.printview.get_rendered_raw_commands",
                            args: {
                                doc: JSON.stringify(doc),
                                print_format: print_format,
                                _lang: lang_code,
                            },
                            callback: (r) => {
                                if (!r.exc && r.message) {
                                    resolve(r.message.raw_commands);
                                } else {
                                    reject(new Error(r.exc || "Failed to get raw commands"));
                                }
                            },
                            error: (err) => {
                                reject(err);
                            }
                        });
                    })
                    .catch((error) => {
                        reject(new Error("Error loading document for printing"));
                    });
            });
        },

        async _is_raw_printing(format) {
            // Try to get from locals first
            let print_format = {};
            if (locals?.["Print Format"]?.[format]) {
                print_format = locals["Print Format"][format];
                return print_format.raw_printing === 1;
            }

            // If not in locals, try to fetch from server
            try {
                const { message } = await frappe.db.get_value("Print Format", format, "raw_printing");
                return message?.raw_printing === 1;
            } catch (err) {
                return false;
            }
        },

        _get_print_format_printer_map() {
            try {
                return JSON.parse(localStorage.print_format_printer_map || "{}");
            } catch (e) {
                return {};
            }
        },

        _get_mapped_printer(print_format_printer_map, doctype, print_format) {
            if (print_format_printer_map[doctype]) {
                return print_format_printer_map[doctype].filter(
                    (printer_map) => printer_map.print_format === print_format
                );
            }
            return [];
        },

        async _get_print_format_options(doctype) {
            return new Promise((resolve) => {
                // Try to get print formats from meta first
                try {
                    let formats = frappe.meta.get_print_formats(doctype);
                    if (formats && Array.isArray(formats) && formats.length > 2) {
                        resolve(formats);
                        return;
                    }
                } catch (error) {
                    console.warn("Error getting print formats from meta:", error);
                }

                // Try to get from frappe.boot if available
                if (frappe.boot && frappe.boot.print_formats && frappe.boot.print_formats[doctype]) {
                    let formats = frappe.boot.print_formats[doctype];
                    if (formats && formats.length > 2) {
                        resolve(formats);
                        return;
                    }
                }

                // Fetch print formats specifically for this doctype from database
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Print Format",
                        fields: ["name", "print_format_type", "disabled"],
                        filters: [
                            ["doc_type", "=", doctype],
                            ["disabled", "=", 0]
                        ],
                        order_by: "name"
                    },
                    callback: (r) => {
                        let formats = ["Standard"]; // Always include Standard
                        
                        if (r.message && r.message.length > 0) {
                            // Add all enabled print formats for this specific doctype
                            const custom_formats = r.message.map(format => format.name);
                            formats = formats.concat(custom_formats);
                        }
                        
                        // Add some common fallback formats if none found
                        if (formats.length <= 1) {
                            if (doctype === "Payment Entry") {
                                formats.push("Payment Entry Print");
                            }
                        }
                        
                        // Remove duplicates and return
                        formats = [...new Set(formats)];
                        resolve(formats);
                    },
                    error: () => {
                        // Final fallback based on doctype
                        const fallbackFormats = ["Standard"];
                        if (doctype === "Payment Entry") {
                            fallbackFormats.push("Payment Entry Print");
                        }
                        resolve(fallbackFormats);
                    }
                });
            });
        },

        async _get_printer_list() {
            try {
                // Check if QZ Tray is already connected
                if (!qz.websocket.isActive()) {
                    await qz.websocket.connect();
                }
                return await qz.printers.find();
            } catch (error) {
                console.error("Failed to get printer list:", error);
                throw error;
            }
        },

        async _printer_setting_dialog(doctype, current_print_format, docname, letter_head, lang_code) {
            // Show loading message
            const loading_dialog = frappe.show_alert({
                message: __("Loading print formats and printers..."),
                indicator: 'blue'
            });

            try {
                const [printer_list, print_format_options] = await Promise.all([
                    this._get_printer_list(),
                    this._get_print_format_options(doctype)
                ]);

                // Hide loading message
                if (loading_dialog) loading_dialog.hide();

                if (!(printer_list && printer_list.length)) {
                    frappe.throw(__("No Printer is Available."));
                    return;
                }

                const print_format_printer_map = this._get_print_format_printer_map();
                let data = print_format_printer_map[doctype] || [];

                const dialog = new frappe.ui.Dialog({
                    title: __("Printer Settings"),
                    fields: [
                        {
                            fieldtype: "Section Break",
                        },
                        {
                            fieldname: "printer_mapping",
                            fieldtype: "Table",
                            label: __("Printer Mapping"),
                            in_place_edit: true,
                            data: data,
                            get_data: () => {
                                return data;
                            },
                            fields: [
                                {
                                    fieldtype: "Select",
                                    fieldname: "print_format",
                                    default: 0,
                                    options: print_format_options,
                                    read_only: 0,
                                    in_list_view: 1,
                                    label: __("Print Format"),
                                },
                                {
                                    fieldtype: "Select",
                                    fieldname: "printer",
                                    default: 0,
                                    options: printer_list,
                                    read_only: 0,
                                    in_list_view: 1,
                                    label: __("Printer"),
                                },
                            ],
                        },
                    ],
                    primary_action: () => {
                        let printer_mapping = dialog.get_values()["printer_mapping"];
                        if (printer_mapping && printer_mapping.length) {
                            let print_format_list = printer_mapping.map((a) => a.print_format);
                            let has_duplicate = print_format_list.some(
                                (item, idx) => print_format_list.indexOf(item) != idx,
                            );
                            if (has_duplicate) {
                                frappe.throw(
                                    __("Cannot have multiple printers mapped to a single print format."),
                                );
                                return;
                            }
                        } else {
                            printer_mapping = [];
                        }

                        let saved_print_format_printer_map = this._get_print_format_printer_map();
                        saved_print_format_printer_map[doctype] = printer_mapping;
                        localStorage.print_format_printer_map = JSON.stringify(saved_print_format_printer_map);

                        dialog.hide();

                        // Try printing again with the new settings
                        this._print_via_qz(doctype, docname, current_print_format, letter_head, lang_code);
                    },
                    primary_action_label: __("Save"),
                });

                dialog.show();
            } catch (error) {
                // Hide loading message
                if (loading_dialog) loading_dialog.hide();
                
                frappe.show_alert({
                    message: __("Error loading printer settings: ") + (error.message || error),
                    indicator: 'red'
                });
            }
        },

        // ...existing methods...
    },

    computed: {
		total_outstanding_amount() {
			if (!this.outstanding_invoices || !this.outstanding_invoices.length) return 0;
			return this.outstanding_invoices.reduce((acc, cur) => acc + flt(cur?.outstanding_amount || 0), 0);
		},
		total_unallocated_amount() {
			if (!this.unallocated_payments || !this.unallocated_payments.length) return 0;
			return this.unallocated_payments.reduce((acc, cur) => acc + flt(cur?.unallocated_amount || 0), 0);
		},
		total_selected_invoices() {
			if (!this.selected_invoices || !this.selected_invoices.length) {
				console.log("No selected invoices");
				return 0;
			}
			const total = this.selected_invoices.reduce(
				(acc, cur) => acc + flt(cur?.outstanding_amount || 0),
				0,
			);
			console.log("Calculated total selected invoices:", total, "from", this.selected_invoices);
			return total;
		},
		total_selected_payments() {
			if (!this.selected_payments || !this.selected_payments.length) return 0;
			return this.selected_payments.reduce((acc, cur) => acc + flt(cur?.unallocated_amount || 0), 0);
		},
		total_selected_mpesa_payments() {
			if (!this.selected_mpesa_payments || !this.selected_mpesa_payments.length) return 0;
			return this.selected_mpesa_payments.reduce((acc, cur) => acc + flt(cur?.amount || 0), 0);
		},
		total_payment_methods() {
			if (!this.payment_methods || !this.payment_methods.length) return 0;

			// Ensure each amount is properly converted to a number
			const total = this.payment_methods.reduce((acc, cur) => {
				const amount = parseFloat(cur?.amount || 0);
				return acc + (isNaN(amount) ? 0 : amount);
			}, 0);

			console.log("Payment methods total:", total, "from", this.payment_methods);
			return total;
		},
		total_of_diff() {
			// Calculate difference between invoice total and payment total
			const invoiceTotal = this.total_selected_invoices || 0;
			const paymentTotal =
				(this.total_selected_payments || 0) +
				(this.total_selected_mpesa_payments || 0) +
				(this.total_payment_methods || 0);

			console.log("Difference calculation:", {
				invoiceTotal,
				paymentTotal,
				selectedPayments: this.total_selected_payments,
				mpesaPayments: this.total_selected_mpesa_payments,
				methodPayments: this.total_payment_methods,
			});

			return flt(invoiceTotal - paymentTotal);
		},
		isDarkTheme() {
			return this.$theme.current === "dark";
		},
	},

	created() {
		this.syncPendingPayments();
		this.eventBus.on("network-online", this.syncPendingPayments);
		this.eventBus.on("server-online", this.syncPendingPayments);
	},

	mounted: function () {
		this.$nextTick(function () {
			this.check_opening_entry();
			this.eventBus.on("update_customer", (customer_name) => {
				this.clear_all(true);
				this.customer_name = customer_name;
				this.fetch_customer_details();
				this.get_outstanding_invoices();
				this.get_unallocated_payments();
				this.get_draft_mpesa_payments_register();
			});
			this.eventBus.on("fetch_customer_details", () => {
				this.fetch_customer_details();
			});
		});
	},
	beforeUnmount() {
		this.eventBus.off("update_customer");
		this.eventBus.off("fetch_customer_details");
		this.eventBus.off("network-online", this.syncPendingPayments);
		this.eventBus.off("server-online", this.syncPendingPayments);
	},
};
</script>

<style>
/* Dark mode input styling */
:deep([data-theme="dark"]) .dark-field,
:deep(.v-theme--dark) .dark-field,
::v-deep([data-theme="dark"]) .dark-field,
::v-deep(.v-theme--dark) .dark-field {
	background-color: #1e1e1e !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__input),
:deep(.v-theme--dark) .dark-field :deep(.v-field__input),
:deep([data-theme="dark"]) .dark-field :deep(input),
:deep(.v-theme--dark) .dark-field :deep(input),
:deep([data-theme="dark"]) .dark-field :deep(.v-label),
:deep(.v-theme--dark) .dark-field :deep(.v-label),
::v-deep([data-theme="dark"]) .dark-field .v-field__input,
::v-deep(.v-theme--dark) .dark-field .v-field__input,
::v-deep([data-theme="dark"]) .dark-field input,
::v-deep(.v-theme--dark) .dark-field input,
::v-deep([data-theme="dark"]) .dark-field .v-label,
::v-deep(.v-theme--dark) .dark-field .v-label {
	color: #fff !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__overlay),
:deep(.v-theme--dark) .dark-field :deep(.v-field__overlay),
::v-deep([data-theme="dark"]) .dark-field .v-field__overlay,
::v-deep(.v-theme--dark) .dark-field .v-field__overlay {
	background-color: #1e1e1e !important;
}

input[total_of_diff] {
	text-align: right;
}

input[payments_methods] {
	text-align: right;
}

input[total_selected_payments] {
	text-align: right;
}

input[total_selected_invoices] {
	text-align: right;
}

input[total_selected_mpesa_payments] {
	text-align: right;
}

.selected-row {
	background-color: #e3f2fd !important;
}
</style>
