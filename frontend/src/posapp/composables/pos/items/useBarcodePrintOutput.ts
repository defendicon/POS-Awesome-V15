	import { ref, computed } from "vue";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { printHtmlViaQz, sendRawToQz, qzConnected, setSelectedQzPrinter } from "../../../services/qzTray";
import { useZplGenerator, type RfidConfig } from "./useZplGenerator";
import type { LabelObject } from "./useLabelDesigner";

export interface PrinterProfile {
	name: string;
	printer_name: string;
	printer_type: "ZPL" | "EPL" | "HTML";
	dpi: number;
	ip_address?: string;
	port?: number;
	default_label_width?: number;
	default_label_height?: number;
	is_default?: number;
	printer_group?: string;
	rfid_enabled?: number;
	rfid_tag_type?: string;
	rfid_epc_prefix?: string;
	rfid_encoding_power?: number;
}

declare const __: (_str: string, _args?: any[]) => string;
declare const frappe: any;

export interface CheckDigitResult {
  valid: boolean;
  expected: number | null;
}

export function validateBarcodeCheckDigit(barcode: string): CheckDigitResult {
  const cleaned = barcode.replace(/\s/g, "");
  const digits = cleaned.replace(/\D/g, "");

  if (digits.length === 13) {
    const expected = calculateEan13CheckDigit(digits.substring(0, 12));
    const actual = parseInt(digits[12]!, 10);
    return { valid: expected === actual, expected };
  }

  if (digits.length === 12) {
    const expected = calculateUpcACheckDigit(digits.substring(0, 11));
    const actual = parseInt(digits[11]!, 10);
    return { valid: expected === actual, expected };
  }

  if (digits.length === 8) {
    const expected = calculateEan8CheckDigit(digits.substring(0, 7));
    const actual = parseInt(digits[7]!, 10);
    return { valid: expected === actual, expected };
  }

  return { valid: true, expected: null };
}

function calculateEan13CheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    const digit = ch ? parseInt(ch, 10) : 0;
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

function calculateUpcACheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    const digit = ch ? parseInt(ch, 10) : 0;
    sum += (i % 2 === 0) ? digit * 3 : digit;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

function calculateEan8CheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    const digit = ch ? parseInt(ch, 10) : 0;
    sum += (i % 2 === 0) ? digit * 3 : digit;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export function getBarcodeCheckDigitWarning(barcode: string): string | null {
  const result = validateBarcodeCheckDigit(barcode);
  if (!result.valid && result.expected !== null) {
    return `Invalid check digit (expected ${result.expected})`;
  }
  return null;
}

// ==========================================
// GS1 / ISO SPECIFICATION DATABASE
// ==========================================

export type PrinterDPI = 96 | 203 | 300 | 600;
export type OutputContext = 'browser' | 'qz_html' | 'qz_raw_zpl' | 'qz_raw_epl';

export interface PrintContext {
	dpi: PrinterDPI;
	output: OutputContext;
	labelWidthMm: number;
	labelHeightMm: number;
}

const mmToPx = (mm: number, dpi: PrinterDPI): number => Math.round((mm * dpi) / 25.4);
const pxToMm = (px: number, dpi: PrinterDPI): number => px / (dpi / 25.4);

interface SymbologySpec {
	minHeightMm: number;
	minTotalWidthMm?: number;
	minModuleMm: number;
	quietZoneLeftMm: number;
	quietZoneRightMm: number;
	totalModules: number | null;
	modulesPerChar?: number;
}

const GS1_SPECS: Record<string, SymbologySpec> = {
	EAN13: { minHeightMm: 18.28, minTotalWidthMm: 37.29, minModuleMm: 0.264, quietZoneLeftMm: 3.63, quietZoneRightMm: 2.31, totalModules: 95 },
	EAN8: { minHeightMm: 18.28, minTotalWidthMm: 26.73, minModuleMm: 0.264, quietZoneLeftMm: 2.31, quietZoneRightMm: 2.31, totalModules: 67 },
	UPC: { minHeightMm: 18.28, minTotalWidthMm: 30.96, minModuleMm: 0.264, quietZoneLeftMm: 2.97, quietZoneRightMm: 2.97, totalModules: 95 },
	ITF14: { minHeightMm: 13.0, minTotalWidthMm: 142.75, minModuleMm: 0.495, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: 93 },
	ITF: { minHeightMm: 13.0, minModuleMm: 0.264, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: null, modulesPerChar: 14 },
	GS1_128: { minHeightMm: 12.7, minModuleMm: 0.25, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: null, modulesPerChar: 11 },
	CODE128: { minHeightMm: 10.0, minModuleMm: 0.25, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: null, modulesPerChar: 11 },
	CODE39: { minHeightMm: 10.0, minModuleMm: 0.25, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: null, modulesPerChar: 16 },
	CODABAR: { minHeightMm: 10.0, minModuleMm: 0.25, quietZoneLeftMm: 10.0, quietZoneRightMm: 10.0, totalModules: null, modulesPerChar: 14 },
};

export interface BarcodeDimensions {
	heightPx: number;
	moduleWidthPx: number;
	quietZonePx: number;
	fontSize: number;
	compliance: 'compliant' | 'below_minimum' | 'truncated' | 'unfit';
	warnings: string[];
}

