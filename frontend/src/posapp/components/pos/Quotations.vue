<template>
        <v-row justify="center">
                <v-dialog v-model="draftsDialog" max-width="900px">
                        <v-card>
                                <v-card-title>
                                        <span class="text-h5 text-primary">{{ __("Select Quotations") }}</span>
                                </v-card-title>
                                <v-card-text class="pa-0">
                                        <v-container>
                                                <v-row class="mb-4">
                                                        <v-text-field
                                                                color="primary"
                                                                :label="frappe._('Quotation ID')"
                                                                hide-details
                                                                v-model="quotation_name"
                                                                density="compact"
                                                                clearable
                                                                class="mx-4 pos-themed-input"
                                                        ></v-text-field>
                                                        <v-btn
                                                                variant="text"
                                                                class="ml-2"
                                                                color="primary"
                                                                theme="dark"
                                                                @click="search_quotations"
                                                                >{{ __("Search") }}</v-btn
                                                        >
                                                </v-row>
                                                <v-row no-gutters>
                                                        <v-col cols="12" class="pa-1">
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
                                        <v-btn v-if="selected.length" color="success" theme="dark" @click="submit_dialog"
                                                >Select</v-btn
                                        >
                                </v-card-actions>
                        </v-card>
                </v-dialog>
        </v-row>
</template>

<script>
import format from "../../format";
export default {
        mixins: [format],
        data: () => ({
                draftsDialog: false,
                singleSelect: true,
                pos_profile: {},
                selected: [],
                dialog_data: {},
                quotation_name: "",
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
                        {
                                title: __("Quotation"),
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
        methods: {
                close_dialog() {
                        this.draftsDialog = false;
                },
                clearSelected() {
                        this.selected = [];
                },
                search_quotations() {
                        frappe.call({
                                method: "posawesome.posawesome.api.quotations.search_quotations",
                                args: {
                                        quotation_name: this.quotation_name,
                                        company: this.pos_profile.company,
                                        currency: this.pos_profile.currency,
                                },
                                async: false,
                                callback: (r) => {
                                        if (r.message) {
                                                this.dialog_data = r.message;
                                        }
                                },
                        });
                },
                submit_dialog() {
                        if (this.selected.length > 0) {
                                this.eventBus.emit("load_quotation", this.selected[0]);
                                this.draftsDialog = false;
                        }
                },
        },
        created() {
                this.eventBus.on("open_quotations", (data) => {
                        this.clearSelected();
                        this.draftsDialog = true;
                        this.dialog_data = data;
                        this.quotation_name = "";
                });
        },
        mounted() {
                this.eventBus.on("register_pos_profile", (data) => {
                        this.pos_profile = data.pos_profile;
                });
        },
        beforeUnmount() {
                this.eventBus.off("open_quotations");
                this.eventBus.off("register_pos_profile");
        },
};
</script>
