# Feature: ₦↔Kg Auto-Calculator

**Status:** Phase A (Desk + Server) complete  
**Branch:** to be pushed by user from `develop`  
**Tracking:** Sungas Phase 5 — POS Awesome Customizations (P0)

## What it does

Adds bidirectional conversion between **Units** ↔ **Kg** ↔ **₦/Unit** ↔ **₦/Kg** on
every sales-item child row, anywhere a sales item is selected:

- Sales Invoice
- POS Invoice
- Quotation
- Sales Order
- POS Awesome (via server-side sync on save + an in-POS floating Kg Converter widget)

## How it works

**Source of truth:** `Item.weight_per_unit` + `Item.weight_uom`. An item is
"Kg-enabled" iff `weight_uom == "Kg"` and `weight_per_unit > 0`.

**Conversion rules:**

| Trigger | Update                                                |
|---------|-------------------------------------------------------|
| qty                  | `posa_kg_qty = qty * weight_per_unit`     |
| rate                 | `posa_rate_per_kg = rate / weight_per_unit` |
| posa_kg_qty          | `qty = posa_kg_qty / weight_per_unit`     |
| posa_rate_per_kg     | `rate = posa_rate_per_kg * weight_per_unit` |
| item_code change     | recompute both derived fields             |

For non-Kg items, the derived fields are cleared to 0 (no-op).

## Files added / changed

```
posawesome/patches/add_posa_kg_calculator_fields.py   (new) - Adds 2 custom fields × 4 doctypes
posawesome/posawesome/api/posa_kg_calc.py             (new) - Server sync + whitelisted item-weight API
posawesome/posawesome/api/quotation_hooks.py          (new) - validate hook for Quotation & Sales Order
posawesome/public/js/posa_kg_calculator.js            (new) - Desk-form JS sync
frontend/src/posapp/components/pos/KgCalculatorWidget.vue (new) - Floating in-POS converter
posawesome/posawesome/api/invoice.py                  (edit) - Call sync_kg_fields in validate
posawesome/hooks.py                                   (edit) - app_include_js, doc_events, fixtures
posawesome/patches.txt                                (edit) - Register patch
```

## Deployment (on the Frappe Cloud bench)

```bash
# As frappe@bench-... user:
cd ~/frappe-bench
bench get-app https://github.com/sungasng/POS-Awesome-V15 --branch develop  # first time only
# If already installed:
cd apps/posawesome && git pull origin develop && cd ../..

bench --site sungasmis.v.frappe.cloud install-app posawesome   # first time only
bench --site sungasmis.v.frappe.cloud migrate                  # runs the patch
yarn install --cwd apps/posawesome                             # frontend deps if needed
bench build --app posawesome
bench restart
```

After migrate, verify:

```bash
bench --site sungasmis.v.frappe.cloud execute "exec(open('/tmp/verify_kg_fields.py').read())"
```

…where `/tmp/verify_kg_fields.py` contains:

```python
import frappe
for dt in ("Sales Invoice Item", "POS Invoice Item", "Quotation Item", "Sales Order Item"):
    for fn in ("posa_kg_qty", "posa_rate_per_kg"):
        exists = frappe.db.exists("Custom Field", f"{dt}-{fn}")
        print(f"{dt}-{fn}: {'OK' if exists else 'MISSING'}")
```

## Manual smoke test

1. **Item setup**: Open any LPG item (e.g., a 12.5 kg cylinder). Set `Weight per Unit = 12.5`, `Weight UOM = Kg`. Save.
2. **Sales Invoice — qty → kg**: New SI → add the item → set `Qty = 4`. Expect `Kg Qty = 50.000`.
3. **Sales Invoice — kg → qty**: Change `Kg Qty` to `25`. Expect `Qty = 2`.
4. **Sales Invoice — rate → ₦/kg**: Set `Rate = 25000`. Expect `Rate/Kg = 2000`.
5. **Sales Invoice — ₦/kg → rate**: Change `Rate/Kg` to `2500`. Expect `Rate = 31250`.
6. **Quotation / Sales Order**: Repeat 2–5 in those doctypes.
7. **POS Awesome (server-side fallback)**: Submit a POS invoice with the item. Open the resulting Sales Invoice in desk → `Kg Qty` and `Rate/Kg` should be populated.
8. **Non-kg item**: Add a non-kg item. Both derived fields stay 0.

## Vue UI integration (one-line patch in Pos.vue / Home.vue)

The floating Kg Converter widget is shipped as a standalone Vue component. To
enable it inside POS Awesome, add to the top-level POS page template:

```vue
<template>
    <div>
        <!-- existing markup ... -->
        <KgCalculatorWidget :items="items" />
    </div>
</template>

<script>
import KgCalculatorWidget from "./pos/KgCalculatorWidget.vue";
// register in components: { KgCalculatorWidget, ... }
</script>
```

This is intentionally non-invasive — the widget operates standalone via
`evntBus.emit("add_new_item_to_invoice", ...)`, which the existing Invoice.vue
already listens to.

## Future enhancements (deferred)

- Inline `Kg @ ₦/Kg` badge on each invoice item row (small visual polish)
- Auto-detect kg items via item group rather than per-item weight
- Print format: show Kg Qty and ₦/Kg next to Qty and Rate