export const calculateBarcodeDimensions = (symbology: string, context: PrintContext, dataLength?: number): BarcodeDimensions => {
	const spec = (GS1_SPECS[symbology] ?? GS1_SPECS.CODE128)!;
	const { dpi, labelWidthMm, labelHeightMm } = context;
	const warnings: string[] = [];
	const textReserveMm = labelHeightMm < 30 ? 9 : labelHeightMm < 50 ? 13 : 16;
	const availableHeightMm = Math.max(0, labelHeightMm - textReserveMm);
	const targetHeightMm = Math.max(spec.minHeightMm, availableHeightMm * 0.85);
	const heightPx = mmToPx(targetHeightMm, dpi);
	const cssPaddingMm = 2;
	const usableWidthMm = Math.max(5, labelWidthMm - cssPaddingMm);
	let moduleWidthPx = 2;
	let compliance: BarcodeDimensions['compliance'] = 'compliant';
	if (spec.totalModules && spec.totalModules > 0) {
		const totalQuietMm = spec.quietZoneLeftMm + spec.quietZoneRightMm;
		const modulesWidthMm = usableWidthMm - totalQuietMm;
		if (modulesWidthMm <= 0) {
			warnings.push(`Label ${labelWidthMm}mm too narrow for ${symbology} quiet zones (${totalQuietMm}mm)`);
			compliance = 'unfit';
			moduleWidthPx = 2;
		} else {
			const idealModuleMm = modulesWidthMm / spec.totalModules;
			const idealModulePx = (idealModuleMm * dpi) / 25.4;
			moduleWidthPx = Math.max(1, Math.round(idealModulePx));
			const actualModuleMm = pxToMm(moduleWidthPx, dpi);
			const actualTotalMm = totalQuietMm + (actualModuleMm * spec.totalModules);
			if (actualModuleMm < spec.minModuleMm) {
				warnings.push(`X-dimension ${actualModuleMm.toFixed(3)}mm < GS1 minimum ${spec.minModuleMm}mm for ${symbology}`);
				compliance = 'below_minimum';
			}
			if (actualTotalMm > labelWidthMm) {
				warnings.push(`Barcode ${actualTotalMm.toFixed(1)}mm exceeds label ${labelWidthMm}mm`);
				compliance = 'truncated';
			}
		}
	} else {
		const targetModuleMm = 0.33;
		const targetModulePx = Math.round((targetModuleMm * dpi) / 25.4);
		const approxChars = dataLength || 20;
		const approxModules = (approxChars * (spec.modulesPerChar ?? 11)) + 35;
		const approxTotalMm = pxToMm(approxModules * targetModulePx, dpi) + spec.quietZoneLeftMm + spec.quietZoneRightMm;
		if (approxTotalMm > labelWidthMm && labelWidthMm > 0) {
			const scale = (labelWidthMm - spec.quietZoneLeftMm - spec.quietZoneRightMm) / approxTotalMm;
			moduleWidthPx = Math.max(1, Math.floor(targetModulePx * scale));
			warnings.push(`Barcode scaled down to fit ${labelWidthMm}mm label`);
			compliance = 'below_minimum';
		} else {
			moduleWidthPx = Math.max(2, targetModulePx);
		}
	}
	const maxQuietMm = Math.max(spec.quietZoneLeftMm, spec.quietZoneRightMm);
	const quietZonePx = mmToPx(maxQuietMm, dpi);
	const fontSize = labelHeightMm < 20 ? 6 : labelHeightMm < 30 ? 7 : labelHeightMm < 50 ? 9 : 11;
	if (targetHeightMm < spec.minHeightMm) {
		warnings.push(`Bar height ${targetHeightMm.toFixed(1)}mm < GS1 minimum ${spec.minHeightMm}mm`);
		if (compliance === 'compliant') compliance = 'below_minimum';
	}
	return { heightPx, moduleWidthPx, quietZonePx, fontSize, compliance, warnings };
};

export interface LabelSize {
	type: string;
	cols?: number;
	rows?: number;
	width?: number;
	height?: number;
}

export interface PageFormatPreset {
	label: string;
	value: string;
	type: "A4" | "thermal";
	widthMm?: number;
	heightMm?: number;
	cols?: number;
	rows?: number;
}

export const PAGE_FORMAT_PRESETS: PageFormatPreset[] = [
	{ label: "A4 Sheet", value: "A4", type: "A4", cols: 3, rows: 7 },
	{ label: "25 × 25 mm", value: "25x25mm", type: "thermal", widthMm: 25, heightMm: 25 },
	{ label: "38 × 25 mm", value: "38x25mm", type: "thermal", widthMm: 38, heightMm: 25 },
	{ label: "50 × 25 mm", value: "50x25mm", type: "thermal", widthMm: 50, heightMm: 25 },
	{ label: "75 × 25 mm", value: "75x25mm", type: "thermal", widthMm: 75, heightMm: 25 },
	{ label: "100 × 50 mm", value: "100x50mm", type: "thermal", widthMm: 100, heightMm: 50 },
	{ label: "100 × 100 mm", value: "100x100mm", type: "thermal", widthMm: 100, heightMm: 100 },
	{ label: "100 × 150 mm (4×6\")", value: "100x150mm", type: "thermal", widthMm: 100, heightMm: 150 },
	{ label: "100 × 200 mm", value: "100x200mm", type: "thermal", widthMm: 100, heightMm: 200 },
];

export function guessSymbologyFromBarcode(barcode: string): string {
	const digits = barcode.replace(/\D/g, "");
	if (digits.length === 13) return "EAN13";
	if (digits.length === 12) return "UPC";
	if (digits.length === 8) return "EAN8";
	if (digits.length === 14) return "ITF14";
	if (/^\d+$/.test(barcode)) return "ITF";
	return "CODE128";
}

function getBarcodeTypeSymbology(item: any): string {
	const bc = String(item.barcode || "").trim();
	if (!bc) return "";
	const rows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
	const matched = rows.find((r: any) => String(r?.barcode || "").trim() === bc);
	const t = matched?.barcode_type || "";
	if (t === "EAN-13" || t === "EAN" || t === "ISBN-13" || t === "JAN") return "EAN13";
	if (t === "EAN-8" || t === "ISSN") return "EAN8";
	if (t === "UPC-A" || t === "UPC") return "UPC";
	if (t === "ITF-14" || t === "GTIN-14") return "ITF14";
	if (t === "GS1-128" || t === "GS1") return "GS1_128";
	if (t === "CODABAR") return "CODABAR";
	if (t === "Code 39" || t === "CODE-39") return "CODE39";
	if (t === "Code 128") return "CODE128";
	if (t === "ISBN-10") return "CODE128";
	if (t === "PZN") return "CODE128";
	if (t === "GTIN") return "";
	if (t === "ISBN") return "";
	return "";
}

export function validateBarcodeItem(item: any): string | null {
	const bc = String(item.barcode || "").trim();
	if (!bc) return "No barcode";

	const effectiveSym = item._symbology || getBarcodeTypeSymbology(item) || guessSymbologyFromBarcode(bc);
	const digits = bc.replace(/\D/g, "");

	if (effectiveSym === "EAN13" && digits.length !== 13)
		return `EAN-13 needs 13 digits, got ${digits.length}`;
	if (effectiveSym === "EAN8" && digits.length !== 8)
		return `EAN-8 needs 8 digits, got ${digits.length}`;
	if (effectiveSym === "UPC" && digits.length !== 12)
		return `UPC-A needs 12 digits, got ${digits.length}`;
	if (effectiveSym === "ITF14" && digits.length !== 14)
		return `ITF-14 needs 14 digits, got ${digits.length}`;
	if (effectiveSym === "ITF" && (digits.length % 2 !== 0 || !/^\d+$/.test(bc)))
		return "ITF requires even number of digits";

	const checkResult = validateBarcodeCheckDigit(bc);
	if (!checkResult.valid && checkResult.expected !== null) {
		return `Invalid check digit (expected ${checkResult.expected})`;
	}

	return null;
}

