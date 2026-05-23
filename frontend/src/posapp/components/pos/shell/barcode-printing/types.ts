export interface BarcodeRow {
	barcode?: string;
	uom?: string;
}

export interface BarcodePrintItem {
	_row_id: number;
	item_code: string;
	item_name: string;
	barcode: string;
	qty: number;
	price: number;
	item_barcode?: BarcodeRow[];
	item_uoms?: Array<{ uom?: string }>;
	uom: string;
	_is_scale_barcode?: boolean;
	_scanned_barcode?: string;
	_scanned_scale_barcode?: string;
	_scale_template_barcode?: string;
	scale_grams?: number | null;
	_scale_qty?: number;
	_scale_price?: number;
	_barcode_qty?: number;
	_editingQty?: boolean;
	batch_no?: string;
	serial_no?: string;
	batch_no_data?: Array<{ batch_no?: string }>;
	serial_no_data?: Array<{ serial_no?: string }>;
	barcodes?: string[];
	stock_uom?: string;
	rate?: number;
	standard_rate?: number;
}

export interface ScaleBarcodeSettings {
	prefix?: string;
	prefix_included_or_not?: number;
	no_of_prefix_characters?: number;
	item_code_starting_digit?: number;
	item_code_total_digits?: number;
	weight_starting_digit?: number;
	weight_total_digits?: number;
	weight_decimals?: number;
	price_included_in_barcode_or_not?: number;
	price_starting_digit?: number;
	price_total_digit?: number;
	price_decimals?: number;
}

export interface LabelSize {
	type: string;
	cols?: number;
	rows?: number;
	width?: number;
	height?: number;
}
