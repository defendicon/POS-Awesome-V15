export interface HandoverScope {
	profile: string;
	company: string;
	opening: string;
	cashier: string;
}

export function getRecordedCashier(invoice: any) {
	if (invoice.posa_cashier) return String(invoice.posa_cashier);
	try {
		const payload =
			String(invoice._posa_offline_cashier_token || "").split(".")[0] ||
			"";
		return String(
			JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
				.cashier || "",
		);
	} catch {
		return "";
	}
}

/** Device-local offline sales only, grouped by invoice currency; not a drawer ledger. */
export async function getCashierHandoverSummary(
	scope: HandoverScope,
	profile: any,
) {
	const { ensureOfflineQueueReady, getQueueEntries } = await import(
		"./writeQueue"
	);
	await ensureOfflineQueueReady();
	const rows = await getQueueEntries("invoice", { includeSynced: true });
	const currencies = new Map<
		string,
		{
			currency: string;
			sales: number;
			cash: number;
			invoices: number;
			pending: number;
		}
	>();
	for (const row of rows) {
		const invoice = row.payload.invoice;
		if (
			!invoice ||
			invoice.pos_profile !== scope.profile ||
			invoice.company !== scope.company ||
			invoice.posa_pos_opening_shift !== scope.opening ||
			getRecordedCashier(invoice) !== scope.cashier
		)
			continue;
		const currency = String(invoice.currency || profile.currency || "");
		const summary = currencies.get(currency) || {
			currency,
			sales: 0,
			cash: 0,
			invoices: 0,
			pending: 0,
		};
		summary.sales += Number(
			invoice.rounded_total || invoice.grand_total || 0,
		);
		summary.invoices++;
		if (row.status !== "synced") summary.pending++;
		for (const payment of invoice.payments || []) {
			const method = (profile.payments || []).find(
				(method: any) =>
					method.mode_of_payment === payment.mode_of_payment,
			);
			if (
				payment.type === "Cash" ||
				method?.type === "Cash" ||
				payment.mode_of_payment === profile.posa_cash_mode_of_payment
			)
				summary.cash += Number(payment.amount || 0);
		}
		summary.cash -= Number(
			invoice.paid_change || row.payload.data?.paid_change || 0,
		);
		currencies.set(currency, summary);
	}
	return [...currencies.values()];
}

export async function recordCashierHandover(
	scope: HandoverScope,
	nextCashier: string,
	profile: any,
) {
	if (!scope.cashier || scope.cashier === nextCashier || !scope.opening)
		return;
	const summary = await getCashierHandoverSummary(scope, profile);
	const { db } = await import("./db");
	const id = crypto.randomUUID();
	await db
		.table("keyval")
		.put({
			key: `posa_cashier_handover:${id}`,
			value: {
				version: 1,
				id,
				...scope,
				user: globalThis.frappe?.session?.user,
				next_cashier: nextCashier,
				recorded_at: new Date().toISOString(),
				summary,
				kind: "device_offline_sales",
			},
		});
	return { id, summary };
}