export function getBarcodeTypeLabel(item: any): string {
	const bc = String(item.barcode || "").trim();
	if (!bc) return "";
	const rows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
	const matched = rows.find((r: any) => String(r?.barcode || "").trim() === bc);
	return matched?.barcode_type || "";
}

export function resolveTemplateVars(template: string, item: any): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const formatDate = (fmt: string): string =>
		fmt
			.replace(/YYYY/g, String(now.getFullYear()))
			.replace(/YY/g, String(now.getFullYear()).slice(-2))
			.replace(/MM/g, pad(now.getMonth() + 1))
			.replace(/DD/g, pad(now.getDate()))
			.replace(/HH/g, pad(now.getHours()))
			.replace(/mm/g, pad(now.getMinutes()))
			.replace(/ss/g, pad(now.getSeconds()));
	return template
		.replace(/\{item_code\}/g, item.item_code || "")
		.replace(/\{item_name\}/g, item.item_name || "")
		.replace(/\{barcode\}/g, item.barcode || "")
		.replace(/\{price\}/g, item.price != null ? String(item.price) : "")
		.replace(/\{uom\}/g, item.uom || "")
		.replace(/\{qty\}/g, item.qty != null ? String(item.qty) : "")
		.replace(/\{batch_no\}/g, item.batch_no || "")
		.replace(/\{serial_no\}/g, item.serial_no || "")
		.replace(/\{warehouse\}/g, item.warehouse || "")
		.replace(/\{warehouse_location\}/g, item.warehouseLocation || "")
		.replace(/\{grams\}/g, item.grams != null ? String(item.grams) : "")
		.replace(/\{date(?::([^}]+))?\}/g, (_, fmt) => formatDate(fmt || "YYYY-MM-DD"))
		.replace(/\{time(?::([^}]+))?\}/g, (_, fmt) => formatDate(fmt || "HH:mm"));
}

