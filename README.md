<div align="center">
    <img src="https://frappecloud.com/files/pos.png" height="128">
    <h2>POS AWESOME</h2>
</div>

#### An open-source Point of Sale for [Erpnext](https://github.com/frappe/erpnext) using [Vue.js](https://github.com/vuejs/vue) and [Vuetify](https://github.com/vuetifyjs/vuetify) (VERSION 15 and 16 Support)

---

NOTE: Application is undergoing major refactoring. please report for any bug or issue it will be solved on high priority. For now it is stable and tested.

Recommended to use stable version for production. 

### Quick Start

Follow these steps to install and start using POS Awesome:

1. **Install the app** in your bench:
    1. `bench get-app https://github.com/defendicon/POS-Awesome-V15`
    2. `bench setup requirements`
    3. `bench build --app posawesome`
    4. `bench restart`
    5. `bench --site your.site.name install-app posawesome`
    6. `bench --site your.site.name migrate`

2. **Open the POS Awesome workspace**

    Log in to ERPNext, go to the home page, and click **POS Awesome** from the left-hand menu.

3. **Create a POS Profile**
    - Navigate to **POS Awesome → POS Profile → New**.
    - Fill in the mandatory fields:
        - **Name** – any label for this profile.
        - **Company** – the company under which transactions will be recorded.
        - **Warehouse** – the default warehouse for item stock deduction.
        - **Customer** – a default customer (create one if none exists).
        - **Applicable for Users** – add the users allowed to use this POS.
        - **Payment Methods** – add accepted modes (e.g., Cash, Card).

    - Optional operational settings:
        - Assign trusted users the **POS Awesome Supervisor** role from **User > Roles** when they need supervisor-only POS controls.
        - Enable **Allow Offline Sale Without Stock Verification** if offline invoices should be saved even when local stock data is missing or insufficient. Stock is still validated again on the server when the invoice syncs.

4. **Save the profile**

5. **Start selling**

    Return to the **POS Awesome** workspace and launch the POS. Select the newly created profile if prompted and begin creating invoices.

