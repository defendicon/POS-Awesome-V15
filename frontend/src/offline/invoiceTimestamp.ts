/** Capture sale time once, before persistence, so retries never use reconnect time. */
export function captureOfflineInvoiceTime(
	invoice: Record<string, any>,
	now = new Date(),
) {
	if (invoice._posa_offline_created_at) return;
	const boot = (globalThis.frappe as any)?.boot;
	const timezone = boot?.time_zone?.system || boot?.sysdefaults?.time_zone;
	const parts = new Intl.DateTimeFormat("en-CA", {
		...(timezone ? { timeZone: timezone } : {}),
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const part = (type: string) =>
		parts.find((row) => row.type === type)?.value;
	// Preserve an explicitly selected accounting date/time, including returns.
	if (!Number(invoice.set_posting_time) || !invoice.posting_date) {
		invoice.posting_date = `${part("year")}-${part("month")}-${part("day")}`;
	}
	if (!Number(invoice.set_posting_time) || !invoice.posting_time) {
		invoice.posting_time = `${part("hour")}:${part("minute")}:${part("second")}`;
	}
	invoice.set_posting_time = 1;
	invoice._posa_offline_created_at = now.toISOString();
}
