/* global frappe, flt, get_currency_symbol */
// Utility functions for RTL number formatting (standalone)
export const formatUtils = {
	// Check if current language/layout is RTL
	isRtl() {
		// Check via frappe utils first
		if (typeof frappe !== "undefined" && frappe.utils && typeof frappe.utils.is_rtl === "function") {
			return frappe.utils.is_rtl();
		}
		// Check HTML dir attribute
		const htmlDir = document.documentElement.dir || document.body.dir || "";
		if (htmlDir.toLowerCase() === "rtl") return true;
		// Check language
		const docLang = document.documentElement.lang || "";
		const rtlLanguages = ["ar", "he", "fa", "ur", "ps", "sd", "ku", "dv"];
		return rtlLanguages.some((lang) => docLang.toLowerCase().startsWith(lang));
	},

	// Determine if user prefers Western numerals even in RTL
	useWestern() {
		try {
			// Check a stored preference first
			const stored = localStorage.getItem("use_western_numerals");
			if (stored !== null) {
				return ["1", "true", "yes"].includes(stored.toLowerCase());
			}
		} catch {
			/* localStorage not available */
		}
		// Fallback to frappe boot settings if provided
		if (typeof frappe !== "undefined") {
			const bootVal =
				frappe.boot?.use_western_numerals || frappe.boot?.pos_profile?.use_western_numerals;
			if (typeof bootVal !== "undefined") {
				return Boolean(bootVal);
			}
		}
		return false;
	},

	// Helper to check if Arabic numerals should be used
	shouldUseArabic() {
		return this.isRtl() && !this.useWestern();
	},

	// Convert Western numerals to Arabic-Indic numerals
	toArabicNumerals(str) {
		if (!this.shouldUseArabic()) return str;
		const westernToArabic = {
			0: "٠",
			1: "١",
			2: "٢",
			3: "٣",
			4: "٤",
			5: "٥",
			6: "٦",
			7: "٧",
			8: "٨",
			9: "٩",
		};
		return String(str).replace(/[0-9]/g, (match) => westernToArabic[match]);
	},

	// Convert Arabic-Indic numerals back to Western numerals for parsing
	fromArabicNumerals(str) {
		const arabicToWestern = {
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
		return String(str)
			.replace(/[٠-٩]/g, (match) => arabicToWestern[match])
			.replace(/٬/g, ",")
			.replace(/٫/g, ".");
	},

	// Get appropriate locale for number formatting
	getNumberLocale() {
		if (this.shouldUseArabic()) {
			const lang = document.documentElement.lang || "ar";
			if (lang.startsWith("ar")) return "ar-SA"; // Arabic Saudi Arabia
			if (lang.startsWith("fa")) return "fa-IR"; // Persian Iran
			return "ar-SA"; // Default to Arabic
		}
		return "en-US";
	},
};

export default {
	data() {
		return {
			float_precision: 2,
			currency_precision: 2,
		};
	},
	methods: {
		flt(value, precision, number_format, rounding_method) {
			if (!precision && precision != 0) {
				precision = this.currency_precision || 2;
			}
			if (!rounding_method) {
				rounding_method = "Banker's Rounding (legacy)";
			}
			return flt(value, precision, number_format, rounding_method);
		},

		formatCurrency(value, precision) {
			if (value === null || value === undefined) {
				value = 0;
			}
			let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
			if (isNaN(number)) number = 0;
			let prec = precision != null ? Number(precision) : Number(this.currency_precision) || 2;
			// Clamp precision to the valid range 0-20 to avoid RangeError
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
			}

			const locale = formatUtils.getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});

			// Convert to Arabic-Indic numerals if needed
			formatted = formatUtils.toArabicNumerals(formatted);

			return formatted;
		},

		formatFloat(value, precision) {
			if (value === null || value === undefined) {
				value = 0;
			}
			let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
			if (isNaN(number)) number = 0;
			let prec = precision != null ? Number(precision) : Number(this.float_precision) || 2;
			// Clamp precision to the valid range 0-20 to avoid RangeError
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
			}

			const locale = formatUtils.getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});

			// Convert to Arabic-Indic numerals if needed
			formatted = formatUtils.toArabicNumerals(formatted);

			return formatted;
		},

		setFormatedCurrency(el, field_name, precision, no_negative = false, $event) {
			let input_val = $event && $event.target ? $event.target.value : $event;
			if (typeof input_val === "string") {
				// Convert Arabic numerals to Western for parsing
				input_val = formatUtils.fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			let value = parseFloat(input_val);
			if (isNaN(value)) {
				value = 0;
			} else if (no_negative && value < 0) {
				value = Math.abs(value);
			}
			if (typeof el === "object") {
				el[field_name] = value;
			} else {
				this[field_name] = value;
			}
			return this.formatCurrency(value, precision);
		},

		setFormatedFloat(el, field_name, precision, no_negative = false, $event) {
			let input_val = $event && $event.target ? $event.target.value : $event;
			if (typeof input_val === "string") {
				// Convert Arabic numerals to Western for parsing
				input_val = formatUtils.fromArabicNumerals(input_val);
				input_val = input_val.replace(/,/g, "");
			}
			let value = parseFloat(input_val);
			if (isNaN(value)) {
				value = 0;
			} else if (no_negative && value < 0) {
				value = Math.abs(value);
			}
			if (typeof el === "object") {
				el[field_name] = value;
			} else {
				this[field_name] = value;
			}
			return this.formatFloat(value, precision);
		},

		currencySymbol(currency) {
			return get_currency_symbol(currency);
		},

		isNumber(value) {
			// Convert Arabic numerals to Western for validation
			const westernValue = formatUtils.fromArabicNumerals(String(value));
			const pattern = /^-?(\d+|\d{1,3}(\.\d{3})*)(,\d+)?$/;
			return pattern.test(westernValue) || "invalid number";
		},

		// Check if a value is negative for CSS class binding
		isNegative(value) {
			if (value === null || value === undefined) return false;
			const number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
			return !isNaN(number) && number < 0;
		},

		// Format currency without HTML spans (for class binding approach)
		formatCurrencyPlain(value, precision) {
			if (value === null || value === undefined) {
				value = 0;
			}
			let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
			if (isNaN(number)) number = 0;
			let prec = precision != null ? Number(precision) : Number(this.currency_precision) || 2;
			// Clamp precision to the valid range 0-20 to avoid RangeError
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
			}

			const locale = formatUtils.getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});

			// Convert to Arabic-Indic numerals if needed
			formatted = formatUtils.toArabicNumerals(formatted);

			return formatted;
		},

		// Format float without HTML spans (for class binding approach)
		formatFloatPlain(value, precision) {
			if (value === null || value === undefined) {
				value = 0;
			}
			let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
			if (isNaN(number)) number = 0;
			let prec = precision != null ? Number(precision) : Number(this.float_precision) || 2;
			// Clamp precision to the valid range 0-20 to avoid RangeError
			if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
				prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
			}

			const locale = formatUtils.getNumberLocale();
			let formatted = number.toLocaleString(locale, {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});

			// Convert to Arabic-Indic numerals if needed
			formatted = formatUtils.toArabicNumerals(formatted);

			return formatted;
		},
	},
	mounted() {
		this.float_precision = frappe.defaults.get_default("float_precision") || 2;
		this.currency_precision = frappe.defaults.get_default("currency_precision") || 2;

		const updatePrecision = (data) => {
			const profile = data.pos_profile || data;
			const prec = parseInt(profile.posa_decimal_precision);
			if (!isNaN(prec)) {
				this.float_precision = prec;
				this.currency_precision = prec;
			}
		};

		if (this.eventBus && this.eventBus.on) {
			this.eventBus.on("register_pos_profile", updatePrecision);
			this.eventBus.on("payments_register_pos_profile", updatePrecision);
		}
	},
};
