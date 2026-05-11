# Phase 5 — POS Awesome Customizations · Sungas LPG

This document covers all 5 features in this batch. Apply the single combined
patch (`/app/scaffolds/phase5_complete.patch`) to your fork, then deploy on
your Frappe Cloud bench with:

```bash
cd ~/frappe-bench
cd apps/posawesome && git pull origin develop && cd ../..
bench --site sungasmis.v.frappe.cloud migrate
bench build --app posawesome
bench restart
```

The `migrate` runs three patches in order:
1. `add_posa_kg_calculator_fields` (Feature 1, already shipped)
2. `add_phase5_customizations` (creates the barcode field, indexes mobile_no,
   normalizes existing mobile numbers, installs the LPG approval workflow,
   creates the 4 LPG roles)

The new DocTypes (`LPG Outlet Price Tier`, `LPG Price Change Request`) come
in via the standard app install — no fixture import needed.

---

## Feature 1 — ₦↔Kg Auto-Calculator (shipped earlier)
See `01_naira_kg_calculator.md`.

---

## Feature 2 — LPG Outlet Price Tier (replaces native Pricing Rules)

**DocType:** `LPG Outlet Price Tier`  
**Fields:** Item · Customer Group · Territory · Min Qty · Max Qty · Rate · Currency · Valid From · Valid To · Enabled · Notes

**Lookup priority** (most-specific wins) — implemented in
`posawesome/posawesome/api/lpg_pricing.py:find_applicable_tier`:
1. Exact (item, customer_group, territory) match
2. qty within [min_qty, max_qty]   (0 = no bound)
3. posting_date within [valid_from, valid_to]
4. enabled = 1
5. Tie-breaker: highest min_qty (bulk bracket) wins

**Hooked into:**
- `Sales Invoice.validate` → overrides `rate` before tax/discount calc
- `POS Invoice.validate`   → same
- `Quotation.validate`     → same
- `Sales Order.validate`   → same

**Whitelisted API for POS Awesome client:**
```
POST /api/method/posawesome.posawesome.api.lpg_pricing.get_tier_rate
     ?item_code=…&customer=…&qty=…&posting_date=…
```

**Manual smoke test:**
1. Create tier: `LPG-12.5KG` · `Bulk` · `Lagos 1` · Min Qty 100 · Rate ₦18,000.
2. New Sales Invoice with a Bulk customer in Lagos 1, add LPG-12.5KG qty=150.
3. Save → rate auto-overrides to ₦18,000.
4. Change qty to 50 → rate reverts to the default Price List rate.

---

## Feature 3 — Barcode Receipt (encodes Invoice ID + Kg Volume)

**Custom field:** `Sales Invoice.posa_receipt_barcode` / `POS Invoice.posa_receipt_barcode` (Data, read-only).

**Format:** `{invoice_name}|{total_kg}` e.g. `ACC-SINV-2026-00001|62.50`

**Computed** on every `validate` via `lpg_barcode.set_receipt_barcode`. Sums
`posa_kg_qty` across all item rows — so Feature 1 must be enabled for the Kg
component to be non-zero.

**Print format integration:**

Drop this one-liner into any Sales Invoice / POS Invoice Print Format
(HTML mode) to render a Code128 barcode below the totals:

```jinja
{% include "templates/print_formats/lpg_receipt_barcode.html" %}
```

Or copy/paste the snippet inline:

```html
{% if doc.posa_receipt_barcode %}
<div style="text-align:center; margin-top:8px;">
    <img src="{{ frappe.utils.get_barcode_image(doc.posa_receipt_barcode,
              type='code128', width=2, height=60) }}" />
    <div style="font-family:monospace; font-size:11px;">
        {{ doc.posa_receipt_barcode }}
    </div>
</div>
{% endif %}
```

**Manual smoke test:**
1. Submit any Sales Invoice that has Feature-1 Kg items.
2. Open the doc → `Receipt Barcode Payload` should read e.g.
   `ACC-SINV-2026-00001|62.50`.
3. Print → barcode renders at the bottom.

---

## Feature 4 — Price-Change Approval Workflow

**DocType:** `LPG Price Change Request` (submittable)  
**Workflow:** `LPG Price Change Approval` (auto-installed by
`lpg_workflow_install.install_lpg_workflow`)

**Roles** (auto-created on migrate):
- `LPG POS User`         — creates requests
- `LPG Plant Manager`    — first approver
- `LPG Head of Sales`    — second approver
- `LPG Head of Finance`  — final approver (triggers tier upsert)

**State machine:**
```
Draft
  └─[POS User submits]→ Pending Plant Manager
                              ├─Approve→ Pending Head of Sales
                              │                ├─Approve→ Pending Head of Finance
                              │                │                ├─Approve→ Approved (auto-create/update tier)
                              │                │                └─Reject → Rejected
                              │                └─Reject → Rejected
                              └─Reject → Rejected
```

