export interface Item {
  item_code: string;
  item_name: string;
  description?: string;
  stock_qty?: number;
  standard_rate?: number;
  image?: string;
  currency?: string;
  uom?: string;
  disabled?: number;
  [key: string]: any;
}

export interface CartItem extends Item {
  qty: number;
  rate: number;
  amount: number;
  posa_row_id: string;
  discount_percentage?: number;
  discount_amount?: number;
  actual_qty?: number;
}

export interface POSProfile {
  name: string;
  company: string;
  currency: string;
  taxes_and_charges?: string;
  hide_expected_amount?: number;
  posa_cash_mode_of_payment?: string;
  [key: string]: any;
}

export interface DeliveryCharge {
  name: string;
  rate?: number;
  [key: string]: any;
}

export interface InvoiceMetadata {
  lastUpdated: number;
  changeVersion: number;
}

export interface Customer {
  name: string;
  customer_name: string;
  mobile_no?: string;
  email_id?: string;
  tax_id?: string;
  [key: string]: any;
}

export interface Payment {
  mode_of_payment: string;
  amount: number;
  base_amount?: number;
  type?: string;
  default?: number;
  idx?: number;
  [key: string]: any;
}

export interface PaymentAmountSummary {
  payments: Payment[];
  amountByPayment: Map<Payment, number>;
  total: number;
}

export interface InvoiceDoc {
  name?: string;
  doctype: string;
  owner?: string;
  docstatus?: number;
  customer?: string;
  posting_date?: string;
  posting_time?: string;
  items: CartItem[];
  payments: Payment[];
  taxes: any[];
  grand_total: number;
  base_grand_total?: number;
  rounded_total?: number;
  outstanding_amount: number;
  pos_profile?: string;
  company?: string;
  currency?: string;
  conversion_rate?: number;
  is_return?: number | boolean;
  [key: string]: any;
}
