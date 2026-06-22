import { db } from "../db";

export type OfflineCurrencyRateRecord = {
	name: string;
	profile_name: string;
	company: string;
	from_currency: string;
	to_currency: string;
	exchange_rate: number;
	date: string;
	modified?: string | null;
	[key: string]: any;
};

type CurrencyRateLookup = {
	profileName: string;
	company: string;
	fromCurrency: string;
	toCurrency: string;
	date: string;
};

class CurrencyRateRepository {
	async clear() {
		await db.table("currency_rate_records").clear();
	}

	async upsertMany(rows: OfflineCurrencyRateRecord[]) {
		const validRows = (rows || []).filter(
			(row) =>
				row?.name &&
				row?.profile_name &&
				row?.from_currency &&
				row?.to_currency &&
				row?.date,
		);
		if (!validRows.length) {
			return;
		}
		await db.table("currency_rate_records").bulkPut(validRows);
	}

	async deleteByNames(names: string[]) {
		const keys = [...new Set((names || []).filter(Boolean))];
		if (!keys.length) {
			return;
		}
		await db.table("currency_rate_records").bulkDelete(keys);
	}

	async findForPair({
		profileName,
		company,
		fromCurrency,
		toCurrency,
	}: Omit<CurrencyRateLookup, "date">): Promise<
		OfflineCurrencyRateRecord[]
	> {
		if (!profileName || !fromCurrency || !toCurrency) {
			return [];
		}
		return db
			.table("currency_rate_records")
			.where("[profile_name+company+from_currency+to_currency]")
			.equals([
				profileName,
				company || "",
				fromCurrency,
				toCurrency,
			])
			.toArray();
	}

	async findLatestOnOrBefore(
		lookup: CurrencyRateLookup,
	): Promise<OfflineCurrencyRateRecord | null> {
		const rows = await this.findForPair(lookup);
		const eligible = rows
			.filter((row) => !lookup.date || row.date <= lookup.date)
			.sort((left, right) => {
				const dateOrder = String(right.date || "").localeCompare(
					String(left.date || ""),
				);
				if (dateOrder) {
					return dateOrder;
				}
				return String(right.modified || "").localeCompare(
					String(left.modified || ""),
				);
			});
		return eligible[0] || null;
	}
}

export const currencyRateRepository = new CurrencyRateRepository();
