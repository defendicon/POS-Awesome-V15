# Testing and Verification

Codex must verify changes according to the affected area.

---

## Pricing / Discount Changes

Check:

- Normal item price
- Manual rate change
- Discount percentage
- Discount amount
- Pricing Rule
- Customer price list
- POS Profile price list
- POS Profile currency
- POS Profile company
- UOM conversion
- Multi-currency if applicable
- Invoice total
- Print total
- Backend Sales Invoice payload

---

## Cart Changes

Check:

- Add item
- Remove item
- Update quantity
- Change UOM
- Change rate
- Apply discount
- POS Profile warehouse
- POS Profile customer
- POS Profile company
- Large cart performance
- Payment screen total
- Sales Invoice payload
- Offline cart behavior

---

## Offline Changes

Check:

- Fresh cache
- Existing old cache
- Missing cache fields
- Sync after reconnect
- New build update behavior
- App reload behavior
- IndexedDB compatibility
- POS Profile configuration changes
- POS Profile-dependent cache scope

---

## Printing Changes

Check:

- Browser print
- QZ Tray print
- Item rates
- Discounts
- Taxes
- Payment method
- Grand total
- UOM display
- Customer display
- POS Profile print format
- POS Profile letter head

---

## Customer Changes

Check:

- Default customer
- Newly added customer
- Customer-specific price list
- POS Profile fallback price list
- POS Profile default customer
- POS Profile customer filters
- Offline customer data
- Invoice payload customer field
- Printed customer details

---

## POS Profile Changes / POS Profile Dependent Features

Check:

- Correct POS Profile is loaded
- Company comes from POS Profile
- Warehouse comes from POS Profile
- Price List comes from POS Profile when customer-specific price list is not set
- Customer-specific price list priority still works
- Currency is handled correctly
- Taxes and Charges are applied correctly
- Payment Methods match POS Profile configuration
- Sales Invoice payload uses correct POS Profile defaults
- Print format respects POS Profile settings where applicable
- Offline cache loads POS Profile-dependent data correctly
- App does not crash if optional POS Profile fields are missing
- Custom POS Profile fields are not ignored when relevant

---

## UOM Changes

Check:

- Default UOM
- Alternate UOM
- Barcode UOM
- Conversion factor
- Stock quantity
- Item rate
- Discount
- Invoice payload
- Print receipt

---

## Required Final Verification Format

After changes, report:

```md
## Summary
...

## Files Changed
- `path/to/file`: reason

## Linked Features Checked
- ...

## Commands Run
- ...

## Risks / Notes
- ...
```
