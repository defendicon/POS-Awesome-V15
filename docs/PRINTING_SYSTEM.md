# POS Awesome Printing System

## Overview

The printing system extends ERPNext POS Awesome with enterprise label printing capabilities: WYSIWYG label designer, template library, GS1 SSCC-18 shipping labels, multi-format export, printer profiles with failover, data source import, serialization engine, and RFID encoding.

## Architecture

```
frontend/src/posapp/
├── composables/pos/items/
│   ├── useBarcodePrintOutput.ts    # Core print composable — all print paths, GS1, ZPL/EPL/HTML
│   ├── useBarcodePrintQueue.ts     # Item queue management (add/remove/merge/qty)
│   ├── useLabelDesigner.ts         # WYSIWYG canvas state (LabelObject CRUD, undo/redo, snap)
│   ├── useSerializationEngine.ts   # Hybrid client/server atomic serial generator
│   ├── useSsccGenerator.ts         # SSCC-18 shipping label generator
│   ├── useZplGenerator.ts          # ZPL and EPL raw command generation
│   └── useScaleBarcodeSettings.ts  # Scale barcode (price-per-kg) settings
├── components/pos/shell/
│   ├── BarcodePrinting.vue         # Main barcode printing view (items table + config + toolbar)
│   ├── LabelDesigner.vue           # WYSIWYG canvas with SVG rulers, grid, toolbox
│   ├── LabelDesignerPanel.vue      # Property editor panel for selected label object
│   ├── TemplateLibrary.vue         # Save/Load/Delete label templates
│   ├── ImportSourceDialog.vue      # Tabbed SO/DN/BOM import with preview
│   ├── VerificationDialog.vue      # HID barcode scanner verification
│   └── LabelPreviewDialog.vue      # Full-screen label preview iframe
├── services/
│   ├── qzTray.ts                   # QZ Tray connection, cert, print HTML/raw/document
│   └── exportService.ts            # PNG/SVG/CSV export utilities

posawesome/posawesome/
├── api/
│   ├── printer_api.py              # Printer profile CRUD, failover, routing, test connection
│   ├── label_data_sources.py       # SO/DN/BOM item fetching, atomic serial counter
│   ├── sscc_api.py                 # SSCC-18 atomic serial generation
│   ├── barcode_print_log.py        # Bulk insert, verify, stats for print audit
│   └── label_templates.py          # Save/load/delete label templates
├── doctype/
│   ├── posa_printer_profile/       # Printer profile DocType (RFID, routing, failover)
│   ├── posa_printer_routing_rule/  # Child table: item_group/warehouse -> printer
│   ├── barcode_label_template/     # Saved label templates
│   └── barcode_print_log/          # Print audit log
└── fixtures/
    └── custom_field.json           # posa_default_printer_profile on POS Profile
```

## Print Paths

There are 4 independent print paths, each with audit logging:

### 1. Browser Print (`printLabels`)
- Opens popup window with HTML + JsBarcode script
- Renders barcodes via `JsBarcode(".barcode").init()`
- Detects print via `matchMedia("print")` listener
- Falls back to `window.close()` timeout after 3s

### 2. QZ Tray HTML (`printLabelsThermal`)
- Sends full HTML page to QZ Tray with `printHtmlViaQz()`
- Width set from label size preset (80mm default)
- Uses `qz.configs.create()` with pixel/html type

### 3. QZ Tray Raw ZPL (`printLabelsRaw` + ZPL)
- Generates ZPL commands via `useZplGenerator().generateZpl()`
- Sends raw ASCII with `sendRawToQz()`
- Supports RFID header injection (`^RS`, `^RFE`)
- Barcode commands mapped to Zebra ZPL: `^BCN` (Code128), `^BEN` (EAN), `^BUN` (UPC), `^B2N` (ITF/ITF14), `^BKN` (Codabar), `^B3N` (Code39)

### 4. QZ Tray Raw EPL (`printLabelsRaw` + EPL)
- Generates EPL commands via `useZplGenerator().generateEpl()`
- Barcode types mapped: `0` (Code128), `1` (Code39), `2` (ITF), `E` (EAN13), `E8` (EAN8), `U` (UPC), `K` (Codabar)

### Print Failover Cascade
```
primary thermal printer
  → fallback printer(s) in same printer_group
    → browser print fallback
```

Each step shows a toast notification. The failover is implemented in `printLabelsThermalWithFailover()` and `printLabelsRawWithFailover()`.

## Printer Profiles

**DocType:** `posa_printer_profile` (POSAwesome module)