export function getEpcData(item: any, rfidConfig: RfidConfig): string {
	const value = item._epc_data || item.serial_no || item.barcode || "";
	if (!value) return "";
	const prefix = rfidConfig.epcPrefix || "";
	const fullHex = prefix + value.split("").map((ch: string) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("");
	return fullHex.toUpperCase();
}

export function useBarcodePrintOutput() {
	const toastStore = useToastStore();
	const uiStore = useUIStore();

	const pageFormat = ref("A4");
	const pageFormatOptions = computed(() => PAGE_FORMAT_PRESETS.map((p) => p.value));
	const gridCols = ref(3);
	const gridRows = ref(7);
	const includePrice = ref(true);
	const includeBatchSerial = ref(false);
	const symbology = ref("auto");
	const symbologyOptions = computed(() => ["auto", "EAN13", "EAN8", "UPC", "ITF14", "ITF", "GS1_128", "CODE128", "CODE39", "CODABAR"]);
	const outputFormat = ref<"html" | "zpl" | "epl">("html");
	const includeWarehouseLocation = ref(false);
	const printerDpi = ref<PrinterDPI>(203);
	const activeDesignerTemplate = ref<string | null>(null);
	const selectedPrinterProfile = ref<PrinterProfile | null>(null);
	const printerProfiles = ref<PrinterProfile[]>([]);
	const rfidEnabled = ref(false);
	const rfidEpcPrefix = ref("");

	const fetchPrinterProfiles = async () => {
		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.printer_api.get_printer_profiles",
				silent: true,
			});
			const list = (res.message || []) as PrinterProfile[];
			printerProfiles.value = list;
			const profileDefault = uiStore.posProfile?.posa_default_printer_profile;
			if (profileDefault) {
				const match = list.find((p) => p.name === profileDefault);
				if (match) applyPrinterProfile(match);
			}
			if (!selectedPrinterProfile.value && list.length > 0) {
				const def = list.find((p) => p.is_default) || list[0];
				if (def) applyPrinterProfile(def);
			}
		} catch {
			// silent — printer profiles are optional
		}
	};

	const applyPrinterProfile = (profile: PrinterProfile | null) => {
		selectedPrinterProfile.value = profile;
		if (profile) {
			if (profile.dpi) printerDpi.value = profile.dpi as PrinterDPI;
			const ptype = (profile.printer_type || "ZPL").toLowerCase();
			if (ptype === "zpl" || ptype === "epl") {
				outputFormat.value = ptype as "zpl" | "epl";
			} else {
				outputFormat.value = "html";
			}
			if (profile.default_label_width && profile.default_label_height) {
				const matched = PAGE_FORMAT_PRESETS.find(
					(p) => p.widthMm === profile.default_label_width && p.heightMm === profile.default_label_height,
				);
				if (matched) pageFormat.value = matched.value;
			}
			if (profile.printer_name) {
				setSelectedQzPrinter(profile.printer_name);
			}
			rfidEnabled.value = profile.rfid_enabled === 1;
			rfidEpcPrefix.value = profile.rfid_epc_prefix || "";
		} else {
			rfidEnabled.value = false;
			rfidEpcPrefix.value = "";
		}
	};

	const getFailoverPrinters = async (group: string, excludeName: string): Promise<PrinterProfile[]> => {
		if (!group) return [];
		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.printer_api.get_printers_for_failover",
				args: { printer_group: group, exclude_name: excludeName },
				silent: true,
			});
			return (res.message || []) as PrinterProfile[];
		} catch {
			return [];
		}
	};

	const setDesignerTemplate = (json: string) => {
		try { JSON.parse(json); } catch { return; }
		activeDesignerTemplate.value = json;
	};

	const clearDesignerTemplate = () => {
		activeDesignerTemplate.value = null;
	};

	const hasActiveTemplate = computed(() => !!activeDesignerTemplate.value);

	const shouldLogAudit = computed(() => {
		return uiStore.posProfile?.posa_enable_print_audit !== 0;
	});

	const logPrintEvent = async (itemsToPrint: any[], method: string, status: string, errorMsg?: string) => {
		if (!shouldLogAudit.value) return;
		const profile = uiStore.posProfile;
		const entries = itemsToPrint.map((item: any) => ({
			posting_date: undefined,
			item_code: item.item_code || "",
			item_name: item.item_name || "",
			barcode: item.barcode || "",
			barcode_type: item.barcode_type || "",
			qty: item.qty || 1,
			uom: item.uom || "",
			price: item.price || 0,
			symbology: symbology.value,
			label_size: pageFormat.value,
			user: undefined,
			company: profile?.company || "",
			pos_profile: profile?.name || "",
			print_method: method,
			status,
			error_message: errorMsg || null,
			reference_doctype: item.reference_doctype || null,
			reference_docname: item.reference_docname || null,
			batch_no: item.batch_no || null,
			serial_no: item.serial_no || null,
			warehouse: item.warehouseLocation || null,
		}));
		try {
			await frappe.call({
				method: "posawesome.posawesome.api.barcode_print_log.batch_create_print_logs",
				args: { entries },
				silent: true,
			});
		} catch {
			// silent — audit logging must never block printing
		}
	};

	const getPrintContext = (isRaw: boolean = false): PrintContext => {
		const size = parseLabelSize();
		const isA4 = size.type === "A4";
		return {
			dpi: isA4 ? 96 : (isRaw ? printerDpi.value : 96),
			output: isA4 ? 'browser' : (isRaw ? 'qz_raw_zpl' : 'qz_html'),
			labelWidthMm: isA4 ? 63.5 : (size.width ?? 25),
			labelHeightMm: isA4 ? 38 : (size.height ?? 25),
		};
	};

	const getPreset = (): PageFormatPreset => {
		return PAGE_FORMAT_PRESETS.find((p) => p.value === pageFormat.value) ?? PAGE_FORMAT_PRESETS[0]!;
	};

	const parseLabelSize = (): LabelSize => {
		const preset = getPreset();
		if (preset.type === "A4") {
			return {
				type: "A4",
				cols: parseInt(gridCols.value as any) || 3,
				rows: parseInt(gridRows.value as any) || 7,
			};
		}
		return {
			type: "thermal",
			width: preset.widthMm,
			height: preset.heightMm,
		};
	};

	const escapeHtml = (value: string): string => {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	};

	const formatCurrency = (value: any): string => {
		const profile = uiStore.posProfile;
		if (value == null || value === "") return "0";
		const num = Number(value);
		if (isNaN(num)) return String(value);
		const formatted = num.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
		if (profile?.currency) {
			return `${formatted} ${profile.currency}`;
		}
		return formatted;
	};

	const getPrintableItems = (items: any[], { notify = true } = {}) => {
		const itemsToPrint = items.filter((item) => String(item?.barcode || "").trim());
		if (!notify) return itemsToPrint;

		if (itemsToPrint.length === 0) {
			toastStore.show({ title: __("No items with barcodes to print"), color: "error" });
		} else if (itemsToPrint.length < items.length) {
			toastStore.show({ title: __("Skipping items without barcodes"), color: "warning" });
		}
		return itemsToPrint;
	};

	const getBarcodeDimensions = (sym?: string, isRaw?: boolean, dataLength?: number): BarcodeDimensions => {
		return calculateBarcodeDimensions(sym ?? symbology.value, getPrintContext(isRaw), dataLength);
	};

	const getBarcodeHeight = (sym?: string): number => getBarcodeDimensions(sym, false).heightPx;
	const getBarcodeWidth = (sym?: string): number => getBarcodeDimensions(sym, false).moduleWidthPx;
	const getBarcodeFontSize = (): number => getBarcodeDimensions(undefined, false).fontSize;

	const getTemplatePrintStyles = (): string => {
		const size = parseLabelSize();
		if (size.type === "A4") {
			const { cols = 3, rows = 7 } = size;
			const availableHeight = 277;
			const totalGapSpace = (rows - 1) * 3;
			const rowHeight = Math.floor((availableHeight - totalGapSpace) / rows);
			return `
				@page { size: A4; margin: 10mm; }
				body { font-family: sans-serif; margin: 0; padding: 0; }
				.label-container { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 3mm; page-break-after: always; }
				.label { border: 1px dashed #ccc; padding: 0; width: 100%; height: ${rowHeight}mm; page-break-inside: avoid; box-sizing: border-box; overflow: hidden; }
				img.barcode { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
			`;
		}
		return `
			@page { size: ${size.width}mm ${size.height}mm; margin: 0; }
			body { font-family: sans-serif; margin: 0; padding: 0; width: ${size.width}mm; height: ${size.height}mm; overflow: hidden; }
			.label { width: ${size.width}mm; height: ${size.height}mm; page-break-after: always; overflow: hidden; box-sizing: border-box; }
			img.barcode { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
		`;
	};

	const getPrintStyles = (): string => {
		if (hasActiveTemplate.value) return getTemplatePrintStyles();
		const size = parseLabelSize();
		const dims = getBarcodeDimensions(undefined, false);
		if (size.type === "A4") {
			const { cols = 3, rows = 7 } = size;
			const availableHeight = 277;
			const totalGapSpace = (rows - 1) * 3;
			const rowHeight = Math.floor((availableHeight - totalGapSpace) / rows);

			return `
				@page { size: A4; margin: 10mm; }
				body { font-family: sans-serif; margin: 0; padding: 0; }
				.label-container {
					display: grid;
					grid-template-columns: repeat(${cols}, 1fr);
					gap: 3mm;
					page-break-after: always;
				}
				.label {
					border: 1px dashed #ccc;
					padding: 2mm;
					text-align: center;
					height: ${rowHeight}mm;
					display: flex;
					flex-direction: column;
					justify-content: center;
					align-items: center;
					page-break-inside: avoid;
					box-sizing: border-box;
					overflow: hidden;
				}
				.item-name { font-size: 11px; font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 95%; margin-bottom: 1px; line-height: 1.2; }
				.barcode-wrapper { width: 100%; display: flex; justify-content: center; align-items: center; flex-grow: 1; overflow: hidden; padding: 0 1mm; }
				.price { font-size: 11px; font-weight: bold; margin-top: 2px; line-height: 1.2; }
				.uom-label { font-size: 10px; margin-top: 1px; line-height: 1.2; }
				.batch-serial { font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; line-height: 1.2; }
				img.barcode { max-width: 100%; height: auto; max-height: 100%; object-fit: contain; display: block; }
			`;
		}

		const isTiny = (size.height ?? 25) < 35;
		const nameSize = isTiny ? "8px" : "10px";
		const priceSize = isTiny ? "8px" : "10px";
		const metaSize = isTiny ? "7px" : "8px";
		const uomSize = isTiny ? "7px" : "9px";
		const paddingMm = isTiny ? "0.5mm" : "1.5mm";

		return `
			@page { size: ${size.width}mm ${size.height}mm; margin: 0; }
			body { font-family: sans-serif; margin: 0; padding: 0; width: ${size.width}mm; height: ${size.height}mm; overflow: hidden; }
			.label {
				width: ${size.width}mm;
				height: ${size.height}mm;
				text-align: center;
				display: flex;
				flex-direction: column;
				justify-content: flex-start;
				align-items: center;
				page-break-after: always;
				overflow: hidden;
				box-sizing: border-box;
				padding: ${paddingMm};
			}
			.item-name { font-size: ${nameSize}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; line-height: 1.1; flex-shrink: 0; }
			.barcode-wrapper { display: flex; align-items: center; justify-content: center; width: 100%; overflow: hidden; flex-shrink: 1; flex-grow: 1; min-height: 0; padding: 0 1mm; }
			.price { font-size: ${priceSize}; font-weight: bold; line-height: 1.1; flex-shrink: 0; }
			.uom-label { font-size: ${uomSize}; line-height: 1.1; flex-shrink: 0; }
			.batch-serial { font-size: ${metaSize}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; flex-shrink: 0; line-height: 1.1; }
			img.barcode { max-width: 100%; height: auto; max-height: ${dims.heightPx}px; object-fit: contain; display: block; }
		`;
	};

	const getSymbologyForJsBarcode = (sym?: string): { format: string; ean128: boolean } => {
		const s = sym ?? symbology.value;
		if (s === "UPC") return { format: "UPC", ean128: false };
		if (s === "GS1_128") return { format: "CODE128", ean128: true };
		if (s === "ITF14") return { format: "ITF14", ean128: false };
		if (s === "ITF") return { format: "ITF", ean128: false };
		if (s === "CODABAR") return { format: "codabar", ean128: false };
		return { format: s, ean128: false };
	};

	const getLabelSizeWarnings = (sym?: string, isRaw?: boolean): string[] => {
		const dims = getBarcodeDimensions(sym, isRaw);
		return dims.warnings;
	};

	const getBarcodeCompliance = (sym?: string, isRaw?: boolean): BarcodeDimensions['compliance'] => {
		return getBarcodeDimensions(sym, isRaw).compliance;
	};

  const validateBarcodeData = (items: any[], sym?: string): string[] => {
    const s = sym ?? symbology.value;
    if (s === "CODE128" || s === "CODE39" || s === "CODABAR") return [];
    const errors: string[] = [];
    if (s === "auto") {
      items.forEach((item: any) => {
        const bc = String(item.barcode || "").trim();
        const itemSym = item._symbology || "auto";
        const effectiveSym = itemSym === "auto" ? guessSymbologyFromBarcode(bc) : itemSym;
        const name = item.item_name || item.item_code;
        const digits = bc.replace(/\D/g, "");
        if (effectiveSym === "EAN13" && digits.length !== 13) {
          errors.push(`${name}: EAN-13 needs 13 digits, got ${digits.length || bc.length} chars`);
        } else if (effectiveSym === "EAN8" && digits.length !== 8) {
          errors.push(`${name}: EAN-8 needs 8 digits, got ${digits.length || bc.length} chars`);
        } else if (effectiveSym === "UPC" && digits.length !== 12) {
          errors.push(`${name}: UPC-A needs 12 digits, got ${digits.length || bc.length} chars`);
        } else if (effectiveSym === "ITF14" && digits.length !== 14) {
          errors.push(`${name}: ITF-14 needs 14 digits, got ${digits.length || bc.length} chars`);
        } else if (effectiveSym === "ITF" && (digits.length % 2 !== 0 || !/^\d+$/.test(bc))) {
          errors.push(`${name}: ITF requires even number of digits`);
        } else if ((digits.length === 13 || digits.length === 12 || digits.length === 8) && (effectiveSym === "EAN13" || effectiveSym === "UPC" || effectiveSym === "EAN8")) {
          const checkResult = validateBarcodeCheckDigit(bc);
          if (!checkResult.valid) {
            const symName = digits.length === 13 ? 'EAN-13' : digits.length === 12 ? 'UPC-A' : 'EAN-8';
            errors.push(`${name}: ${symName} check digit invalid (expected ${checkResult.expected})`);
          }
        }
      });
      return errors;
    }
    items.forEach((item: any) => {
      const bc = String(item.barcode || "").trim();
      const digits = bc.replace(/\D/g, "");
      if (s === "EAN13" && digits.length !== 13) {
        errors.push(`${item.item_name || item.item_code}: EAN-13 needs 13 digits, got ${digits.length || bc.length} chars`);
      } else if (s === "EAN8" && digits.length !== 8) {
        errors.push(`${item.item_name || item.item_code}: EAN-8 needs 8 digits, got ${digits.length || bc.length} chars`);
      } else if (s === "UPC" && digits.length !== 12) {
        errors.push(`${item.item_name || item.item_code}: UPC-A needs 12 digits, got ${digits.length || bc.length} chars`);
      } else if (s === "ITF14" && digits.length !== 14) {
        errors.push(`${item.item_name || item.item_code}: ITF-14 needs 14 digits, got ${digits.length || bc.length} chars`);
      } else if (s === "ITF" && (digits.length % 2 !== 0 || !/^\d+$/.test(bc))) {
        errors.push(`${item.item_name || item.item_code}: ITF requires even number of digits`);
      }
    });
    return errors;
  };

	const getItemSymbology = (item: any): string => {
		return item._symbology || getBarcodeTypeSymbology(item) || symbology.value;
	};

	const generatePrintContent = (items: any[]): string => {
		if (hasActiveTemplate.value && activeDesignerTemplate.value) {
			return generateTemplatePrintContent(items, activeDesignerTemplate.value);
		}
		let html = "";
		const size = parseLabelSize();
		const ctx = getPrintContext(false);

		if (size.type === "A4") html += '<div class="label-container">';

		items.forEach((item) => {
			const itemSym = getItemSymbology(item);
			const effectiveSym = itemSym === "auto" ? guessSymbologyFromBarcode(item.barcode) : itemSym;
			const dims = calculateBarcodeDimensions(effectiveSym, ctx, item.barcode?.length);
			const jsBarcode = getSymbologyForJsBarcode(effectiveSym);
			const ean128Attr = jsBarcode.ean128 ? ' jsbarcode-ean128="true"' : "";
			const labelsCount = Math.max(1, Math.round(Number(item.qty) || 1));
			const safeItemName = escapeHtml(item.item_name || item.item_code || "");
			const safeBarcode = escapeHtml(item.barcode || "");
			const safeUom = escapeHtml(item.uom || "");

			for (let i = 0; i < labelsCount; i++) {
				let batchSerialHtml = "";
				if (includeBatchSerial.value) {
					let text = "";
					if (item.batch_no) text += `Batch: ${item.batch_no} `;
					if (item.serial_no) text += `Serial: ${item.serial_no}`;
					if (!text) {
						if (item.batch_no_data && item.batch_no_data.length)
							text += `Batch: ${item.batch_no_data[0].batch_no} `;
						if (item.serial_no_data && item.serial_no_data.length)
							text += `Serial: ${item.serial_no_data[0].serial_no}`;
					}
					if (text.trim()) {
						batchSerialHtml = `<div class="batch-serial">${escapeHtml(text.trim())}</div>`;
					}
				}

				let priceHtml = "";
				if (includePrice.value) {
					priceHtml = `<div class="price">Price: ${escapeHtml(formatCurrency(item.price))}</div>`;
				}

				let uomHtml = safeUom ? `<div class="uom-label">${safeUom}</div>` : "";

				let warehouseHtml = "";
				if (includeWarehouseLocation.value && item.warehouseLocation) {
					warehouseHtml = `<div class="batch-serial">Loc: ${escapeHtml(item.warehouseLocation)}</div>`;
				}

				html += `
					<div class="label">
						<div class="item-name">${safeItemName}</div>
						${uomHtml}
						<div class="barcode-wrapper">
							<img class="barcode"
								jsbarcode-format="${jsBarcode.format}"
								jsbarcode-value="${safeBarcode}"
								jsbarcode-textmargin="0"
								jsbarcode-fontoptions="bold"
								jsbarcode-height="${dims.heightPx}"
								jsbarcode-width="${dims.moduleWidthPx}"
								jsbarcode-margin="${dims.quietZonePx}"
								jsbarcode-displayValue="true"
								jsbarcode-fontSize="${dims.fontSize}"${ean128Attr}>
						</div>
						${warehouseHtml}
						${batchSerialHtml}
						${priceHtml}
					</div>
				`;
			}
		});

		if (size.type === "A4") html += "</div>";
		return html;
	};

	const generateTemplatePrintContent = (items: any[], layoutJson: string): string => {
		let objects: LabelObject[];
		try { objects = JSON.parse(layoutJson); }
		catch { return ""; }
		if (!Array.isArray(objects) || !objects.length) return "";

		const ctx = getPrintContext(false);
		let html = "";
		items.forEach((item) => {
			const copies = Math.max(1, Math.round(Number(item.qty) || 1));
			const itemSerials: string[] = item._serialization_applied && Array.isArray(item._generated_serials) ? item._generated_serials : [];
			for (let c = 0; c < copies; c++) {
				const copyItem = itemSerials.length > c ? { ...item, serial_no: itemSerials[c] } : item;
				html += '<div class="label" style="position:relative;overflow:hidden;">';
				objects.forEach((obj) => {
					if (obj.hidden) return;
					const resolvedCondition = resolveTemplateVars(obj.condition || "", copyItem);
					if (resolvedCondition === "" || resolvedCondition === "false" || resolvedCondition === "0") return;
					const baseStyle = `position:absolute;left:${obj.x}mm;top:${obj.y}mm;width:${obj.width}mm;height:${obj.height}mm;`;
					switch (obj.type) {
						case "text": {
							const content = resolveTemplateVars(obj.content || "", copyItem);
							const fs = obj.fontBold ? "font-weight:bold;" : "";
							const fi = obj.fontItalic ? "font-style:italic;" : "";
							const fu = obj.fontUnderline ? "text-decoration:underline;" : "";
							const align = obj.textAlign || "left";
							const color = obj.color || "#000";
							const fontSize = (obj.fontSize || 10) + "px";
							const fontFamily = obj.fontFamily || "sans-serif";
							html += `<div style="${baseStyle}font-family:${fontFamily};font-size:${fontSize};${fs}${fi}${fu}color:${color};text-align:${align};overflow:hidden;display:flex;align-items:center;">${escapeHtml(content)}</div>`;
							break;
						}
						case "barcode": {
							const bd = resolveTemplateVars(obj.content || copyItem.barcode || "", copyItem);
							if (!bd) break;
							const sym = obj.symbology || guessSymbologyFromBarcode(bd);
							const jsb = getSymbologyForJsBarcode(sym);
							const dims = calculateBarcodeDimensions(sym, ctx, bd.length);
							const ean128 = jsb.ean128 ? ' jsbarcode-ean128="true"' : "";
							html += `<div style="${baseStyle}display:flex;align-items:center;justify-content:center;overflow:hidden;"><img class="barcode" jsbarcode-format="${jsb.format}" jsbarcode-value="${escapeHtml(bd)}" jsbarcode-textmargin="0" jsbarcode-fontoptions="bold" jsbarcode-height="${dims.heightPx}" jsbarcode-width="${dims.moduleWidthPx}" jsbarcode-margin="${dims.quietZonePx}" jsbarcode-displayValue="true" jsbarcode-fontSize="${dims.fontSize}"${ean128} style="max-width:100%;max-height:100%;"></div>`;
							break;
						}
						case "shape": {
							const bg = obj.color || "#ccc";
							const bc = obj.borderColor || "#000";
							const bw = obj.borderWidth || 0;
							if (obj.shapeType === "ellipse") {
								html += `<div style="${baseStyle}background:${bg};border:${bw}px solid ${bc};border-radius:50%;"></div>`;
							} else {
								html += `<div style="${baseStyle}background:${bg};border:${bw}px solid ${bc};"></div>`;
							}
							break;
						}
						case "line": {
							const lc = obj.color || "#000";
							const th = obj.borderWidth || 1;
							if (obj.lineDirection === "vertical") {
								html += `<div style="position:absolute;left:${obj.x + obj.width / 2}mm;top:${obj.y}mm;width:${th}px;height:${obj.height}mm;background:${lc};"></div>`;
							} else {
								html += `<div style="position:absolute;left:${obj.x}mm;top:${obj.y + obj.height / 2}mm;height:${th}px;width:${obj.width}mm;background:${lc};"></div>`;
							}
							break;
						}
						case "image": {
							if (obj.imageSrc) {
								html += `<div style="${baseStyle}display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${escapeHtml(obj.imageSrc)}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
							}
							break;
						}
					}
				});
				html += "</div>";
			}
		});
		return html;
	};

	const getPrintWindowContent = (items: any[]) => {
		const style = getPrintStyles();
		const content = generatePrintContent(getPrintableItems(items, { notify: false }));
		return { style, content };
	};

	const openPrintPopup = (): Window | null => {
		const printWindow = window.open("", "_blank");
		if (!printWindow) {
			toastStore.show({ title: __("Popup blocked. Please allow popups."), color: "error" });
			return null;
		}
		return printWindow;
	};

	const printLabels = (items: any[]) => {
		if (!items.length) return;
		const itemsToPrint = getPrintableItems(items);
		if (!itemsToPrint.length) return;
		const sizeWarnings = getLabelSizeWarnings();
		const compliance = getBarcodeCompliance();
		if (compliance === 'unfit' || compliance === 'truncated') {
			toastStore.show({ title: __("GS1 compliance error: {0}", [sizeWarnings[0]]), color: "error" });
			return;
		}
		if (sizeWarnings.length) {
			toastStore.show({ title: __("GS1 size warning: {0}", [sizeWarnings[0]]), color: "warning" });
		}
		const dataErrors = validateBarcodeData(itemsToPrint);
		if (dataErrors.length) {
			toastStore.show({ title: __("Barcode data error: {0}", [dataErrors[0]]), color: "error" });
			return;
		}

		const printWindow = openPrintPopup();
		if (!printWindow) return;

		const style = getPrintStyles();
		const content = generatePrintContent(itemsToPrint);

		printWindow.document.write(`
			<html>
				<head>
					<title>Print Barcodes</title>
					<style>${style}</style>
				</head>
				<body>
					${content}
					<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
					<script>
						window.onload = function() {
							JsBarcode(".barcode").init();
							setTimeout(() => {
								window.print();
								setTimeout(() => window.close(), 3000);
							}, 500);
						}
					<\/script>
				</body>
			</html>
		`);
		printWindow.document.close();

		logPrintEvent(itemsToPrint, "Browser", "Sent");

		try {
			const mql = printWindow.matchMedia("print");
			if (mql && typeof mql.addEventListener === "function") {
				let printed = false;
				const handler = (evt: MediaQueryListEvent) => {
					if (evt.matches) printed = true;
					else if (printed) {
						logPrintEvent(itemsToPrint, "Browser", "Confirmed");
						mql.removeEventListener("change", handler as any);
					}
				};
				mql.addEventListener("change", handler as any);
			}
		} catch {
			// matchMedia not supported — already logged as Sent
		}
	};

	const qzThermalAvailable = computed(() => qzConnected.value);

	const printLabelsThermal = async (items: any[], printerName?: string) => {
		if (!items.length) return;
		const itemsToPrint = getPrintableItems(items);
		if (!itemsToPrint.length) return;
		const sizeWarnings = getLabelSizeWarnings();
		const compliance = getBarcodeCompliance();
		if (compliance === 'unfit' || compliance === 'truncated') {
			toastStore.show({ title: __("GS1 compliance error: {0}", [sizeWarnings[0]]), color: "error" });
			return;
		}
		if (sizeWarnings.length) {
			toastStore.show({ title: __("GS1 size warning: {0}", [sizeWarnings[0]]), color: "warning" });
		}
		const dataErrors = validateBarcodeData(itemsToPrint);
		if (dataErrors.length) {
			toastStore.show({ title: __("Barcode data error: {0}", [dataErrors[0]]), color: "error" });
			return;
		}

		const { style, content } = getPrintWindowContent(itemsToPrint);
		const size = parseLabelSize();
		const fullHtml = `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>${style}</style>
</head>
<body>
	${content}
	<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
	<script>
		JsBarcode(".barcode").init();
	<\/script>
</body>
</html>`;

		try {
			await printHtmlViaQz(fullHtml, {
				printerName,
				widthMm: size.type === "thermal" ? size.width : undefined,
				orientation: "portrait",
			});
			toastStore.show({ title: __("Sent to QZ Tray printer"), color: "success" });
			logPrintEvent(itemsToPrint, "QZ HTML", "Sent");
		} catch (e: any) {
			toastStore.show({ title: __("QZ Tray print failed: {0}", [e?.message || e]), color: "error" });
			logPrintEvent(itemsToPrint, "QZ HTML", "Failed", String(e?.message || e));
			throw e;
		}
	};

	const printLabelsThermalWithFailover = async (items: any[]) => {
		const profile = selectedPrinterProfile.value;
		const group = profile?.printer_group;
		const name = profile?.printer_name;
		try {
			await printLabelsThermal(items, name);
		} catch {
			if (group) {
				const fallbacks = await getFailoverPrinters(group, profile?.name || "");
				for (const fb of fallbacks) {
					toastStore.show({ title: __("Trying fallback printer: {0}", [fb.printer_name]), color: "warning" });
					try {
						await printLabelsThermal(items, fb.printer_name);
						return;
					} catch {
						continue;
					}
				}
			}
			toastStore.show({ title: __("Thermal printing failed — falling back to browser print"), color: "warning" });
			printLabels(items);
		}
	};

	const printLabelsRaw = async (items: any[], printerName?: string) => {
		if (!items.length) return;
		const itemsToPrint = getPrintableItems(items);
		if (!itemsToPrint.length) return;
		const sizeWarnings = getLabelSizeWarnings(undefined, true);
		const compliance = getBarcodeCompliance(undefined, true);
		if (compliance === 'unfit' || compliance === 'truncated') {
			toastStore.show({ title: __("GS1 compliance error: {0}", [sizeWarnings[0]]), color: "error" });
			return;
		}
		if (sizeWarnings.length) {
			toastStore.show({ title: __("GS1 warning: {0}", [sizeWarnings[0]]), color: "warning" });
		}
		const dataErrors = validateBarcodeData(itemsToPrint);
		if (dataErrors.length) {
			toastStore.show({ title: __("Barcode data error: {0}", [dataErrors[0]]), color: "error" });
			return;
		}

		const zplGen = useZplGenerator();
		const isZpl = outputFormat.value === "zpl";
		const rawContext = getPrintContext(true);
		const rfidConfig: RfidConfig | undefined = rfidEnabled.value
			? { enabled: true, tagType: selectedPrinterProfile.value?.rfid_tag_type, epcPrefix: rfidEpcPrefix.value, encodingPower: selectedPrinterProfile.value?.rfid_encoding_power }
			: undefined;

		if (rfidEnabled.value && !isZpl) {
			toastStore.show({ title: __("RFID encoding requires ZPL output format"), color: "warning" });
		}

		const rawData = itemsToPrint
			.map((item: any) => {
				const itemSym = getItemSymbology(item);
				const effectiveSym = itemSym === "auto" ? guessSymbologyFromBarcode(item.barcode) : itemSym;
				const epcData = rfidConfig ? getEpcData(item, rfidConfig) : undefined;
				const enriched = { ...item, symbologyName: effectiveSym, printContext: rawContext, _epc_data: epcData, _rfid_config: rfidConfig };
				return isZpl ? zplGen.generateZpl(enriched) : zplGen.generateEpl(enriched);
			})
			.join("\n");

		try {
			await sendRawToQz(rawData, printerName);
			toastStore.show({ title: __("Sent to QZ Tray thermal printer"), color: "success" });
			logPrintEvent(itemsToPrint, "QZ Raw", "Sent");
		} catch (e: any) {
			toastStore.show({ title: __("QZ Tray print failed: {0}", [e?.message || e]), color: "error" });
			logPrintEvent(itemsToPrint, "QZ Raw", "Failed", String(e?.message || e));
			throw e;
		}
	};

	const printLabelsRawWithFailover = async (items: any[]) => {
		const profile = selectedPrinterProfile.value;
		const group = profile?.printer_group;
		const name = profile?.printer_name;
		try {
			await printLabelsRaw(items, name);
		} catch {
			if (group) {
				const fallbacks = await getFailoverPrinters(group, profile?.name || "");
				for (const fb of fallbacks) {
					toastStore.show({ title: __("Trying fallback printer: {0}", [fb.printer_name]), color: "warning" });
					try {
						await printLabelsRaw(items, fb.printer_name);
						return;
					} catch {
						continue;
					}
				}
			}
			toastStore.show({ title: __("Thermal printing failed — falling back to browser print"), color: "warning" });
			printLabels(items);
		}
	};

	const downloadPdf = (items: any[]) => {
		if (!items.length) return;
		const itemsToPrint = getPrintableItems(items);
		if (!itemsToPrint.length) return;
		const sizeWarnings = getLabelSizeWarnings();
		const compliance = getBarcodeCompliance();
		if (compliance === 'unfit' || compliance === 'truncated') {
			toastStore.show({ title: __("GS1 compliance error: {0}", [sizeWarnings[0]]), color: "error" });
			return;
		}
		if (sizeWarnings.length) {
			toastStore.show({ title: __("GS1 size warning: {0}", [sizeWarnings[0]]), color: "warning" });
		}
		const dataErrors = validateBarcodeData(itemsToPrint);
		if (dataErrors.length) {
			toastStore.show({ title: __("Barcode data error: {0}", [dataErrors[0]]), color: "error" });
			return;
		}

		const printWindow = openPrintPopup();
		if (!printWindow) return;

		const style = getPrintStyles();
		const content = generatePrintContent(itemsToPrint);
		const size = parseLabelSize();
		const isA4 = size.type === "A4";

		let pdfFormat: any = "a4";
		if (!isA4) {
			pdfFormat = [size.width, size.height];
		}

		const jsPdfOptions = { unit: "mm", format: pdfFormat, orientation: "portrait" };

		logPrintEvent(itemsToPrint, "PDF", "Sent");

		printWindow.document.write(`
			<html>
				<head>
					<title>Download PDF</title>
					<style>${style}</style>
					<script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"><\/script>
					<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
				</head>
				<body>
					<div id="print-content">${content}</div>
					<script>
						window.onload = function() {
							JsBarcode(".barcode").init();
							var checkInterval = setInterval(function() {
								var imgs = document.querySelectorAll('img.barcode');
								var allLoaded = true;
								for (var i = 0; i < imgs.length; i++) {
									var img = imgs[i];
									if (img.getAttribute('jsbarcode-format') && !img.complete) {
										allLoaded = false;
										break;
									}
								}
								if (allLoaded) {
									clearInterval(checkInterval);
									requestAnimationFrame(function() {
										requestAnimationFrame(function() {
											var element = document.getElementById('print-content');
											var opt = {
												margin: 0,
												filename: 'barcodes.pdf',
												image: { type: 'jpeg', quality: 0.98 },
												html2canvas: { scale: 2, useCORS: true },
												jsPDF: ${JSON.stringify(jsPdfOptions)}
											};
											html2pdf().set(opt).from(element).save();
										});
									});
								}
							}, 50);
						}
					<\/script>
				</body>
			</html>
		`);
		printWindow.document.close();
	};

		return {
		pageFormat,
		pageFormatOptions,
		gridCols,
		gridRows,
		includePrice,
		includeBatchSerial,
		symbology,
		symbologyOptions,
		outputFormat,
		includeWarehouseLocation,
		printerDpi,
		selectedPrinterProfile,
		printerProfiles,
		rfidEnabled,
		rfidEpcPrefix,
		activeDesignerTemplate,
		hasActiveTemplate,
		setDesignerTemplate,
		clearDesignerTemplate,
		parseLabelSize,
		getPrintStyles,
		generatePrintContent,
		getPrintWindowContent,
		getPrintableItems,
		printLabels,
		printLabelsThermal,
		printLabelsThermalWithFailover,
		printLabelsRaw,
		printLabelsRawWithFailover,
		qzThermalAvailable,
		downloadPdf,
		fetchPrinterProfiles,
		applyPrinterProfile,
		formatCurrency,
		escapeHtml,
		validateBarcodeCheckDigit,
		getBarcodeCheckDigitWarning,
		getBarcodeHeight,
		getBarcodeWidth,
		getBarcodeFontSize,
		getBarcodeDimensions,
		getLabelSizeWarnings,
		getBarcodeCompliance,
		getSymbologyForJsBarcode,
		getEpcData,
	};
}
