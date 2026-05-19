type Translator = (value: string) => string;
type DateFormatter = (value?: string) => string;

type ReportPeriod = {
	from?: string;
	to?: string;
	day_from?: string;
	day_to?: string;
};

type DateContext = {
	month_start?: string;
	today?: string;
};

export function reportRangeLabel(
	period: ReportPeriod | undefined,
	dateContext: DateContext | undefined,
	formatDate: DateFormatter,
	translate: Translator,
) {
	const from = period?.from || dateContext?.month_start;
	const to = period?.to || dateContext?.today;
	if (!from || !to) {
		return translate("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
}

export function salesTrendRangeLabel(
	period: ReportPeriod | undefined,
	formatDate: DateFormatter,
	translate: Translator,
) {
	const from = period?.day_from;
	const to = period?.day_to;
	if (!from || !to) {
		return translate("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
}

export function positiveMax<T>(rows: T[], resolveValue: (row: T) => number) {
	const maxValue = rows.reduce(
		(max, row) => Math.max(max, Math.abs(Number(resolveValue(row) || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
}

export function positiveCombinedMax<T>(rows: T[], resolveValue: (row: T) => number) {
	const maxValue = rows.reduce((max, row) => Math.max(max, Math.abs(Number(resolveValue(row) || 0))), 0);
	return maxValue > 0 ? maxValue : 1;
}

export function sortByMagnitudeDesc<T>(rows: T[], resolveValue: (row: T) => number) {
	return [...rows].sort(
		(a, b) => Math.abs(Number(resolveValue(b) || 0)) - Math.abs(Number(resolveValue(a) || 0)),
	);
}

export function sortByNumberDesc<T>(rows: T[], resolveValue: (row: T) => number) {
	return [...rows].sort((a, b) => Number(resolveValue(b) || 0) - Number(resolveValue(a) || 0));
}

export function sortByStringAsc<T>(rows: T[], resolveValue: (row: T) => string | undefined) {
	return [...rows].sort((a, b) =>
		String(resolveValue(a) || "").localeCompare(String(resolveValue(b) || "")),
	);
}

export function limitRows<T>(rows: T[], limit: number, fallback = 20) {
	return rows.slice(0, Number(limit || fallback));
}

export function latestRows<T>(rows: T[], count: number) {
	if (count <= 0) {
		return [];
	}
	return rows.slice(-count);
}
