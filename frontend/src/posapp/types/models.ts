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
  has_serial_no?: number;
  has_batch_no?: number;
  is_stock_item?: number;
  conversion_factor?: number;
  [key: string]: any;
}

export interface CartItem extends Item {
  qty: number;
  amount: number;
  rate: number;
  discount_percentage?: number;
  discount_amount?: number;
  posa_row_id: string;
  posa_is_offer?: boolean;
  price_list_rate?: number;
  currency?: string;
  [key: string]: any;
}

export interface InvoiceDoc {
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
  discount_amount?: number;
  additional_discount_percentage?: number;
  delivery_charges?: number;
  taxes?: Tax[];
  is_return?: number;
  return_against?: string;
  pos_profile?: string;
  [key: string]: any;
}

export interface Payment {
  mode_of_payment: string;
  amount: number;
  account?: string;
  type?: string;
  [key: string]: any;
}

export interface Tax {
  charge_type?: string;
  account_head?: string;
  rate?: number;
  tax_amount?: number;
  description?: string;
  [key: string]: any;
}

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

export interface InvoiceMetadata {
  lastUpdated: number;
  changeVersion: number;
  [key: string]: any;
}

export interface DeliveryCharge {
  title: string;
  rate: number;
  [key: string]: any;
}