Fields:
- `printer_name` (Data, unique, autoname)
- `printer_type` (Select: ZPL/EPL/HTML)
- `dpi` (Int: 96/203/300/600)
- `ip_address`, `port` (optional, for test_connection)
- `is_default`, `disabled` (Check)
- `default_label_width`, `default_label_height` (Float, mm)
- `printer_group` (Data — same group = failover peers)
- `rfid_enabled`, `rfid_tag_type`, `rfid_epc_prefix`, `rfid_encoding_power` — RFID encoding config
- `routing_rules` (Table → POSA Printer Routing Rule: item_group, warehouse → printer)

**API** (`printer_api.py`):
- `get_printer_profiles()` — List all non-disabled profiles
- `save_printer_profile()` — Create/update
- `delete_printer_profile(name)` — Delete
- `test_connection(name)` — Best-effort HTTP reachability check
- `get_printers_for_failover(group, exclude_name)` — Same-group peers
- `get_routed_printers(items, profile_name)` — Partition items by routing rules

**POS Profile integration:** `posa_default_printer_profile` Link field on POS Profile (registered in `custom_field.json` + `hooks.py` fixtures).

## Label Designer

### Object Types
| Type | Description | Properties |
|------|-------------|------------|
| `text` | Static/dynamic text | content, fontSize, fontFamily, fontBold, fontItalic, fontUnderline, textAlign, color |
| `barcode` | JsBarcode rendered at print | symbology, content (template), rotation |
| `shape` | Rectangle or ellipse | shapeType, color, borderColor, borderWidth |
| `line` | Horizontal or vertical | lineDirection, color, borderWidth |
| `image` | Uploaded image (base64) | imageSrc |
| `datetime` | Date/time with format | content like `{date:YYYY-MM-DD}` or `{time:HH:mm:ss}` |

### Template Variables (resolved at print time via `resolveTemplateVars`)
- `{item_code}`, `{item_name}`, `{barcode}`, `{price}`, `{uom}`, `{qty}`
- `{batch_no}`, `{serial_no}`, `{warehouse}`, `{warehouse_location}`
- `{grams}`, `{date:format}`, `{time:format}` (e.g., `{date:YYYY-MM-DD}`, `{time:HH:mm}`)

### Conditional Visibility
Each object has a `condition` field evaluated at print time. If the resolved template string is empty, "false", or "0", the object is hidden.

### Keyboard Shortcuts
- `Ctrl+Z` / `Ctrl+Y` — Undo/redo
- `Delete` / `Backspace` — Delete selected object
- `Ctrl+C` / `Ctrl+V` — Copy/paste object
- `Ctrl+A` — Select all
- `Arrow keys` — Nudge 1px (Shift=10px)
- `Escape` — Deselect

## GS1 Compliance Engine

Located in `useBarcodePrintOutput.ts`:

- **Spec database** (`GS1_SPECS`): EAN13, EAN8, UPC, ITF14, ITF, GS1_128, CODE128, CODE39, CODABAR — each with minHeightMm, minModuleMm, quietZone, totalModules
- **`calculateBarcodeDimensions()`** — Given symbology + print context (DPI, label size, output type), calculates pixel dimensions, module width, quiet zone, font size, and compliance status
- **Compliance levels:** `compliant`, `below_minimum`, `truncated`, `unfit`
- **`validateBarcodeData()`** — Checks digit count per symbology, EAN/UPC/EAN8 check digits
- **Auto-symbology:** `guessSymbologyFromBarcode()` infers from digit count (13→EAN13, 12→UPC, 8→EAN8, 14→ITF14, all digits→ITF, else CODE128)

## Data Sources & Serialization

### Import Sources (`label_data_sources.py`)
- `search_label_source_documents(text, doctype, company, limit)` — Searches submitted SO/DN/BOM by name
- `get_sales_order_items(sales_order)` — Items from SO
- `get_delivery_note_items(delivery_note)` — Items from DN
- `get_bom_items(bom, for_qty)` — BOM items with `for_qty/bom.quantity` scaling
- `get_next_serial_numbers(naming_series, count)` — Atomic `make_autoname` counter with FOR UPDATE lock

### Serialization Engine (`useSerializationEngine.ts`)
- Hybrid: server reserves atomic numbers, client formats with prefix/suffix/zero-pad/check-digit
- Check digits: Mod 10 (numeric), Mod 43 (alphanumeric)
- Two scopes: `per_job` (one serial per job), `per_label` (one serial per label copy)
- Naming Series pattern: `POS-SERIAL-.#####` (default)

