<template>
        <div>
                <v-card class="selection mx-auto mt-3 pos-themed-card" style="max-height: 80vh; height: 80vh">
                        <v-card-title>
                                <span class="text-h6 text-primary">{{ __("Pricing Rules") }}</span>
                        </v-card-title>
                        <div class="my-0 py-0 overflow-y-auto" style="max-height: 75vh">
                                <v-skeleton-loader
                                        v-if="loading"
                                        type="table"
                                        class="px-4"
                                        :loading="loading"
                                />
                                <template v-else>
                                        <v-data-table
                                                :headers="headers"
                                                :items="pricingRules"
                                                class="elevation-1"
                                                :items-per-page="itemsPerPage"
                                                hide-default-footer
                                        >
                                                <template #item.actions="{ item }">
                                                        <v-btn
                                                                size="small"
                                                                color="primary"
                                                                :loading="applying === item.name"
                                                                @click="applyRule(item)"
                                                        >
                                                                {{ __("Apply") }}
                                                        </v-btn>
                                                </template>
                                                <template #item.discount="{ item }">
                                                        <span v-if="item.discount_percentage">
                                                                {{ item.discount_percentage }}%
                                                        </span>
                                                        <span v-else-if="item.discount_amount">
                                                {{ formatRuleCurrency(item.discount_amount) }}
                                                        </span>
                                                        <span v-else-if="item.margin_rate_or_amount">
                                                {{ formatRuleCurrency(item.margin_rate_or_amount) }}
                                                        </span>
                                                        <span v-else>
                                                                —
                                                        </span>
                                                </template>
                                                <template #no-data>
                                                        <div class="py-6 text-center text-medium-emphasis">
                                                                {{ __("No pricing rules available for the current cart") }}
                                                        </div>
                                                </template>
                                        </v-data-table>
                                </template>
                        </div>
                </v-card>

                <v-card flat style="max-height: 11vh; height: 11vh" class="cards mb-0 mt-3 py-0">
                        <v-row align="center" no-gutters>
                                <v-col cols="12" class="pb-2">
                                        <v-btn
                                                block
                                                class="pa-1"
                                                size="large"
                                                color="secondary"
                                                variant="tonal"
                                                @click="clearAppliedRules"
                                                :disabled="!appliedRules.length"
                                        >
                                                {{ __("Clear Pricing Rules") }}
                                        </v-btn>
                                </v-col>
                                <v-col cols="12">
                                        <v-btn
                                                block
                                                class="pa-1"
                                                size="large"
                                                color="warning"
                                                theme="dark"
                                                @click="back_to_invoice"
                                        >
                                                {{ __("Back") }}
                                        </v-btn>
                                </v-col>
                        </v-row>
                </v-card>
        </div>
</template>

<script>
/* global __, frappe */
import format from "../../format";

export default {
        mixins: [format],
        data() {
                return {
                        pricingRules: [],
                        loading: false,
                        applying: null,
                        itemsPerPage: 1000,
                        headers: [
                                { title: __("Name"), value: "title", align: "start" },
                                { title: __("Apply On"), value: "apply_on", align: "start" },
                                { title: __("Discount"), value: "discount", align: "end" },
                                { title: __("Priority"), value: "priority", align: "end" },
                                { title: __("Actions"), value: "actions", align: "end", sortable: false },
                        ],
                        invoiceContext: null,
                        appliedRules: [],
                        profileHandler: null,
                        pos_profile: null,
                };
        },
        methods: {
                back_to_invoice() {
                        this.eventBus.emit("show_pricing_rules", "false");
                },
                formatRuleCurrency(value) {
                        return this.formatCurrency(value);
                },
                refreshContext() {
                        this.eventBus.emit("request_pricing_rule_context");
                },
                async fetchPricingRules() {
                        if (!this.invoiceContext) {
                                return;
                        }
                        this.loading = true;
                        try {
                                const { message } = await frappe.call({
                                        method: "posawesome.posawesome.api.pricing_rules.get_pos_pricing_rules",
                                        args: { context: JSON.stringify(this.invoiceContext) },
                                });
                                this.pricingRules = message || [];
                                this.emitCounters();
                        } catch (error) {
                                console.error("Failed to load pricing rules", error);
                                this.pricingRules = [];
                                this.emitCounters();
                                this.eventBus.emit("show_message", {
                                        title: __("Failed to fetch pricing rules"),
                                        color: "error",
                                });
                        } finally {
                                this.loading = false;
                        }
                },
                emitCounters() {
                        this.eventBus.emit("update_pricing_rules_counters", {
                                pricingRulesCount: this.pricingRules.length,
                                appliedPricingRulesCount: this.appliedRules.length,
                        });
                },
                async applyRule(rule) {
                        if (!rule || !rule.name) {
                                return;
                        }
                        if (!this.invoiceContext) {
                                this.refreshContext();
                                return;
                        }
                        this.applying = rule.name;
                        try {
                                const { message } = await frappe.call({
                                        method: "posawesome.posawesome.api.pricing_rules.apply_pos_pricing_rule",
                                        args: {
                                                context: JSON.stringify(this.invoiceContext),
                                                pricing_rule: rule.name,
                                        },
                                });
                                const updates = Array.isArray(message) ? message : [];
                                this.eventBus.emit("apply_pricing_rule_updates", {
                                        updates,
                                        pricing_rule: rule.name,
                                });
                                this.eventBus.emit("show_message", {
                                        title: __("Applied pricing rule {0}", [rule.name]),
                                        color: "success",
                                });
                                this.refreshContext();
                        } catch (error) {
                                console.error("Failed to apply pricing rule", error);
                                this.eventBus.emit("show_message", {
                                        title: __("Unable to apply pricing rule"),
                                        color: "error",
                                });
                        } finally {
                                this.applying = null;
                        }
                },
                clearAppliedRules() {
                        this.eventBus.emit("reset_pricing_rules");
                        this.appliedRules = [];
                        this.emitCounters();
                        this.refreshContext();
                },
                handlePricingRuleContext(context) {
                        this.invoiceContext = context;
                        this.appliedRules = context?.applied_pricing_rules || [];
                        this.fetchPricingRules();
                },
        },
        created() {
                this.$nextTick(() => {
                        this.eventBus.on("pricing_rule_context", this.handlePricingRuleContext);
                        this.profileHandler = (data) => {
                                this.pos_profile = data.pos_profile;
                        };
                        this.eventBus.on("register_pos_profile", this.profileHandler);
                        this.refreshContext();
                });
        },
        beforeUnmount() {
                this.eventBus.off("pricing_rule_context", this.handlePricingRuleContext);
                if (this.profileHandler) {
                        this.eventBus.off("register_pos_profile", this.profileHandler);
                        this.profileHandler = null;
                }
        },
};
</script>

<style scoped>
.selection {
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
