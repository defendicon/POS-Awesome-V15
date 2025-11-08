<template>
        <div>
                <v-card class="selection mx-auto mt-3 pos-themed-card" style="max-height: 80vh; height: 80vh">
                        <v-card-title>
                                <span class="text-h6 text-primary">{{ __("Pricing Rules") }}</span>
                        </v-card-title>
                        <div class="my-0 py-0 overflow-y-auto" style="max-height: 75vh">
                                <v-data-table
                                        :headers="items_headers"
                                        :items="pricing_rules"
                                        :items-per-page="itemsPerPage"
                                        class="elevation-1"
                                        item-key="name"
                                        hide-default-footer
                                >
                                        <template #item.title="{ item }">
                                                <div class="d-flex flex-column">
                                                        <span class="font-weight-medium">{{ item.display_title }}</span>
                                                        <span v-if="item.description" class="text-body-2 text-medium-emphasis">
                                                                {{ item.description }}
                                                        </span>
                                                </div>
                                        </template>
                                        <template #item.applies_display="{ item }">
                                                <div class="d-flex flex-column">
                                                        <span>{{ item.applies_display }}</span>
                                                        <span v-if="item.conditions_display" class="text-caption text-medium-emphasis">
                                                                {{ item.conditions_display }}
                                                        </span>
                                                </div>
                                        </template>
                                        <template #item.benefit_display="{ item }">
                                                <div class="d-flex align-center">
                                                        <v-chip
                                                                v-if="item.is_free_item_rule"
                                                                size="x-small"
                                                                color="success"
                                                                class="mr-2"
                                                                variant="tonal"
                                                        >
                                                                {{ __("Free") }}
                                                        </v-chip>
                                                        <span>{{ item.benefit_display }}</span>
                                                </div>
                                        </template>
                                        <template #item.actions="{ item }">
                                                <v-btn
                                                        v-if="!item.applied"
                                                        size="small"
                                                        color="primary"
                                                        variant="tonal"
                                                        :disabled="item.is_free_item_rule && !item.free_item"
                                                        @click="handleApply(item)"
                                                >
                                                        {{ __("Apply") }}
                                                </v-btn>
                                                <v-btn
                                                        v-else
                                                        size="small"
                                                        color="red"
                                                        variant="tonal"
                                                        @click="handleRemove(item)"
                                                >
                                                        {{ __("Remove") }}
                                                </v-btn>
                                        </template>
                                </v-data-table>
                        </div>
                </v-card>

                <v-card flat style="max-height: 11vh; height: 11vh" class="cards mb-0 mt-3 py-0">
                        <v-row align="start" no-gutters>
                                <v-col cols="12">
                                        <v-btn block class="pa-1" size="large" color="warning" theme="dark" @click="back_to_invoice">
                                                {{ __("Back") }}
                                        </v-btn>
                                </v-col>
                        </v-row>
                </v-card>
        </div>
</template>

<script>
import format from "../../format";