For more details, see the [POS Awesome Wiki](https://github.com/yrestom/POS-Awesome/wiki).

### Docker Deployment

POS Awesome is Docker-ready as a Frappe custom-image app. Use
[`docker/apps.json`](docker/apps.json) for ERPNext/Frappe 16 or
[`docker/apps.version-15.json`](docker/apps.version-15.json) for ERPNext/Frappe
15 with Frappe Docker to build an image that contains ERPNext and POS Awesome,
then install `posawesome` on each site and run migrations. See
[`docs/DOCKER_DEPLOYMENT.md`](docs/DOCKER_DEPLOYMENT.md) for the full build,
install, and verification checklist.

Production M-Pesa installations must also follow the
[`M-Pesa callback security upgrade runbook`](docs/M-PESA_CALLBACK_SECURITY.md)
before enabling callback processing after an upgrade.

---

### Update Instructions

After switching branches or pulling latest changes:

1. cd apps/posawesome
2. git pull
3. yarn install
4. cd ../..
5. bench build --app posawesome
6. bench --site your.site migrate

Go to developer tools in browser, then go to application tab, then go to storage and clear site data.
After clearing site data go to browser settings and delete cache and images data in history also.

---

### Update Notifications (POS)

- POS automatically checks for updates every 24 hours.
- Manual check: **Menu → Check for Updates**.
- Updates are checked **only against the current git branch**.
- The update dialog shows **all commits ahead** (commit message + date).
- Dismissed updates will reappear only when a **new commit** is available.
- It only check for updates on the current branch you are on. It will not update in backend.

---

### Project Structure (Modernized)

Key folders in the modernized POS app:

- `frontend/src/posapp/components/pos/` UI split into small, focused components (invoice, items, payments, closing, etc.)
- `frontend/src/posapp/composables/` business logic and state orchestration (invoice, items, payments, offers, offline)
- `frontend/src/posapp/stores/` Pinia stores for normalized app state
- `posawesome/posawesome/api/` backend APIs split by domain (invoice_processing, item_processing, payment_processing)

---

### TypeScript Migration Status

The POS frontend has been migrated to TypeScript. If you add new modules, prefer `.ts`/`.vue` with `lang="ts"` and keep types in `frontend/src/posapp/types/`.

---

### Returns & Discounts (Important Behavior)

- **Return invoices** use negative quantities and negative totals.
- **Additional Discount (Percentage)** is recalculated automatically based on the current return total.
- **Additional Discount (Amount)** is **prorated** on partial returns.
- Applied as a **negative** discount on returns.
- For **Return without Invoice**, discount logic depends on the POS Profile and may require manual adjustment.

---

### Item Exchange

Item exchange creates a linked return Sales Invoice and replacement Sales Invoice while keeping ERPNext stock, receivable, and accounting entries separate and auditable.

- Enable **Allow Return** and **Allow Item Exchange** on the POS Profile.
- Start from a submitted Sales Invoice, select the quantities being returned, then add replacement items to the active sale.
- The return and replacement use the same company, POS Profile, customer, and currency.
- Return credit is allocated against the replacement invoice automatically.
- The cashier collects only a positive difference. Excess return value remains customer credit, and equal values complete as an even exchange.
- Submission is online-only, synchronous, and idempotent. A lost response can recover the completed exchange without creating duplicate invoices.
- Browser, QZ HTML, and raw ESC/POS printing produce one combined exchange receipt containing both item groups, both invoice references, allocated credit, payment, and final customer credit/payment result.
- **Print Last Invoice** reprints the combined receipt for the most recent exchange in the current POS session.
- System Managers can cancel a completed exchange in dependency order: reconciliation journal, replacement invoice, then return invoice. The audit record cannot be deleted while linked documents remain submitted.
- Open **POS Awesome → Item Exchange → Item Exchange Audit** for date, company, POS Profile, opening shift, customer, cashier, status, settlement, currency, invoice, reconciliation, and request-ID reporting. Standard ERPNext export is available from the report.

Current guardrails:

- Exchange currently supports **Sales Invoice mode**. POS Invoice mode is intentionally blocked until an equivalent reconciliation path is verified.
- Exchange cannot be submitted through the offline invoice queue.
- Report amount summaries are shown only when completed rows use one currency; mixed currencies are never added together.

---

### Payments & Write-Offs

- Write-off amount is capped by POS Profile and validated against payment coverage.
- Refunds/returns use negative payment amounts.
- Partial payments and credit sales respect the same write-off limits.
- POS Awesome Payments supports **Receive** and **Pay** workflows from the Payments route.
- **Receive** is used for customer payments and can create new Payment Entries, reconcile unallocated payments, reconcile M-Pesa payments, and allocate payments against outstanding Sales Invoices.
- **Pay** supports customer payouts, supplier/vendor payments, and employee payments. Supplier/vendor payments can be allocated against outstanding Purchase Invoices.
- Reconciliation can be done manually by selecting invoices and unallocated payments, or automatically with **Auto Allocate Payment Amount** / auto reconcile.
- Customer reconciliation supports Sales Invoices, credit notes, unallocated Payment Entries, and M-Pesa entries when enabled.
- Supplier/vendor reconciliation supports Purchase Invoices and supplier unallocated payments.
- Payment creation and reconciliation are controlled from POS Profile with `Use POS Awesome Payments`, `Allow Make New Payments`, `Allow Reconcile Payments`, and `Allow Mpesa Reconcile Payments`.
- Multi-currency payment methods are supported with exchange-rate handling when invoice, party, and bank/cash account currencies differ.

---

### Offline Mode

- Invoices, customers, and payments can be created offline.
- Background sync replays changes when connectivity returns.
- Failed offline submissions are saved as Drafts.
- **Allow Offline Sale Without Stock Verification** on POS Profile lets offline invoice saving continue when local stock cache is missing or below the requested quantity.
- This option only skips local offline stock blocking. Server-side stock validation still runs when the invoice syncs online.

---

### POS Awesome Supervisor

Supervisor access is now controlled by the **POS Awesome Supervisor** role on the **User** doctype. This replaces the old user-level `posa_is_pos_supervisor` custom field and uses the new role name instead of **POS Supervisor**.

Users with this role can access supervisor-only POS functions:

- Open the **Awesome Dashboard** from the POS navigation/menu, when the dashboard is enabled for the POS Profile.
- View dashboard data for the current profile, a specific profile, or all allowed profiles depending on dashboard scope settings.
- Use supervisor invoice-management scope to view/search submitted invoices and drafts across the company, with profile filtering available from the invoice management dialog.
- See supervisor-only item rate details such as last purchase rate and cost/manufacturing cost while selecting items.
- Issue and top up gift cards from the payments/gift-card workflows. Non-supervisors can still check gift-card balances when gift cards are enabled.

To grant access, open the ERPNext **User** record and add **POS Awesome Supervisor** in the user's Roles table.

---

### Gift Cards

Gift cards are available when **Use Gift Cards** is enabled on POS Profile.

- Cashiers can scan or enter gift-card codes and check live balance/status.
- Gift cards can be redeemed from the invoice payment screen.
- POS supervisors can issue new gift cards and top up existing cards from the payment/gift-card workflows.
- Gift-card issue and top-up actions create the required accounting entry against the configured gift-card liability account.
- Supervisor management is controlled by POS Profile gift-card settings and the **POS Awesome Supervisor** role.

---

### Purchase Orders, Receiving, And Purchase Payments

The **Purchase Order** module lets users create purchasing documents directly from POS.

- Create Purchase Orders from the POS item selector.
- Select supplier/vendor, warehouse, transaction date, and schedule date.
- Use supplier-specific buying price lists and supplier currency where available.
- Optionally receive stock immediately by creating a linked Purchase Receipt.
- Optionally create a linked Purchase Invoice.
- Pay suppliers/vendors from the same purchase flow using POS Profile payment methods.
- Create new suppliers/vendors from POS when `Allow Create Suppliers from POS` is enabled.
- Create purchase items from POS when `Allow Create Items from POS` is enabled.

Configure the purchase feature from POS Profile:

- `Allow Purchase Order`
- `Allow Receive Stock from POS`
- `Allow Create Items from POS`
- `Allow Create Suppliers from POS`

---

### Barcode Printing

The **Barcode Printing** module prints item labels directly from POS.

- Add barcode-enabled items from the item selector.
- Choose item UOM and label quantity per row.
- Print labels or export them as PDF.
- Configure A4 label grids by rows and columns.
- Optionally include item price and batch/serial details on labels.
- Supports scale/weighted barcode generation using scale barcode settings and item/UOM barcode templates.

---

### Raw Printing With QZ Tray

Raw printing sends printer commands directly to the printer through QZ Tray instead of rendering an ERPNext HTML print format in the browser. Use it for fast thermal receipt printing, paper cutting, drawer pulses, and native label-printer commands.

Supported raw print paths:

- **Barcodes / labels**: already supported from the Barcode Printing screen using raw ZPL/EPL output for compatible label printers.
- **Invoices / POS Invoices**: supported through POS Profile raw receipt printing.
- **Sales Orders**: supported through the same POS Profile raw receipt printing flow.
- **Payment Entries / receipts**: supported through the same POS Profile raw receipt printing flow.
- **Item exchanges**: supported as one combined return/replacement receipt through browser, QZ HTML, or raw ESC/POS output.

#### Setup

1. Install and run **QZ Tray** on each POS terminal.
2. In POS Awesome, open the QZ Tray setup dialog and connect QZ Tray.
3. Generate/download the QZ certificate from POS Awesome, trust it in QZ Tray, then restart QZ Tray.
4. Select the receipt printer and save it as the POS Profile default if this terminal should always use it.
5. Open **POS Profile** and configure:
    - `Enable Silent Print`: optional for HTML QZ printing; raw receipt printing can use QZ directly without this option
    - `QZ Tray Printer Name`: exact printer name detected by QZ Tray
    - `Use Raw Receipt Printing`: enabled
    - `Raw Receipt Width`: `42` for most 80mm printers, `32` for most 58mm printers

#### How To Use

- For invoices/orders/payment receipts, submit and print normally from POS. When `Use Raw Receipt Printing` is enabled, POS Awesome sends ESC/POS raw commands through QZ Tray without opening the browser print dialog.
- For barcode and item labels, open **Barcode Printing**, choose the label output format, and use raw ZPL/EPL for compatible thermal label printers.
- If raw receipt printing is disabled, POS Awesome keeps using the existing QZ HTML/browser print flow and POS Profile print format behavior.
- If QZ Tray is unavailable, document printing falls back to the existing browser/silent print path where applicable.

#### Notes

- Raw receipt printing is optimized for thermal receipt printers that support **ESC/POS**.
- Raw barcode/label printing is optimized for label printers that support **ZPL** or **EPL**.
- Raw receipts are text-command receipts, so they will not exactly match custom ERPNext HTML/CSS print formats or letterheads.
- Printed amounts are loaded from the submitted ERPNext document so invoice totals, taxes, discounts, payments, and outstanding amounts stay aligned with the saved invoice/order/payment.

---

### POS Cash Movement (Journal Entry Based)

Use this feature to post shift-level cash expenses and cash deposits from POS App without touching monolithic accounting flows.

#### Usage Notes

- Open POS App and go to `Cash Movement` from the side menu (visible only if enabled in POS Profile).
- Submit `Expense` to book: **Dr Expense Account, Cr POS Cash Account**.
- Submit `Deposit` to book: **Dr Back Office Cash Account, Cr POS Cash Account**.
- Entries are saved as `POS Cash Movement` and linked to a submitted `Journal Entry`.
- History supports:
  - Submitted/Cancelled/Draft filters
  - Expense/Deposit filters
  - Journal Entry reference visibility
  - Cancel action (profile-controlled)
  - Delete action for cancelled records (profile-controlled)

#### Admin Configuration (POS Profile)

Configure these fields in `POS Profile`:

- `Enable Cash Movement`
- `Allow POS Expense`
- `Allow Cash Deposit`
- `Default POS Expense Account`
- `Back Office Cash Account`
- `Allow Cancel Submitted Cash Movement`
- `Allow Delete Cancelled Cash Movement`
- `Require Cash Movement Remarks`
- `Cash Movement Max Amount`

Recommended setup:

- Set a dedicated `Cash` mode of payment and map it correctly at company level.
- Set `Default POS Expense Account` and `Back Office Cash Account` before enabling user access.
- Enable cancel/delete only for trusted operational roles.

#### Offline + Sync Behavior

- Cash movements queue locally when POS is offline.
- Sync runs from:
  - Main sync action in POS layout
  - Manual sync button in Cash Movement screen when queue exists
- Duplicate-safe replay uses `client_request_id` idempotency.

#### Closing Shift Impact

- Submitted cash movements are included in shift overview.
- Expected cash on hand is reduced by submitted cash movement total.
- Closing screen shows a dedicated submitted cash movement summary.

#### Known Limitations / Guardrails

- Backend permissioned runtime tests require a full Frappe/ERPNext bench environment.
- Cash movement amounts are currently reconciled in company currency for closing impact.
- If profile flags are disabled mid-shift, creation and management actions are blocked by backend checks.

For deployment details, see `CASH_MOVEMENT_ROLLOUT.md`.

---

### Additional Operational Controls And Audit Features

The following production features are also available and are controlled by POS Profile or related POS Awesome setup records:

- **Awesome Dashboard**: sales, payments, customer, product, staff, inventory, supplier, stock-movement, discount/void/return, branch, and finance insights with supervisor and company/profile scope controls.
- **Customer Display**: a separate customer-facing display that receives the live cart, totals, payments, and completion state; it can be opened manually or automatically and retains a safe offline snapshot.
- **Below-Cost Sale Guard**: configurable block, warning, or POS Supervisor override policy with minimum margin, missing-cost handling, mandatory override reason, approver, and invoice audit fields.
- **Return Validity**: optional POS Settings/POS Profile return-validity days stored on submitted invoices and enforced when selecting an invoice for return.
- **Multi-Currency Tender And Change**: payment methods can retain original tender currency, exchange rate, account currency, and invoice equivalent; physical change can be recorded in configured currencies.
- **Barcode Printer Profiles**: ZPL, EPL, and HTML printer profiles support label dimensions, DPI, printer groups/failover, item-group or warehouse routing, optional RFID settings, and barcode print audit logs.
- **Print Format Rules**: customer-group-specific print format selection can override the default POS Profile print format where configured.
- **Invoice Submission Ledger**: background and duplicate-safe submissions retain request identity and processing status for operational recovery and audit.
- **Sales Person Assignment**: restrict the selectable Sales Persons from the POS Profile and assign the selected person while completing the sale.
- **Extended Customer Details**: customer creation and editing support birthday, referral, contact, tax, and address information used by POS customer workflows.

---

### Debugging (Quick Tips)

- Check browser console for errors and attached logs with issue for better debugging.
- If UI totals look stale after a major update, clear site data from developer tools and browser cache and files from browsing history.

---


### Electron Desktop App

Use the bundled Electron shell when you need an offline-friendly desktop build that remembers the ERPNext server URL.

1. **Install dependencies** (root): `yarn install`
2. **Run the desktop shell**: `yarn electron:dev`
3. **Build installers**: `yarn electron:build`

Notes:

- The app prompts for the server URL on first launch (the `/app/posapp` path is added automatically) and saves it locally so you do not need to re-enter it.
- If connectivity drops, an offline screen appears with options to retry or change the saved server.
- Windows (`.exe`) builds require Wine/Mono when running `electron-builder` on Linux. By default, `yarn electron:build` targets the current platform and writes artifacts into `dist-electron/`.

### Main Features

#### 🏗️ Architecture (New)

- **Vue Router**: Fully Client-Side Routing for instant navigation between POS, Orders, and Payments.
- **Modular Design**: Separated concerns using Vue 3 Composition API.

#### 🎨 UI/UX & Interface

- **Modern Interface**: User-friendly design using Vue.js and Vuetify, optimized for speed and experience.
- **Counter Grid**: Optional keyboard-first interface for fast pharmacy and high-volume counter sales.
- **View Modes**: Toggle between List View (efficient for data entry) and Card View (visual with item images).
- **Dark Mode & Theming**: Built-in dark mode support with automatic or manual toggle, plus customizable theme options.
- **Custom Branding**: Use a POS Profile-specific brand name, short name, and logo throughout the POS interface.
- **RTL Support**: Full support for Right-to-Left languages (Arabic, etc.).
- **System Status Gadgets**: Real-time monitoring of Server, Database, Cache, and Network status directly from the POS navbar.
- **Counter Grid Health**: View connectivity, queued sales, pricing readiness, stock confidence, and catalog status from the counter screen.
- **Fly to Cart Animation**: Visual feedback when adding items to the cart.
- **Performance**: Optimized for large datasets using virtual scrolling and efficient state management.
- **Keyboard-First Operation**: Navigate product results, cart rows, drafts, item tools, invoice management, and payments without leaving the keyboard.
- **Direct Cart Editing**: Edit quantity, UOM, rate, and discounts directly in the invoice grid with live total updates.
- **Multi-Language**: Supports English, Arabic, Portuguese, Spanish, and more.

#### 💸 Transactions & Sales

- **Multi-Currency**: Full support for invoicing in different currencies with automatic exchange rate fetching.
- **Quotations**: Create, update, and submit Quotations directly from the POS interface.
- **Sales Orders**: Create Sales Orders directly. Configurable "Sales Order Only" mode available.
- **Purchase Orders**: Create supplier/vendor Purchase Orders from POS, with optional Purchase Receipt, Purchase Invoice, and supplier payment creation.
- **Purchase Receiving**: Receive stock from POS when allowed by POS Profile.
- **Returns**: Process returns for Cash or Customer Credit (Credit Note).
- **Item Exchange**: Return selected items, add replacements, allocate the credit, and collect only the net difference using linked ERPNext invoices.
- **Credit Sales**: Support for credit sales with configurable due dates.
- **Change Posting Date**: Ability to change the transaction posting date (backdating) if allowed by profile.
- **Additional Notes**: Fields for internal notes and authorization codes.
- **Customer PO**: Capture Customer Purchase Order (PO) number and date.
- **Submitted Invoice Correction**: Authorized users can preview and submit controlled amendments to eligible POS and Sales Invoices.
- **Settlement Guidance**: Invoice corrections show whether the cashier must collect or refund a difference and rebalance the primary payment automatically.
- **Cashier Audit Trail**: The verified cashier is recorded on submitted POS and Sales Invoices.
- **Exchange Audit Trail**: Linked original, return, replacement, reconciliation, settlement, cashier, and request references are available in the Item Exchange Audit report.

#### 📦 Inventory & Products

- **Batch & Serial**: Comprehensive support for Batch and Serial number selection and search.
- **Product Bundles**: Auto-apply batches for bundle items.
- **Variants**: Support for template items with product variants.
- **UOM Support**: Barcode and pricing support specific to Units of Measure.
- **Weighted Products**: Support for scale/weighted product barcodes.
- **Stock Validation**: Configurable stock validation (warn or block) including negative stock handling.
- **Fast Counter Catalog**: Keep frequently sold products in a fast local catalog with exact code/barcode lookup and IndexedDB/server fallback for long-tail items.
- **Pharmacy Search**: Search medicine-specific details such as generic, company, pack, rack, and pack/loose availability.
- **Generic Alternatives**: Suggest in-stock medicines with the same generic using live stock, customer pricing, and profitability-aware ranking.
- **Positive Stock Filter**: Optionally show only available products in Counter Grid while leaving the standard POS catalog unchanged.
- **Item Quick Edit**: Authorized users can update item details, barcode, UOM, supplier, retail price, trade price, and POS sale-control flags without leaving POS.
- **Item Sales History**: Review previous invoice-level sales for an item from the POS workflow.
- **Controlled Sale Rules**: Warn for controlled items and block locked, non-discountable, or below-buying-price sales in both POS and server validation.
- **Automatic Batch Allocation**: Apply the POS Profile auto-batch setting, respect stock reserved by the cart, and continue into the next available batch when required.
- **Offline Stock Verification Skip**: POS Profile option to save offline invoices even when local stock cannot be verified, while keeping server validation during sync.
- **Barcode Printing**: Build item label batches, print barcodes, export PDF labels, include price/batch/serial data, and generate scale barcodes for weighted items.

#### 💳 Payments & Pricing

- **POS Awesome Payments**: Dedicated payment route for customer Receive workflows and Pay workflows for customers, suppliers/vendors, and employees.
- **Payment Entry Creation**: Create new Payment Entries from POS when enabled in POS Profile.
- **Payment Reconciliation**: Reconcile outstanding invoices against unallocated payments, credit notes, and M-Pesa payments.
- **Auto Reconcile**: Automatically allocate available unallocated payments against outstanding invoices in chronological order.
- **Supplier/Vendor Payments**: Pay suppliers/vendors and allocate payments against Purchase Invoices.
- **Employee Payments**: Pay employees through the POS payments workflow.
- **Payment Auto Allocation**: Automatically allocate newly created payment amounts against selected invoices when enabled.
- **Payment Reference Tracking**: Capture reference number/date for POS-created payments.
- **Smart Tender / Quick Cash**: "Quick Cash" suggestions based on currency denominations for faster checkout. Entering `0` in the Alt+X / Alt+P quick cash prompt submits a credit sale when `Allow Credit Sale` is enabled on the POS Profile.
- **Counter Grid Fast Tender**: Select configured payment methods with `Ctrl/Cmd+1-9`, then submit or submit-and-print from the keyboard.
- **Split Payments**: Accept multiple payment modes for a single transaction.
- **M-Pesa**: Integrated M-Pesa mobile payment support with duplicate/replay and callback transaction validation.
- **Duplicate-Safe Submission**: Stable request tracking protects online and offline invoice submission from accidental duplicate invoices and multi-terminal retries.
- **Gift Cards**: Check gift-card balances, redeem gift cards at checkout, and allow supervisors to issue or top up cards.
- **Loyalty Points**: Earn and redeem Customer Loyalty Points.
- **Coupons & Offers**: Support for POS Coupons, Promotional Offers, and Referral Codes.
- **Price Lists**: Support for Customer/Group price lists, with option to manually select Price List per transaction.
- **Discounts**: Customer-level and Transaction-level discount support.
- **Delivery Charges**: Add shipping/delivery charges to the invoice.
- **Write Off**: Option to write off small difference amounts in change.

#### 🔄 Offline & Technical

- **Robust Offline Mode**: Create invoices and customers offline. Data syncs automatically when reconnected.
- **Offline Payments**: POS Awesome Payments can be queued offline and synced when connectivity returns.
- **Background Sync**: Advanced background synchronization for offline transactions and master data updates.
- **Local Storage**: Option to use browser Local Storage for caching to improve reliability.
- **Background Submission**: Enqueue invoice submission to background jobs for faster UI response.
- **Drafts**: Failed offline submissions are safely saved as Draft documents.
- **Offline Stock Guard Control**: `Allow Offline Sale Without Stock Verification` can defer stock blocking to online sync when local stock data is incomplete.
- **Offline Pharmacy Catalog**: Medicine search details and pack/loose projections remain available from the local catalog while offline.
- **Reliable Catalog Refresh**: Failed or overlapping refreshes keep the latest usable catalog, expose sync time, and support manual refresh/rebuild recovery.
- **Safe Queue Replay**: Offline invoices preserve their request identity and show pending/error readiness before synchronization.
- **Slow Startup Recovery**: Slow cashier and product requests provide retry/status feedback while catalog loading can continue safely in the background.
- **Browser Compatibility**: Production assets include compatibility handling for supported Chrome/Chromium POS terminals and resilient service-worker updates.

#### ⚙️ Configuration & Shift Management

- **Shift Management**: Opening and Closing shifts with cash reconciliation and detailed payment breakdown reports.
- **POS Interface Selection**: Choose the standard interface or Counter Grid independently for each POS Profile.
- **Custom POS Branding**: Enable profile-specific brand identity or use the default POS Awesome branding.
- **Role-Based Supervisor Access**: Supervisor features are granted through the **POS Awesome Supervisor** role on User roles.
- **Secure Cashier Switching**: Lock the terminal and switch between POS Profile-authorized cashiers using server-validated employee PINs.
- **Authoritative Terminal State**: Protected POS actions verify the active cashier and terminal lock state with the server.
- **Cart Quantity Focus**: Configure whether newly added items automatically focus the cart quantity editor.
- **Cash Movement**: Profile-controlled POS expenses and cash deposits with closing-shift impact.
- **Customer Balance**: Option to display current customer balance on the main screen.
- **Address Management**: Manage multiple shipping addresses for customers.
- **ERPNext v15 and v16 Support**: Supported on both ERPNext/Frappe 15 and 16 runtimes.

### Shortcuts:

#### Global (Invoice Screen)

- `F4` profile switch (currently shows “not available” message).
- `F6` open new customer form.
- `F7` open shift details.
- `F8` lock the POS and require an authorized cashier PIN to resume.
- `F12` open Item Quick Edit for the currently selected item when enabled and authorized.

#### Alt + Number

- `Alt + 1` close payments panel.
- `Alt + 2` open cancel dialog.
- `Alt + 3` focus item search.
- `Alt + 4` select top item.
- `Alt + 5` focus customer search.
- `Alt + 6` select first customer.
- `Alt + 7` load sales orders.
- `Alt + 8` open returns.
- `Alt + 9` focus delivery charges.
- `Alt + `` focus posting date.

#### Alt + Keys

- `Alt + PageUp` open payments panel.
- `Alt + Home` go to home and reload.
- `Alt + A` focus additional discount field.
- `Alt + Q` focus quantity field for first item and then the next item (cycles).
- `Alt + U` focus UOM field for first item and then the next item (cycles).
- `Alt + R` focus rate field for first item and then the next item (cycles).
- `Alt + E` remove the first item from the top.
- `Alt + F` focus item table search field for added items searching.
- `Alt + L` load draft invoices.
- `Alt + M` toggle item selector settings.
- `Alt + S` save and clear invoice.
- `Alt/Option + ArrowRight` enter keyboard navigation for the invoice items grid.
- `Option + 7` on macOS opens Item Quick Edit for the currently selected item.

#### Payments Panel

- `Alt + D` open payments panel.
- `Alt + X` on invoice it open payments, then submit automatically (prompts if payments are closed). on payments it submit directly.
- `Alt + P` on invoice it open payments, then submit & print automatically (prompts if payments are closed). on payments it submit directly.
- In the Alt+X / Alt+P quick cash prompt, entering `0` creates a credit sale only when `Allow Credit Sale` is enabled on the POS Profile; otherwise an error is shown.

#### Counter Grid Payments

- `Ctrl/Cmd + 1` through `Ctrl/Cmd + 9` select the corresponding visible POS Profile payment method.
- `Ctrl/Cmd + Enter` submit the invoice through the existing payment flow.
- `Ctrl/Cmd + Shift + Enter` submit and print through the existing payment flow.

---

### Dependencies:

- [Frappe](https://github.com/frappe/frappe)
- [Erpnext](https://github.com/frappe/erpnext)
- [Vue.js](https://github.com/vuejs/vue)
- [Vue Router](https://router.vuejs.org/) (New Architecture)
- [Vuetify.js](https://github.com/vuetifyjs/vuetify)

---

### Code Formatting

This project uses Prettier and Black for consistent formatting. To format locally before
pushing changes, run:

```bash
yarn prettier --write "**/*.{js,vue,css,scss,html}"
pip install -r requirements-dev.txt
black .
```

These commands will rewrite files in-place so the CI checks pass.

---

### Contributing

1. [Issue Guidelines](https://github.com/frappe/erpnext/wiki/Issue-Guidelines)
2. [Pull Request Requirements](https://github.com/frappe/erpnext/wiki/Contribution-Guidelines)

---

### License

GNU/General Public License (see [license.txt](https://github.com/yrestom/POS-Awesome/blob/master/license.txt))

The POS Awesome code is licensed as GNU General Public License (v3)
