<template>
        <div>
                <v-card class="selection mx-auto mt-3 pos-themed-card" style="max-height: 80vh; height: 80vh">
                        <v-card-title class="d-flex flex-column align-start gap-2">
                                <span class="text-h6 text-primary">{{ __("Pricing Rules") }}</span>
                                <div class="text-body-2 text-medium-emphasis">
                                        <span class="font-weight-medium text-primary">
                                                {{ enabledRules }} / {{ totalRules }}
                                        </span>
                                        <span class="ml-1">{{ __("enabled") }}</span>
                                </div>
                        </v-card-title>
                        <v-divider></v-divider>
                        <div class="my-0 py-0 overflow-y-auto" style="max-height: 73vh">
                                <v-data-table
                                        :items="pricingRules"
                                        :headers="headers"
                                        :items-per-page="itemsPerPage"
                                        class="elevation-1"
                                        :loading="loading"
                                        hide-default-footer
                                >
                                        <template v-slot:item.title="{ item }">
                                                <div class="d-flex flex-column">
                                                        <span class="font-weight-medium">{{ item.title || item.name }}</span>
                                                        <span class="text-caption text-medium-emphasis" v-if="item.name !== item.title">
                                                                {{ item.name }}
                                                        </span>
                                                </div>
                                        </template>
                                        <template v-slot:item.validity="{ item }">
                                                <div class="d-flex flex-column">
                                                        <span v-if="item.valid_from">{{ formatDate(item.valid_from) }}</span>
                                                        <span v-if="item.valid_upto" class="text-caption text-medium-emphasis">
                                                                {{ __("Until") }} {{ formatDate(item.valid_upto) }}
                                                        </span>
                                                        <span v-if="!item.valid_from && !item.valid_upto" class="text-caption text-medium-emphasis">
                                                                {{ __("No validity limits") }}
                                                        </span>
                                                </div>
                                        </template>
                                        <template v-slot:item.disable="{ item }">
                                                <v-switch
                                                        class="mt-0"
                                                        color="success"
                                                        inset
                                                        :model-value="!item.disable"
                                                        :disabled="item._updating"
                                                        @update:model-value="(value) => toggleRule(item, value)"
                                                >
                                                        <template v-slot:label>
                                                                <span class="text-caption">
                                                                        {{ valueLabel(!item.disable) }}
                                                                </span>
                                                        </template>
                                                </v-switch>
                                        </template>
                                        <template v-slot:no-data>
                                                <div class="py-10 text-center text-medium-emphasis">
                                                        <v-icon class="mb-2" size="32">mdi-tag-multiple</v-icon>
                                                        <div>{{ __("No pricing rules found") }}</div>
                                                </div>
                                        </template>
                                </v-data-table>
                        </div>
                </v-card>

                <v-card flat style="max-height: 11vh; height: 11vh" class="cards mb-0 mt-3 py-0">
                        <v-row align="start" no-gutters>
                                <v-col cols="12">
                                        <v-btn block class="pa-1" size="large" color="warning" theme="dark" @click="back">
                                                {{ __("Back") }}
                                        </v-btn>
                                </v-col>
                        </v-row>
                </v-card>
        </div>
</template>

<script>
/* global __, frappe, window */
import format from "../../format";