export default {
        mixins: [format],
        data: () => ({
                pricing_rules: [],
                itemsPerPage: 500,
                items_headers: [
                        { title: __("Name"), value: "display_title", align: "start" },
                        { title: __("Applies On"), value: "applies_display", align: "start" },
                        { title: __("Benefit"), value: "benefit_display", align: "start" },
                        { title: __("Status"), value: "actions", align: "center", sortable: false },
                ],
        }),
        computed: {
                totalRules() {
                        return Array.isArray(this.pricing_rules) ? this.pricing_rules.length : 0;
                },
                appliedRules() {
                        return this.pricing_rules.filter((rule) => rule.applied).length;
                },
        },
        watch: {
                pricing_rules: {
                        deep: true,
                        handler() {
                                this.updateCounters();
                        },
                },
        },
        methods: {
                back_to_invoice() {
                        this.eventBus.emit("show_pricing_rules", "false");
                },
                handleApply(rule) {
                        if (!rule) {
                                return;
                        }
                        const payload = this.preparePayload(rule);
                        rule.applied = true;
                        this.refreshRuleState(rule.name, true);
                        this.eventBus.emit("toggle_pricing_rule", { rule: payload, applied: true });
                        this.updateCounters();
                },
                handleRemove(rule) {
                        if (!rule) {
                                return;
                        }
                        const payload = this.preparePayload(rule);
                        rule.applied = false;
                        this.refreshRuleState(rule.name, false);
                        this.eventBus.emit("toggle_pricing_rule", { rule: payload, applied: false });
                        this.updateCounters();
                },
                preparePayload(rule) {
                        const source = rule?.original_rule || rule;
                        return JSON.parse(JSON.stringify(source));
                },
                refreshRuleState(name, applied) {
                        this.pricing_rules = this.pricing_rules.map((entry) => {
                                if (entry.name === name) {
                                        return { ...entry, applied };
                                }
                                return entry;
                        });
                },
                decorateRules(rules) {
                        if (!Array.isArray(rules)) {
                                return [];
                        }
                        return rules.map((rule) => this.decorateRule(rule));
                },
                decorateRule(rule) {
                        const safeRule = { ...(rule || {}) };
                        const applies = this.buildAppliesDisplay(safeRule);
                        const benefit = this.buildBenefitDisplay(safeRule);
                        const conditions = this.buildConditionsDisplay(safeRule);
                        return {
                                ...safeRule,
                                original_rule: JSON.parse(JSON.stringify(safeRule)),
                                display_title: safeRule.title || safeRule.name,
                                applies_display: applies,
                                benefit_display: benefit,
                                conditions_display: conditions,
                                applied: Boolean(safeRule.applied),
                                is_free_item_rule: Boolean(safeRule.is_free_item_rule),
                        };
                },
                buildAppliesDisplay(rule) {
                        const segments = [];
                        if (rule.apply_on) {
                                segments.push(rule.apply_on);
                        }
                        if (rule.applicable_for) {
                                segments.push(rule.applicable_for);
                        }
                        if (rule.customer) {
                                segments.push(`${__("Customer")}: ${rule.customer}`);
                        } else if (rule.customer_group) {
                                segments.push(`${__("Customer Group")}: ${rule.customer_group}`);
                        }
                        if (rule.territory) {
                                segments.push(`${__("Territory")}: ${rule.territory}`);
                        }
                        if (rule.item_code) {
                                segments.push(`${__("Item")}: ${rule.item_code}`);
                        } else if (rule.item_group) {
                                segments.push(`${__("Item Group")}: ${rule.item_group}`);
                        } else if (rule.brand) {
                                segments.push(`${__("Brand")}: ${rule.brand}`);
                        }
                        if (rule.warehouse) {
                                segments.push(`${__("Warehouse")}: ${rule.warehouse}`);
                        }
                        if (!segments.length) {
                                segments.push(__("All"));
                        }
                        return segments.join(" • ");
                },
                buildBenefitDisplay(rule) {
                        if (rule.is_free_item_rule) {
                                const qty = this.flt(rule.free_qty || 0);
                                const itemName = rule.free_item_name || rule.free_item || __("Free Item");
                                if (qty) {
                                        return __("{0} x {1}", [qty, itemName]);
                                }
                                return itemName;
                        }
                        if (rule.is_price_discount) {
                                if (rule.discount_percentage) {
                                        return __("{0}% off", [this.flt(rule.discount_percentage || 0)]);
                                }
                                if (rule.discount_amount) {
                                        return __("Discount {0}", [this.formatCurrency(rule.discount_amount)]);
                                }
                                if (rule.rate) {
                                        return __("Rate {0}", [this.formatCurrency(rule.rate)]);
                                }
                        }
                        return __("Automatic adjustment");
                },
                buildConditionsDisplay(rule) {
                        const segments = [];
                        if (rule.min_qty) {
                                segments.push(__("Min Qty: {0}", [this.flt(rule.min_qty)]));
                        }
                        if (rule.min_amt) {
                                segments.push(__("Min Amount: {0}", [this.formatCurrency(rule.min_amt)]));
                        }
                        if (rule.valid_from || rule.valid_upto) {
                                const from = rule.valid_from ? rule.valid_from : __("Any");
                                const to = rule.valid_upto ? rule.valid_upto : __("Any");
                                segments.push(__("Valid {0} → {1}", [from, to]));
                        }
                        return segments.join(" • ");
                },
                syncAppliedState(payload) {
                        const applied = Array.isArray(payload?.applied) ? payload.applied : [];
                        const appliedMap = new Map();
                        applied.forEach((row) => {
                                if (row?.name) {
                                        appliedMap.set(row.name, true);
                                }
                        });
                        this.pricing_rules = this.pricing_rules.map((rule) => ({
                                ...rule,
                                applied: appliedMap.has(rule.name),
                        }));
                        this.updateCounters();
                },
                updateCounters() {
                        this.eventBus.emit("update_pricing_rules_counters", {
                                pricingRulesCount: this.totalRules,
                                appliedPricingRulesCount: this.appliedRules,
                        });
                },
        },
        created() {
                this._handlers = {
                        set: (rules) => {
                                this.pricing_rules = this.decorateRules(rules);
                                this.updateCounters();
                        },
                        sync: (payload) => {
                                this.syncAppliedState(payload);
                        },
                };
                this.eventBus.on("set_pricing_rules", this._handlers.set);
                this.eventBus.on("sync_pricing_rules", this._handlers.sync);
        },
        beforeUnmount() {
                if (this._handlers?.set) {
                        this.eventBus.off("set_pricing_rules", this._handlers.set);
                }
                if (this._handlers?.sync) {
                        this.eventBus.off("sync_pricing_rules", this._handlers.sync);
                }
        },
};
</script>

<style scoped>
.selection {
        border-radius: 12px;
}
</style>
