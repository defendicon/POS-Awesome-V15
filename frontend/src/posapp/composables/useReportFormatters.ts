type Translator = (value: string) => string;

type ReportFormatterOptions = {
	getCurrency: () => string;
	translate?: Translator;
};

const defaultTranslate: Translator = (value) => (window.__ ? window.__(value) : value);

export function createReportFormatters(options: ReportFormatterOptions) {
	const __ = options.translate || defaultTranslate;

	function formatMoney(value: number) {
		const amount = Number(value || 0);
		const formatted = new Intl.NumberFormat(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
		const currency = options.getCurrency();
		const symbol =
			typeof get_currency_symbol === "function" && currency ? get_currency_symbol(currency) : "";
		return symbol ? `${symbol} ${formatted}` : formatted;
	}

	function formatQuantity(value: number) {
		return new Intl.NumberFormat(undefined, {
			maximumFractionDigits: 2,
		}).format(Number(value || 0));
	}

	function formatSignedQuantity(value: number) {
		const numeric = Number(value || 0);
		const prefix = numeric > 0 ? "+" : "";
		return `${prefix}${formatQuantity(numeric)}`;
	}

	function formatDate(value?: string) {
		if (!value) {
			return "-";
		}
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) {
			return value;
		}
		return parsed.toLocaleDateString();
	}

	function formatPercent(value?: number | null, precision = 1) {
		if (value === null || value === undefined || Number.isNaN(Number(value))) {
			return __("N/A");
		}
		return `${Number(value).toFixed(precision)}%`;
	}

	function formatDays(value?: number | null) {
		if (value === null || value === undefined || Number.isNaN(Number(value))) {
			return __("N/A");
		}
		return `${Math.round(Number(value))} ${__("days")}`;
	}

	function formatMovementCategory(category?: string) {
		const normalized = String(category || "")
			.trim()
			.toLowerCase();
		if (normalized === "sale") {
			return __("Sale");
		}
		if (normalized === "return") {
			return __("Return");
		}
		if (normalized === "adjustment") {
			return __("Adjustment");
		}
		if (normalized === "transfer") {
			return __("Transfer");
		}
		return __("Other");
	}

	function urgencyLabel(value?: string) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();
		if (normalized === "critical") {
			return __("Critical");
		}
		if (normalized === "high") {
			return __("High");
		}
		if (normalized === "medium") {
			return __("Medium");
		}
		if (normalized === "low") {
			return __("Low");
		}
		return __("Unknown");
	}

	function urgencyColor(value?: string) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();
		if (normalized === "critical") {
			return "error";
		}
		if (normalized === "high") {
			return "warning";
		}
		if (normalized === "medium") {
			return "info";
		}
		if (normalized === "low") {
			return "success";
		}
		return "secondary";
	}

	function progressFromQuantity(quantity: number, maxQuantity: number) {
		return Math.min(100, (Number(quantity || 0) / Math.max(1, Number(maxQuantity || 1))) * 100);
	}

	function stockChipColor(quantity: number) {
		return Number(quantity || 0) <= 0 ? "error" : "warning";
	}

	function paymentCategoryColor(category?: string) {
		if (category === "cash") {
			return "success";
		}
		if (category === "card_online") {
			return "info";
		}
		return "secondary";
	}

	function trendProgress(value: number, maxValue: number) {
		return Math.min(100, (Math.abs(Number(value || 0)) / Math.max(1, Number(maxValue || 1))) * 100);
	}

	function formatTrendPct(value?: number | null) {
		if (value === null || value === undefined || Number.isNaN(Number(value))) {
			return __("N/A");
		}
		const numeric = Number(value);
		const prefix = numeric > 0 ? "+" : "";
		return `${prefix}${numeric.toFixed(1)}%`;
	}

	function trendGrowthColor(value?: number | null) {
		if (value === null || value === undefined || Number.isNaN(Number(value))) {
			return "secondary";
		}
		if (Number(value) > 0) {
			return "success";
		}
		if (Number(value) < 0) {
			return "error";
		}
		return "warning";
	}

	return {
		formatMoney,
		formatQuantity,
		formatSignedQuantity,
		formatDate,
		formatPercent,
		formatDays,
		formatMovementCategory,
		urgencyLabel,
		urgencyColor,
		progressFromQuantity,
		stockChipColor,
		paymentCategoryColor,
		trendProgress,
		formatTrendPct,
		trendGrowthColor,
	};
}