export default {
        mixins: [format],
        data() {
                return {
                        pricingRules: [],
                        pos_profile: null,
                        loading: false,
                        itemsPerPage: 1000,
                        headers: [
                                { title: __("Title"), value: "title", align: "start" },
                                { title: __("Apply On"), value: "apply_on", align: "start" },
                                { title: __("Type"), value: "price_or_product_discount", align: "start" },
                                { title: __("Validity"), value: "validity", align: "start" },
                                { title: __("Status"), value: "disable", align: "center", width: 120 },
                        ],
                };
        },
        computed: {
                totalRules() {
                        return this.pricingRules.length;
                },
                enabledRules() {
                        return this.pricingRules.filter((rule) => !rule.disable).length;
                },
        },
        methods: {
                back() {
                        this.eventBus.emit("show_pricing_rules", "false");
                },
                formatDate(date) {
                        if (!date) {
                                return "";
                        }
                        try {
                                return frappe.datetime.str_to_user(date);
                        } catch (error) {
                                return date;
                        }
                },
                valueLabel(enabled) {
                        return enabled ? __("Enabled") : __("Disabled");
                },
                async toggleRule(rule, enabled) {
                        if (!rule || !rule.name) {
                                return;
                        }
                        const previous = !rule.disable;
                        const targetDisable = enabled ? 0 : 1;
                        if (previous === enabled) {
                                return;
                        }
                        rule._updating = true;
                        rule.disable = targetDisable;
                        this.updateCounters();
                        try {
                                await frappe.call({
                                        method: "posawesome.posawesome.api.pricing_rules.set_pricing_rule_status",
                                        args: {
                                                pricing_rule: rule.name,
                                                disable: targetDisable,
                                        },
                                });
                                this.eventBus.emit("pricing_rules_status_changed", {
                                        rule: rule.name,
                                        disable: targetDisable,
                                        enabled,
                                        profile: this.pos_profile?.name || null,
                                });
                                this.eventBus.emit("show_message", {
                                        title: enabled ? __("Pricing rule enabled") : __("Pricing rule disabled"),
                                        color: enabled ? "success" : "warning",
                                });
                        } catch (error) {
                                console.error("Failed to toggle pricing rule", error);
                                rule.disable = previous ? 0 : 1;
                                this.updateCounters();
                                this.eventBus.emit("show_message", {
                                        title: __("Failed to update pricing rule"),
                                        color: "error",
                                });
                        } finally {
                                rule._updating = false;
                        }
                },
                async loadPricingRules() {
                        if (!this.pos_profile || !this.pos_profile.name) {
                                return;
                        }
                        if (this.loading) {
                                return;
                        }
                        this.loading = true;
                        try {
                                const { message } = await frappe.call({
                                        method: "posawesome.posawesome.api.pricing_rules.get_pricing_rules",
                                        args: {
                                                profile: this.pos_profile.name,
                                        },
                                });
                                this.pricingRules = (message || []).map((rule) => ({
                                        ...rule,
                                        disable: Number(rule.disable) === 1 ? 1 : 0,
                                }));
                                this.updateCounters();
                        } catch (error) {
                                console.error("Failed to load pricing rules", error);
                                this.pricingRules = [];
                                this.updateCounters();
                                this.eventBus.emit("show_message", {
                                        title: __("Failed to load pricing rules"),
                                        color: "error",
                                });
                        } finally {
                                this.loading = false;
                        }
                },
                updateCounters() {
                        this.eventBus.emit("update_pricing_rules_counters", {
                                total: this.totalRules,
                                enabled: this.enabledRules,
                        });
                },
        },
        watch: {
                pos_profile(newProfile, oldProfile) {
                        if (newProfile && newProfile !== oldProfile) {
                                this.loadPricingRules();
                        }
                },
        },
        created() {
                this.eventBus.on("register_pos_profile", (data) => {
                        this.pos_profile = data.pos_profile;
                });
                this.eventBus.on("show_pricing_rules", (value) => {
                        if (value === "true") {
                                this.loadPricingRules();
                        }
                });
        },
        mounted() {
                if (!this.pos_profile || !this.pos_profile.name) {
                        try {
                                if (frappe.boot && frappe.boot.pos_profile) {
                                        this.pos_profile = frappe.boot.pos_profile;
                                } else if (window.cur_pos && window.cur_pos.pos_profile) {
                                        this.pos_profile = window.cur_pos.pos_profile;
                                }
                        } catch (error) {
                                console.warn("Failed to resolve POS profile in pricing rules component", error);
                        }
                }

                if (this.pos_profile && this.pos_profile.name) {
                        this.loadPricingRules();
                }
        },
        beforeUnmount() {
                this.eventBus.off("register_pos_profile");
                this.eventBus.off("show_pricing_rules");
        },
};
</script>

<style scoped>
.gap-2 {
        gap: 8px;
}
</style>
