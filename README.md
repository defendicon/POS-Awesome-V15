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

4. **Save the profile**

5. **Start selling**

    Return to the **POS Awesome** workspace and launch the POS. Select the newly created profile if prompted and begin creating invoices.

For more details, see the [POS Awesome Wiki](https://github.com/yrestom/POS-Awesome/wiki).

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

### Payments & Write-Offs

- Write-off amount is capped by POS Profile and validated against payment coverage.
- Refunds/returns use negative payment amounts.
- Partial payments and credit sales respect the same write-off limits.

---

### Offline Mode

- Invoices, customers, and payments can be created offline.
- Background sync replays changes when connectivity returns.
- Failed offline submissions are saved as Drafts.

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

#### 🎨 UI/UX & Interface

- **Modern Interface**: User-friendly design using Vue.js and Vuetify, optimized for speed and experience.
- **View Modes**: Toggle between List View (efficient for data entry) and Card View (visual with item images).
- **Dark Mode & Theming**: Built-in dark mode support with automatic or manual toggle, plus customizable theme options.
- **RTL Support**: Full support for Right-to-Left languages (Arabic, etc.).
- **System Status Gadgets**: Real-time monitoring of Server, Database, Cache, and Network status directly from the POS navbar.
- **Fly to Cart Animation**: Visual feedback when adding items to the cart.
- **Performance**: Optimized for large datasets using virtual scrolling and efficient state management.
- **Shortcuts**: Extensive keyboard shortcuts for rapid operation.
- **Multi-Language**: Supports English, Arabic, Portuguese, Spanish, and more.

#### 💸 Transactions & Sales

- **Multi-Currency**: Full support for invoicing in different currencies with automatic exchange rate fetching.
- **Quotations**: Create, update, and submit Quotations directly from the POS interface.
- **Sales Orders**: Create Sales Orders directly. Configurable "Sales Order Only" mode available.
- **Returns**: Process returns for Cash or Customer Credit (Credit Note).
- **Credit Sales**: Support for credit sales with configurable due dates.
- **Change Posting Date**: Ability to change the transaction posting date (backdating) if allowed by profile.
- **Additional Notes**: Fields for internal notes and authorization codes.
- **Customer PO**: Capture Customer Purchase Order (PO) number and date.

#### 📦 Inventory & Products

- **Batch & Serial**: Comprehensive support for Batch and Serial number selection and search.
- **Product Bundles**: Auto-apply batches for bundle items.
- **Variants**: Support for template items with product variants.
- **UOM Support**: Barcode and pricing support specific to Units of Measure.
- **Weighted Products**: Support for scale/weighted product barcodes.
- **Stock Validation**: Configurable stock validation (warn or block) including negative stock handling.

#### 💳 Payments & Pricing

- **Smart Tender**: "Quick Cash" suggestions based on currency denominations for faster checkout.
- **Split Payments**: Accept multiple payment modes for a single transaction.
- **M-Pesa**: Integrated M-Pesa mobile payment support.
- **Loyalty Points**: Earn and redeem Customer Loyalty Points.
- **Coupons & Offers**: Support for POS Coupons, Promotional Offers, and Referral Codes.
- **Price Lists**: Support for Customer/Group price lists, with option to manually select Price List per transaction.
- **Discounts**: Customer-level and Transaction-level discount support.
- **Delivery Charges**: Add shipping/delivery charges to the invoice.
- **Write Off**: Option to write off small difference amounts in change.
- **Payment Reconciliation**: Reconcile payments against existing invoices.

#### 🔄 Offline & Technical

- **Robust Offline Mode**: Create invoices and customers offline. Data syncs automatically when reconnected.
- **Background Sync**: Advanced background synchronization for offline transactions and master data updates.
- **Local Storage**: Option to use browser Local Storage for caching to improve reliability.
- **Background Submission**: Enqueue invoice submission to background jobs for faster UI response.
- **Drafts**: Failed offline submissions are safely saved as Draft documents.

#### ⚙️ Configuration & Shift Management

- **Shift Management**: Opening and Closing shifts with cash reconciliation and detailed payment breakdown reports.
- **Customer Balance**: Option to display current customer balance on the main screen.
- **Address Management**: Manage multiple shipping addresses for customers.
- **ERPNext v15 Support**: Fully compatible with the latest ERPNext version.

### Shortcuts:

#### Global (Invoice Screen)

- `F4` profile switch (currently shows “not available” message).
- `F6` open new customer form.
- `F7` open shift details.
- `F8` POS lock (currently shows “not available” message).

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

#### Payments Panel

- `Alt + D` open payments panel.
- `Alt + X` on invoice it open payments, then submit automatically (prompts if payments are closed). on payments it submit directly.
- `Alt + P` on invoice it open payments, then submit & print automatically (prompts if payments are closed). on payments it submit directly.

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