### Import Flow
1. User opens ImportSourceDialog, selects SO/DN/BOM tab
2. Searches document by name, selects results
3. Preview table shows items with editable qty
4. BOM tab shows production qty field for scaling
5. On Import: if serialization enabled, `applySerialization()` generates atomic serials per label copy
6. If RFID + serialization enabled, `_epc_data` is generated from serial numbers

## RFID Encoding (PR 10)

- ZPL-only (warns if format is EPL/HTML)
- Commands: `^RS` (setup) + `^RFE` (EPC write)
- Tag types: Generic, AD-222, AD-220, AD-236, AD-431, AD-432, AD-612, AD-620, AD-621, AD-640
- EPC data built from `rfidEpcPrefix` (hex) + serial/barcode hex encoding
- Configured via Printer Profile fields
- UI: "RFID Encode" checkbox (disabled for non-ZPL) + EPC Prefix text field

## Print Audit Log

**DocType:** `Barcode Print Log` (`barcode_print_log.py`)
- Fields: item_code, item_name, barcode, barcode_type, qty, uom, price, symbology, label_size, user, company, pos_profile, print_method, status, error_message, reference_doctype/docname, batch_no, serial_no, warehouse
- API: `batch_create_print_logs(entries)` — bulk insert in single transaction
- API: `verify_print_log(docname)` — mark verified
- API: `get_print_log_stats(filters)` — aggregate stats
- Triggered in all 4 print paths via `logPrintEvent()`
- Detects actual print via `matchMedia("print")` change listener (more reliable than `onafterprint`)

## Barcode Verification

**`VerificationDialog.vue`:**
- HID barcode scanner capture with auto-focused invisible input
- 500ms re-focus timer after each scan
- Calls `verify_print_log` API to mark labels as verified

## Export Service (`exportService.ts`)

- **`exportPng(content, style)`** — Renders labels in popup, uses html2canvas (from html2pdf bundle), downloads as PNG
- **`exportSvg(content, style)`** — Same render, embeds canvas as `<image>` data URI in SVG
- **`exportCsv(items)`** — Downloads item data as CSV spreadsheet

All use `html2pdf.bundle.min.js` + `JsBarcode.all.min.js` from `/assets/posawesome/dist/js/libs/`.

## Label Sizes (`PAGE_FORMAT_PRESETS`)

| Label | Value | Type | Width (mm) | Height (mm) |
|-------|-------|------|-----------|-------------|
| A4 Sheet | A4 | A4 | 63.5 (col) | 38 (row) |
| 25×25mm | 25x25mm | thermal | 25 | 25 |
| 38×25mm | 38x25mm | thermal | 38 | 25 |
| 50×25mm | 50x25mm | thermal | 50 | 25 |
| 75×25mm | 75x25mm | thermal | 75 | 25 |
| 100×50mm | 100x50mm | thermal | 100 | 50 |
| 100×100mm | 100x100mm | thermal | 100 | 100 |
| 100×150mm (4×6") | 100x150mm | thermal | 100 | 150 |
| 100×200mm | 100x200mm | thermal | 100 | 200 |

## Key Conventions

1. **`generateId()` polyfill** — `crypto.randomUUID()` unavailable (non-secure context); use this instead
2. **No `window.onafterprint`** — use `matchMedia("print")` change listener
3. **`v-select` with full objects** — use `return-object` prop when `v-model` binds `PrinterProfile` objects
4. **DPI defaults** — Browser=96, Thermal ZPL/EPL=203, high-res=300
5. **QZ Tray cert** — Signed via Frappe server side; `setupQzCertificate()` API creates + returns PEM
6. **Doctype module** — Always `POSAwesome`
7. **Fixture registration** — Custom fields registered in `hooks.py` under `fixtures`
8. **Offline safety** — All print API calls use `silent: true`; failures never block the main flow
9. **Audit must never block** — `logPrintEvent()` catches all errors silently

## Troubleshooting

- **QZ Tray not connecting:** Check `setupQzCertificate()` was run; check port 4242; check cert trust
- **RFID not encoding:** Ensure output format is ZPL; verify printer supports RFID; check `^RS` parameters
- **Barcode not appearing in print:** JsBarcode renders client-side; verify the script loads; check popup blockers
- **GS1 compliance warnings:** Label too small for symbology quiet zones; switch to smaller symbology or larger label
- **Serial numbers not incrementing:** Check Naming Series DocType exists; verify `make_autoname` permissions
- **Printer profile not saving:** All fields required? Check `printer_name` uniqueness (autoname field)
