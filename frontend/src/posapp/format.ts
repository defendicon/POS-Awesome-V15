import { computed } from "vue";
import { useUIStore } from "./stores/uiStore";

declare const frappe: any;
declare const __: any;
declare const flt: any;
declare const get_currency_symbol: any;

// Type definitions for RTL and numeral systems
export type NumeralsMode = "western" | "arabic-indic";

// --- Standalone Utility Functions ---

/**
 * Check if the current language/layout is RTL.
 */
export function isRtl(): boolean {
	if (
		typeof frappe !== "undefined" &&
		frappe.utils &&
		typeof frappe.utils.is_rtl === "function"
	) {
		return frappe.utils.is_rtl();
	}
	const htmlDir = document.documentElement.dir || document.body.dir || "";
	if (htmlDir.toLowerCase() === "rtl") return true;

	const docLang = document.documentElement.lang || "";
	const rtlLanguages = ["ar", "he", "fa", "ur", "ps", "sd", "ku", "dv"];
	return rtlLanguages.some((lang) => docLang.toLowerCase().startsWith(lang));
}

/**
 * Determine if the user prefers Western numerals even in RTL.
 */
export function useWestern(): boolean {
	try {
		const stored = localStorage.getItem("use_western_numerals");
		if (stored !== null) {
			return ["1", "true", "yes"].includes(stored.toLowerCase());
		}
	} catch {
		/* localStorage not available */
	}
	if (typeof frappe !== "undefined") {
		const bootVal =
			frappe.boot?.use_western_numerals ||
			frappe.boot?.pos_profile?.use_western_numerals;
		if (typeof bootVal !== "undefined") {
			return Boolean(bootVal);
		}
	}
	return false;
}

/**
 * Helper to check if Arabic-Indic numerals should be used.
 */
export function shouldUseArabic(): boolean {
	return isRtl() && !useWestern();
}

/**
 * Convert Western numerals to Arabic-Indic numerals if needed.
 */
export function toArabicNumerals(str: string | number): string {
	const s = String(str);
	if (!shouldUseArabic()) return s;
	const westernToArabic: Record<string, string> = {
		"0": "٠",
		"1": "١",
		"2": "٢",
		"3": "٣",
		"4": "٤",
		"5": "٥",
		"6": "٦",
		"7": "٧",
		"8": "٨",
		"9": "٩",
	};
	return s.replace(
		/[0-9]/g,
		(match: string) => westernToArabic[match] || match,
	);
}

/**
 * Convert Arabic-Indic numerals back to Western numerals for parsing.
 */
export function fromArabicNumerals(str: string | number): string {
	const s = String(str);
	const arabicToWestern: Record<string, string> = {
		"٠": "0",
		"١": "1",
		"٢": "2",
		"٣": "3",
		"٤": "4",
		"٥": "5",
		"٦": "6",
		"٧": "7",
		"٨": "8",
		"٩": "9",
	};
	return s
		.replace(/[٠-٩]/g, (match: string) => arabicToWestern[match] || match)
		.replace(/٬/g, ",")
		.replace(/٫/g, ".");
}

/**
 * Get appropriate locale for number formatting.
 */
export function getNumberLocale(): string {
	if (shouldUseArabic()) {
		const lang = document.documentElement.lang || "ar";
		if (lang.startsWith("ar")) return "ar-SA";
		if (lang.startsWith("fa")) return "fa-IR";
		return "ar-SA";
	}
	return "en-US";
}

/**
 * Compatibility object for legacy formatUtils.
 */
export const formatUtils = {
	isRtl,
	useWestern,
	shouldUseArabic,
	toArabicNumerals,
	fromArabicNumerals,
	getNumberLocale,
};

const INVALID_DATE_MARKERS = new Set([
	"invalid date",
	"nan",
	"none",
	"null",
	"undefined",
]);

