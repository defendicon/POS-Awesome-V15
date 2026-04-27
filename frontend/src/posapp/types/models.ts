/**
 * A catalogue item as stored in the offline IndexedDB cache.
 * Fields mirror the ERPNext Item doctype; `[key: string]: any` accommodates
 * custom fields added by the Frappe installation.
 */
export interface Item {
  item_code: string;
  item_name: string;
  description?: string;
  stock_qty: number;
  standard_rate: number;
  uom: string;
  image?: string;
  item_group?: string;
  brand?: string;
  serial_no?: string | null;
  batch_no?: string | null;
  actual_qty?: number | null;
  rate?: number;
  price_list_rate?: number;
  original_rate?: number;
  currency?: string;
  original_currency?: string;
  item_uoms?: Array<Record<string, any>>;
  serial_no_data?: Array<Record<string, any>>;
  batch_no_data?: Array<Record<string, any>>;
  _scale_qty?: number;
  _scale_price?: number;
  /** 1 if the item tracks serial numbers, 0 otherwise. */
  has_serial_no?: number;
  /** 1 if the item tracks batch numbers, 0 otherwise. */
  has_batch_no?: number;
  /** 1 for stock items, 0 for service/non-stock items. */
  is_stock_item?: number;
  conversion_factor?: number;
  [key: string]: any;
}

/**
 * An {@link Item} that has been added to the active invoice.
 * Carries per-line pricing and discount state alongside the item's catalogue data.
 * `posa_row_id` is the stable row key used by {@link useInvoiceStore} — it is NOT the
 * ERPNext `name` field and is generated client-side.
 */
export interface CartItem extends Item {
  qty: number;
  /** Line total = qty × rate, in the selected currency. */
  amount: number;
  /** Effective unit price after discount, in the selected currency. */
  rate: number;
  discount_percentage?: number;
  discount_amount?: number;
  /** Client-generated stable row identifier (UUID-like). */
  posa_row_id: string;
  /** True when this row was added by the offers engine (free item / promo). */
  posa_is_offer?: boolean;
  /** Original price before discount. */
  price_list_rate?: number;
  currency?: string;
  [key: string]: any;
}

/**
 * The active POS Invoice document, mirroring the ERPNext POS Invoice doctype.
 * This is the root object managed by {@link useInvoiceStore}.
 * Return invoices use negative `qty` and negative totals throughout.
 */
export interface InvoiceDoc {
  /** ERPNext document name, e.g. `"ACC-PSINV-2024-00001"`. Absent on unsaved drafts. */
  name?: string;
  doctype?: string;
  posting_date: string;
  posting_time?: string;
  company: string;
  customer: string;
  customer_name?: string;
  items: CartItem[];
  payments: Payment[];
  grand_total: number;
  net_total: number;
  total_qty: number;
  /** Transaction-level fixed discount amount (selected currency). */
  discount_amount?: number;
  /** Transaction-level percentage discount (0–100). */
  additional_discount_percentage?: number;
  delivery_charges?: number;
  taxes?: Tax[];
  /** 1 when this is a return/credit-note invoice. */
  is_return?: number;
  /** Name of the original invoice being returned against. */
  return_against?: string;
  pos_profile?: string;
  [key: string]: any;
}

export interface InvoiceDocRef {
  name?: string;
  doctype?: string;
}

export type PartialInvoiceDoc = Partial<InvoiceDoc> & InvoiceDocRef;

/**
 * A single payment line on an invoice (e.g. Cash, Card, Loyalty Points).
 */
export interface Payment {
  mode_of_payment: string;
  /** Payment amount in the invoice currency. Negative for return/refund rows. */
  amount: number;
  account?: string;
  type?: string;
  base_amount?: number;
  default?: boolean;
  currency?: string;
  conversion_rate?: number;
  [key: string]: any;
}

/**
 * A tax/charge row applied to the invoice, matching the ERPNext Sales Taxes and Charges table.
 */
export interface Tax {
  charge_type?: string;
  account_head?: string;
  /** Tax rate as a percentage (e.g. `15` for 15%). */
  rate?: number;
  tax_amount?: number;
  description?: string;
  [key: string]: any;
}

/**
 * Key fields from the active POS Profile document.
 * The full profile carries many additional `posa_*` feature-flag fields; they are
 * accessible via `[key: string]: any`.
 */
export interface POSProfile {
  name: string;
  company: string;
  currency: string;
  warehouse: string;
  selling_price_list: string;
  income_account: string;
  expense_account: string;
  [key: string]: any;
}

/**
 * A customer record from the offline customer cache.
 */
export interface Customer {
  name: string;
  customer_name: string;
  customer_group: string;
  territory: string;
  email_id?: string;
  mobile_no?: string;
  tax_id?: string;
  image?: string;
  primary_address?: string;
  [key: string]: any;
}

export interface CustomerSummary {
  name: string;
  customer_name: string;
  email_id?: string;
  mobile_no?: string;
  primary_address?: string;
  [key: string]: any;
}

export interface StoredCustomer extends CustomerSummary {
  tax_id?: string;
}

export type CustomerInfo = Record<string, unknown>;

/**
 * Internal versioning metadata attached to the invoice store.
 * `changeVersion` is incremented on every mutation and can be used to detect
 * stale renders or trigger watchers.
 */
export interface InvoiceMetadata {
  /** Unix timestamp (ms) of the last mutation. */
  lastUpdated: number;
  /** Monotonically increasing counter, incremented on every store mutation. */
  changeVersion: number;
  [key: string]: any;
}

/**
 * A delivery-charge option that can be selected on the invoice.
 * Populated from the `posa_delivery_charges` child table on the POS Profile.
 */
export interface DeliveryCharge {
  title: string;
  /** Charge amount in the company currency. */
  rate: number;
  [key: string]: any;
}