**Tier upsert on final approval** — `LPGPriceChangeRequest.on_submit` checks
for an existing tier matching `(item, customer_group, territory, min_qty)` and
either updates its rate + validity, or creates a new one. The PCR's
`created_tier` field stores the link for traceability.

**Manual smoke test:**
1. Log in as a user with role `LPG POS User`. Go to
   "LPG Price Change Request" → New.
2. Fill: Item = `LPG-12.5KG`, Customer Group = `Retail`, Territory = `Ikeja`,
   Proposed Rate = `26,000`, Reason = "Aug price increase".
3. Submit → state moves to "Pending Plant Manager".
4. Log in as Plant Manager → Approve → state moves to "Pending Head of Sales".
5. Repeat for Head of Sales, then Head of Finance.
6. On final approval: open the corresponding `LPG Outlet Price Tier` — its
   rate is now 26,000 and `created_tier` is back-linked from the request.

---

## Feature 5 — Customer Mobile Number as Unique Identifier

**Where:** `posawesome/posawesome/api/customer_mobile.py`

**Normalization** (Nigerian-aware) — all four inputs collapse to one canonical form:
| Input                  | Canonical          |
|------------------------|---------------------|
| `+234 803 123 4567`    | `2348031234567`    |
| `08031234567`          | `2348031234567`    |
| `8031234567`           | `2348031234567`    |
| `234-803-123-4567`     | `2348031234567`    |

**Enforcement:** `Customer.validate` → `enforce_unique_mobile`:
- Empties are allowed (legacy imports without phone numbers don't break).
- Non-empty values must be globally unique across non-disabled customers.

**Migration:** the patch normalizes every existing customer's `mobile_no` to
canonical form (skipping any collisions, which are logged to Error Log).
A DB index `idx_customer_mobile_no` is added for fast lookups.

**Manual smoke test:**
1. Create Customer "Test A" with mobile `08031111111`. Save.
2. Verify `mobile_no` is stored as `2348031111111`.
3. Try creating Customer "Test B" with mobile `+234 803 111 1111`. Save →
   should throw "Duplicate Mobile Number" pointing at Test A.

---

## Feature 6 — Phone-or-Name Customer Autocomplete in POS Awesome

**Endpoint:** `posawesome.posawesome.api.customer_search.search_customers_by_phone_or_name`

**Signature:**
```
GET /api/method/posawesome.posawesome.api.customer_search.search_customers_by_phone_or_name
    ?query=080...           # full phone, partial phone, or name
    &pos_profile=<json>     # optional, scopes to allowed customer_groups
    &limit=20
```

**Ranks results so the cashier's intent wins:**
1. Exact mobile_no match (canonical form)
2. Mobile starts-with
3. Customer ID starts-with
4. Customer name starts-with
5. Customer name contains
6. Email contains

**Returns:** `[{name, customer_name, mobile_no, email_id, customer_group, territory}, …]`

**Vue integration** (drop-in for the existing customer search input in
`Customer.vue` / `Navbar.vue`):

```js
// Replace (or augment) the existing client-side filter with:
async searchCustomers(query) {
    if (!query || query.length < 2) return [];
    const r = await frappe.call({
        method: "posawesome.posawesome.api.customer_search.search_customers_by_phone_or_name",
        args: {
            query,
            pos_profile: JSON.stringify(this.pos_profile),
            limit: 20,
        },
        freeze: false,
    });
    return r.message || [];
}
```

**Manual smoke test:**
1. With ~8,400 customers loaded, type `080` in the POS customer field.
2. The dropdown narrows in <100ms thanks to the mobile_no index.
3. Type `Adebayo` → name match.
4. Pick one → customer panel auto-fills mobile_no, customer_group, territory.

---

## Verification script

```python
# /tmp/verify_phase5.py — run via `bench --site sungasmis.v.frappe.cloud execute "exec(open('/tmp/verify_phase5.py').read())"`
import frappe

print("=== Custom fields ===")
for fn in (
    "Sales Invoice-posa_receipt_barcode",
    "POS Invoice-posa_receipt_barcode",
    "Sales Invoice Item-posa_kg_qty",
    "Sales Invoice Item-posa_rate_per_kg",
):
    print(f"  {fn}: {'OK' if frappe.db.exists('Custom Field', fn) else 'MISSING'}")

print("=== DocTypes ===")
for dt in ("LPG Outlet Price Tier", "LPG Price Change Request"):
    print(f"  {dt}: {'OK' if frappe.db.exists('DocType', dt) else 'MISSING'}")

print("=== Roles ===")
for r in ("LPG POS User", "LPG Plant Manager", "LPG Head of Sales", "LPG Head of Finance"):
    print(f"  {r}: {'OK' if frappe.db.exists('Role', r) else 'MISSING'}")

print("=== Workflow ===")
print(f"  LPG Price Change Approval: "
      f"{'OK' if frappe.db.exists('Workflow', 'LPG Price Change Approval') else 'MISSING'}")
```
