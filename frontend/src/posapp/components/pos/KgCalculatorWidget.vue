<template>
        <!--
                POS Awesome — Kg Converter Floating Widget
                A self-contained, non-intrusive utility that lets cashiers convert
                between Kg ↔ Units ↔ ₦ for any LPG item without leaving the POS screen.

                Mount it once in Home.vue / Pos.vue (top-level) so it's available
                from any sub-page. Activated via the speed-dial button in the
                bottom-right corner.
        -->
        <div class="posa-kg-calc-widget">
                <v-btn
                        icon
                        color="primary"
                        size="large"
                        class="posa-kg-calc-fab"
                        :title="$t('Kg ↔ ₦ Converter')"
                        @click="dialog = true"
                >
                        <v-icon>mdi-scale-balance</v-icon>
                </v-btn>

                <v-dialog v-model="dialog" max-width="460">
                        <v-card>
                                <v-card-title class="text-h6">
                                        {{ $t("LPG ₦ ↔ Kg Converter") }}
                                </v-card-title>
                                <v-divider />

                                <v-card-text class="pt-4">
                                        <v-autocomplete
                                                v-model="itemCode"
                                                :items="itemOptions"
                                                :label="$t('Item')"
                                                item-title="label"
                                                item-value="value"
                                                clearable
                                                density="comfortable"
                                                @update:model-value="loadItemWeight"
                                        />

                                        <v-alert
                                                v-if="itemCode && !isKgItem"
                                                type="warning"
                                                density="compact"
                                                class="mb-3"
                                        >
                                                {{
                                                        $t(
                                                                "This item is not configured for Kg. Set Item.weight_per_unit and weight_uom = Kg.",
                                                        )
                                                }}
                                        </v-alert>

                                        <template v-if="itemCode && isKgItem">
                                                <div class="text-caption mb-2">
                                                        {{ $t("1 unit") }} = <b>{{ weightPerUnit }}</b> Kg
                                                </div>

                                                <v-row dense>
                                                        <v-col cols="6">
                                                                <v-text-field
                                                                        v-model.number="qty"
                                                                        :label="$t('Qty (Units)')"
                                                                        type="number"
                                                                        density="comfortable"
                                                                        @update:model-value="onQtyChange"
                                                                />
                                                        </v-col>
                                                        <v-col cols="6">
                                                                <v-text-field
                                                                        v-model.number="kgQty"
                                                                        :label="$t('Kg')"
                                                                        type="number"
                                                                        density="comfortable"
                                                                        @update:model-value="onKgChange"
                                                                />
                                                        </v-col>
                                                        <v-col cols="6">
                                                                <v-text-field
                                                                        v-model.number="rate"
                                                                        :label="$t('Rate / Unit (₦)')"
                                                                        type="number"
                                                                        density="comfortable"
                                                                        @update:model-value="onRateChange"
                                                                />
                                                        </v-col>
                                                        <v-col cols="6">
                                                                <v-text-field
                                                                        v-model.number="ratePerKg"
                                                                        :label="$t('Rate / Kg (₦)')"
                                                                        type="number"
                                                                        density="comfortable"
                                                                        @update:model-value="onRatePerKgChange"
                                                                />
                                                        </v-col>
                                                </v-row>

                                                <v-divider class="my-3" />

                                                <div class="d-flex justify-space-between text-body-1">
                                                        <span>{{ $t("Total (₦)") }}</span>
                                                        <b>₦ {{ formatNgn(total) }}</b>
                                                </div>
                                        </template>
                                </v-card-text>

                                <v-card-actions>
                                        <v-spacer />
                                        <v-btn
                                                v-if="canEmit"
                                                color="primary"
                                                variant="flat"
                                                @click="applyToInvoice"
                                        >
                                                {{ $t("Add to Invoice") }}
                                        </v-btn>
                                        <v-btn variant="text" @click="dialog = false">
                                                {{ $t("Close") }}
                                        </v-btn>
                                </v-card-actions>
                        </v-card>
                </v-dialog>
        </div>
</template>

<script>
import { evntBus } from "../../bus/eventBus.js";

export default {
        name: "KgCalculatorWidget",
        props: {
                items: {
                        type: Array,
                        default: () => [],
                },
        },
        data() {
                return {
                        dialog: false,
                        itemCode: null,
                        weightPerUnit: 0,
                        weightUom: "",
                        qty: 0,
                        kgQty: 0,
                        rate: 0,
                        ratePerKg: 0,
                };
        },
        computed: {
                itemOptions() {
                        return (this.items || []).map((it) => ({
                                value: it.item_code,
                                label: `${it.item_code} — ${it.item_name || ""}`,
                        }));
                },
                isKgItem() {
                        return this.weightUom === "Kg" && this.weightPerUnit > 0;
                },
                total() {
                        return Number((this.qty * this.rate) || 0);
                },
                canEmit() {
                        return this.isKgItem && this.qty > 0 && this.rate > 0;
                },
        },
        methods: {
                loadItemWeight() {
                        this.resetCalc();
                        if (!this.itemCode) return;
                        frappe.call({
                                method: "posawesome.posawesome.api.posa_kg_calc.get_item_weight",
                                args: { item_code: this.itemCode },
                                callback: (r) => {
                                        const info = (r && r.message) || {};
                                        this.weightPerUnit = Number(info.weight_per_unit || 0);
                                        this.weightUom = info.weight_uom || "";
                                },
                        });
                },
                resetCalc() {
                        this.weightPerUnit = 0;
                        this.weightUom = "";
                        this.qty = 0;
                        this.kgQty = 0;
                        this.rate = 0;
                        this.ratePerKg = 0;
                },
                onQtyChange() {
                        if (!this.isKgItem) return;
                        this.kgQty = Number((this.qty * this.weightPerUnit).toFixed(3));
                },
                onKgChange() {
                        if (!this.isKgItem) return;
                        this.qty = Number((this.kgQty / this.weightPerUnit).toFixed(6));
                },
                onRateChange() {
                        if (!this.isKgItem) return;
                        this.ratePerKg = Number((this.rate / this.weightPerUnit).toFixed(6));
                },
                onRatePerKgChange() {
                        if (!this.isKgItem) return;
                        this.rate = Number((this.ratePerKg * this.weightPerUnit).toFixed(6));
                },
                formatNgn(v) {
                        return Number(v || 0).toLocaleString("en-NG", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                        });
                },
                applyToInvoice() {
                        // Emit on the global event bus so Invoice.vue can pick it up
                        // via its existing `add_item` listener.
                        evntBus.emit("add_new_item_to_invoice", {
                                item_code: this.itemCode,
                                qty: this.qty,
                                rate: this.rate,
                                posa_kg_qty: this.kgQty,
                                posa_rate_per_kg: this.ratePerKg,
                        });
                        this.dialog = false;
                },
        },
};
</script>

<style scoped>
.posa-kg-calc-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