function buildIsoDate(
	yearInput: number | string,
	monthInput: number | string,
	dayInput: number | string,
): string | null {
	const year = Number.parseInt(String(yearInput), 10);
	const month = Number.parseInt(String(monthInput), 10);
	const day = Number.parseInt(String(dayInput), 10);

	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	) {
		return null;
	}

	const parsed = new Date(year, month - 1, day);
	if (
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== month - 1 ||
		parsed.getDate() !== day
	) {
		return null;
	}

	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
		2,
		"0",
	)}`;
}

export function normalizeDateForBackend(date: any): string | null {
	if (date === null || typeof date === "undefined") return null;

	if (date instanceof Date) {
		if (Number.isNaN(date.getTime())) return null;
		return buildIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}

	const normalized = fromArabicNumerals(String(date)).trim();
	if (!normalized) return null;

	if (INVALID_DATE_MARKERS.has(normalized.toLowerCase())) {
		return null;
	}

	if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
		const [year, month, day] = normalized.split("-");
		return buildIsoDate(year || "", month || "", day || "");
	}

	if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(normalized)) {
		const parts = normalized.split(/[/-]/);
		return buildIsoDate(parts[2] || "", parts[1] || "", parts[0] || "");
	}

	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return buildIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

// --- Composable: useFormat ---

/**
 * Composable providing formatting logic.
 * Use this in new components instead of the mixin.
 */
export function useFormat() {
	const uiStore = useUIStore();

	const float_precision = computed(() => {
		const prec = parseInt(
			uiStore.posProfile?.posa_decimal_precision as any,
		);
		return isNaN(prec)
			? frappe.defaults.get_default("float_precision") || 2
			: prec;
	});

	const currency_precision = computed(() => {
		const prec = parseInt(
			uiStore.posProfile?.posa_decimal_precision as any,
		);
		return isNaN(prec)
			? frappe.defaults.get_default("currency_precision") || 2
			: prec;
	});

	/**
	 * Frappe flt wrapper.
	 */
	const flt_wrapper = (
		value: any,
		precision?: number,
		number_format?: string,
		rounding_method?: string,
	): number => {
		const prec =
			precision !== undefined ? precision : currency_precision.value;
		const method = rounding_method || "Banker's Rounding (legacy)";
		return flt(value, prec, number_format, method);
	};

	/**
	 * Formats a value as currency.
	 */
	const formatCurrency = (value: any, precision?: number): string => {
		const val = value === null || value === undefined ? 0 : value;
		let number = Number(fromArabicNumerals(String(val)).replace(/,/g, ""));
		if (isNaN(number)) number = 0;

		let prec =
			precision !== undefined
				? Number(precision)
				: Number(currency_precision.value);
		if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
			prec = Math.min(Math.max(prec || 2, 0), 20);
		}

		const locale = getNumberLocale();
		let formatted = number.toLocaleString(locale, {
			minimumFractionDigits: prec,
			maximumFractionDigits: prec,
			useGrouping: true,
		});

		return toArabicNumerals(formatted);
	};

	/**
	 * Formats a value as a float.
	 */
	const formatFloat = (value: any, precision?: number): string => {
		const val = value === null || value === undefined ? 0 : value;
		let number = Number(fromArabicNumerals(String(val)).replace(/,/g, ""));
		if (isNaN(number)) number = 0;

		let prec =
			precision !== undefined
				? Number(precision)
				: Number(float_precision.value);
		if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
			prec = Math.min(Math.max(prec || 2, 0), 20);
		}

		const locale = getNumberLocale();
		let formatted = number.toLocaleString(locale, {
			minimumFractionDigits: prec,
			maximumFractionDigits: prec,
			useGrouping: true,
		});

		return toArabicNumerals(formatted);
	};

	const currencySymbol = (currency: string): string => {
		return get_currency_symbol(currency);
	};

	const isNumber = (value: any): boolean | string => {
		const westernValue = fromArabicNumerals(String(value));
		const pattern = /^-?(\d+|\d{1,3}(\.\d{3})*)(,\d+)?$/;
		return pattern.test(westernValue) || "invalid number";
	};

	const isNegative = (value: any): boolean => {
		if (value === null || value === undefined) return false;
		const number = Number(
			fromArabicNumerals(String(value)).replace(/,/g, ""),
		);
		return !isNaN(number) && number < 0;
	};

	return {
		float_precision,
		currency_precision,
		flt: flt_wrapper,
		formatCurrency,
		formatFloat,
		currencySymbol,
		isNumber,
		isNegative,
		setFormatedFloat(
			el: any,
			field_name: string,
			precision?: number,
			no_negative = false,
			event?: any,
		) {
			let input_val = event && event.target ? event.target.value : event;
			if (typeof input_val === "string") {
				input_val = fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			const prec =
				precision !== undefined ? precision : float_precision.value;
			let value = flt(input_val, prec);
			if (isNaN(value)) value = 0;
			if (no_negative && value < 0) value = Math.abs(value);
			if (el && field_name) el[field_name] = value;
			return value;
		},
		setFormatedCurrency(
			el: any,
			field_name: string,
			precision?: number,
			no_negative = false,
			event?: any,
		) {
			let input_val = event && event.target ? event.target.value : event;
			if (typeof input_val === "string") {
				input_val = fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			const prec =
				precision !== undefined ? precision : currency_precision.value;
			let value = flt(input_val, prec);
			if (isNaN(value)) value = 0;
			if (no_negative && value < 0) value = Math.abs(value);
			if (el && field_name) el[field_name] = value;
			return formatCurrency(value, precision);
		},
	};
}

// --- Legacy Mixin Support ---

/**
 * Default export as a mixin for compatibility with existing components.
 */
export default {
	data() {
		return {
			float_precision: 2,
			currency_precision: 2,
		};
	},
	methods: {
		flt(
			this: any,
			value: any,
			precision?: number,
			number_format?: string,
			rounding_method?: string,
		): number {
			const prec =
				precision !== undefined
					? precision
					: this.currency_precision || 2;
			return flt(
				value,
				prec,
				number_format,
				rounding_method || "Banker's Rounding (legacy)",
			);
		},
		formatCurrency(this: any, value: any, precision?: number): string {
			const val = value === null || value === undefined ? 0 : value;
			let number = Number(
				fromArabicNumerals(String(val)).replace(/,/g, ""),
			);
			if (isNaN(number)) number = 0;
			let prec =
				precision !== undefined
					? Number(precision)
					: Number(this.currency_precision || 2);
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(prec || 2, 0), 20);
			}
			const locale = getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});
			return toArabicNumerals(formatted);
		},
		formatFloat(this: any, value: any, precision?: number): string {
			const val = value === null || value === undefined ? 0 : value;
			let number = Number(
				fromArabicNumerals(String(val)).replace(/,/g, ""),
			);
			if (isNaN(number)) number = 0;
			let prec =
				precision !== undefined
					? Number(precision)
					: Number(this.float_precision || 2);
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(prec || 2, 0), 20);
			}
			const locale = getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});
			return toArabicNumerals(formatted);
		},
		currencySymbol(currency: string): string {
			return get_currency_symbol(currency);
		},
		isNumber(value: any): boolean | string {
			const westernValue = fromArabicNumerals(String(value));
			const pattern = /^-?(\d+|\d{1,3}(\.\d{3})*)(,\d+)?$/;
			return pattern.test(westernValue) || "invalid number";
		},
		isNegative(value: any): boolean {
			if (value === null || value === undefined) return false;
			const number = Number(
				fromArabicNumerals(String(value)).replace(/,/g, ""),
			);
			return !isNaN(number) && number < 0;
		},
		setFormatedFloat(
			this: any,
			el: any,
			field_name: string,
			precision?: number,
			no_negative = false,
			event?: any,
		) {
			let input_val = event && event.target ? event.target.value : event;
			if (typeof input_val === "string") {
				input_val = fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			const prec =
				precision !== undefined ? precision : this.float_precision || 2;
			let value = flt(input_val, prec);
			if (isNaN(value)) value = 0;
			if (no_negative && value < 0) value = Math.abs(value);
			if (el && field_name) el[field_name] = value;
			return value;
		},
		setFormatedCurrency(
			this: any,
			el: any,
			field_name: string,
			precision?: number,
			no_negative = false,
			event?: any,
		) {
			let input_val = event && event.target ? event.target.value : event;
			if (typeof input_val === "string") {
				input_val = fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			const prec =
				precision !== undefined
					? precision
					: this.currency_precision || 2;
			let value = flt(input_val, prec);
			if (isNaN(value)) value = 0;
			if (no_negative && value < 0) value = Math.abs(value);
			if (el && field_name) el[field_name] = value;
			return this.formatCurrency(value, precision);
		},
		formatDateForBackend(date: any): string | null {
			return normalizeDateForBackend(date);
		},
	},
	mounted(this: any) {
		this.float_precision =
			frappe.defaults.get_default("float_precision") || 2;
		this.currency_precision =
			frappe.defaults.get_default("currency_precision") || 2;

		const updatePrecision = (data: any) => {
			const profile = data.pos_profile || data;
			const prec = parseInt(profile.posa_decimal_precision);
			if (!isNaN(prec)) {
				this.float_precision = prec;
				this.currency_precision = prec;
			}
		};

		try {
			const uiStore = useUIStore();
			this.$watch(
				() => uiStore.posProfile,
				(newVal: any) => {
					if (newVal) updatePrecision(newVal);
				},
				{ deep: true, immediate: true },
			);
		} catch (e) {
			console.warn("Failed to connect format.ts mixin to uiStore", e);
		}
	},
};
