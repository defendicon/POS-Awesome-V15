/**
 * POS Awesome — ₦↔Kg Auto-Calculator
 * --------------------------------------------------------------
 * Bidirectional sync between (qty, rate) and (posa_kg_qty, posa_rate_per_kg)
 * on the child item rows of:
 *      Sales Invoice, POS Invoice, Quotation, Sales Order
 *
 * Source of truth: Item.weight_per_unit & Item.weight_uom (must be "Kg").
 *
 * Rules:
 *    posa_kg_qty       = qty  * weight_per_unit
 *    posa_rate_per_kg  = rate / weight_per_unit
 *    qty               = posa_kg_qty / weight_per_unit
 *    rate              = posa_rate_per_kg * weight_per_unit
 *
 * Items where weight_uom != "Kg" OR weight_per_unit <= 0 are skipped (no-op).
 */

(function () {
        const KG_UOM = "Kg";
        const ITEM_CACHE = {};
        // Re-entry guard: prevents the qty→kg_qty handler from triggering
        // the kg_qty→qty handler in the same tick.
        let suppressTrigger = false;

        function fetchItemWeight(itemCode) {
                if (!itemCode) return Promise.resolve(null);
                if (ITEM_CACHE[itemCode]) return Promise.resolve(ITEM_CACHE[itemCode]);
                return frappe
                        .call({
                                method: "posawesome.posawesome.api.posa_kg_calc.get_item_weight",
                                args: { item_code: itemCode },
                                freeze: false,
                        })
                        .then((r) => {
                                const data = (r && r.message) || null;
                                if (data) ITEM_CACHE[itemCode] = data;
                                return data;
                        });
        }

        function withWeight(frm, cdt, cdn, callback) {
                const row = locals[cdt][cdn];
                if (!row || !row.item_code) return;
                fetchItemWeight(row.item_code).then((info) => {
                        if (!info || !info.is_kg) return;
                        callback(row, info);
                });
        }

        function updateRow(frm, row, changes) {
                Object.keys(changes).forEach((field) => {
                        frappe.model.set_value(row.doctype, row.name, field, changes[field]);
                });
        }

        function onQtyChange(frm, cdt, cdn) {
                if (suppressTrigger) return;
                withWeight(frm, cdt, cdn, (row, info) => {
                        const qty = flt(row.qty);
                        const newKg = flt(qty * info.weight_per_unit, 3);
                        if (flt(row.posa_kg_qty, 3) === newKg) return;
                        suppressTrigger = true;
                        updateRow(frm, row, { posa_kg_qty: newKg });
                        setTimeout(() => {
                                suppressTrigger = false;
                        }, 0);
                });
        }

        function onRateChange(frm, cdt, cdn) {
                if (suppressTrigger) return;
                withWeight(frm, cdt, cdn, (row, info) => {
                        const rate = flt(row.rate);
                        const newRpkg = info.weight_per_unit
                                ? flt(rate / info.weight_per_unit, 6)
                                : 0;
                        if (flt(row.posa_rate_per_kg, 6) === newRpkg) return;
                        suppressTrigger = true;
                        updateRow(frm, row, { posa_rate_per_kg: newRpkg });
                        setTimeout(() => {
                                suppressTrigger = false;
                        }, 0);
                });
        }

        function onKgQtyChange(frm, cdt, cdn) {
                if (suppressTrigger) return;
                withWeight(frm, cdt, cdn, (row, info) => {
                        const kg = flt(row.posa_kg_qty);
                        if (!info.weight_per_unit) return;
                        const newQty = flt(kg / info.weight_per_unit, 6);
                        if (flt(row.qty, 6) === newQty) return;
                        suppressTrigger = true;
                        updateRow(frm, row, { qty: newQty });
                        setTimeout(() => {
                                suppressTrigger = false;
                        }, 0);
                });
        }

        function onRatePerKgChange(frm, cdt, cdn) {
                if (suppressTrigger) return;
                withWeight(frm, cdt, cdn, (row, info) => {
                        const rpkg = flt(row.posa_rate_per_kg);
                        const newRate = flt(rpkg * info.weight_per_unit, 6);
                        if (flt(row.rate, 6) === newRate) return;
                        suppressTrigger = true;
                        updateRow(frm, row, { rate: newRate });
                        setTimeout(() => {
                                suppressTrigger = false;
                        }, 0);
                });
        }

        function onItemCodeChange(frm, cdt, cdn) {
                // Refresh derived fields when the item itself changes.
                onQtyChange(frm, cdt, cdn);
                onRateChange(frm, cdt, cdn);
        }

        const HANDLERS = {
                qty: onQtyChange,
                rate: onRateChange,
                posa_kg_qty: onKgQtyChange,
                posa_rate_per_kg: onRatePerKgChange,
                item_code: onItemCodeChange,
        };

        // Wire the same handlers to all four sales-item child doctypes.
        const ITEM_CHILD_DOCTYPES = [
                "Sales Invoice Item",
                "POS Invoice Item",
                "Quotation Item",
                "Sales Order Item",
        ];

        ITEM_CHILD_DOCTYPES.forEach((childDt) => {
                frappe.ui.form.on(childDt, HANDLERS);
        });
})();
