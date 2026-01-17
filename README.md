<div align="center">
    <img src="https://frappecloud.com/files/pos.png" height="128">
    <h2>POS AWESOME</h2>
</div>

#### An open-source Point of Sale for [Erpnext](https://github.com/frappe/erpnext) using [Vue.js](https://github.com/vuejs/vue) and [Vuetify](https://github.com/vuetifyjs/vuetify) (VERSION 15 and 16 Support)

---

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
