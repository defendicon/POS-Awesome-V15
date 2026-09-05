import { db, withDbTransaction } from "../db";

export type OfflineItemPriceRecord = {
	name: string;
	price_list: string;
	item_code: string;
	uom?: string | null;
	currency?: string | null;
	customer?: string | null;
	supplier?: string | null;
	buying?: number | boolean | null;
	selling?: number | boolean | null;
	price_list_rate?: number | null;
	valid_from?: string | null;
	valid_upto?: string | null;
	modified?: string | null;
	[key: string]: any;
};

export type ApplicableItemPriceQuery = {
	priceList: string;
	itemCode: string;
	uom: string;
	customer?: string | null;
	currency?: string | null;
	date?: string | null;
};

const normalizeText = (value: unknown): string => String(value || "").trim();

const isActiveOn = (
	row: OfflineItemPriceRecord,
	date: string | null | undefined,
): boolean => {
	const target = normalizeText(date).slice(0, 10);
	if (!target) return true;
	const validFrom = normalizeText(row.valid_from).slice(0, 10);
	const validUpto = normalizeText(row.valid_upto).slice(0, 10);
	return (!validFrom || validFrom <= target) && (!validUpto || validUpto >= target);
};

class ItemPriceRepository {
	async clear() {
		await db.table("item_price_records").clear();
	}

	async upsertMany(rows: OfflineItemPriceRecord[]) {
		const validRows = (rows || []).filter(
			(row) => row?.name && row?.price_list && row?.item_code,
		);
		if (!validRows.length) {
			return;
		}
		await db.table("item_price_records").bulkPut(validRows);
	}

	async deleteByNames(names: string[]) {
		const keys = [...new Set((names || []).filter(Boolean))];
		if (!keys.length) {
			return;
		}
		await db.table("item_price_records").bulkDelete(keys);
	}

	async deleteOutsidePriceLists(priceLists: string[]) {
		const allowed = new Set((priceLists || []).filter(Boolean));
		const table = db.table("item_price_records");
		if (!allowed.size) {
			await table.clear();
			return;
		}
		const staleNames = await table
			.filter((row) => !allowed.has(String(row.price_list || "")))
			.primaryKeys();
		if (staleNames.length) {
			await table.bulkDelete(staleNames);
		}
	}

	async replaceAll(rows: OfflineItemPriceRecord[]) {
		await withDbTransaction("rw", "item_price_records", async () => {
			await db.table("item_price_records").clear();
			await this.upsertMany(rows);
		});
	}

	async findForItem(
		priceList: string,
		itemCode: string,
	): Promise<OfflineItemPriceRecord[]> {
		if (!priceList || !itemCode) {
			return [];
		}
		return db
			.table("item_price_records")
			.where("[price_list+item_code]")
			.equals([priceList, itemCode])
			.toArray();
	}

	async findForItemAndUom(
		priceList: string,
		itemCode: string,
		uom: string,
	): Promise<OfflineItemPriceRecord[]> {
		if (!priceList || !itemCode || !uom) {
			return [];
		}
		return db
			.table("item_price_records")
			.where("[price_list+item_code+uom]")
			.equals([priceList, itemCode, uom])
			.toArray();
	}

	async findApplicableForItemAndUom(
		query: ApplicableItemPriceQuery,
	): Promise<OfflineItemPriceRecord | null> {
		const customer = normalizeText(query.customer);
		const currency = normalizeText(query.currency);
		const rows = await this.findForItemAndUom(
			query.priceList,
			query.itemCode,
			query.uom,
		);

		const applicable = rows.filter((row) => {
			const rowCustomer = normalizeText(row.customer);
			const rowCurrency = normalizeText(row.currency);
			const isBuyingOnly =
				(row.buying === 1 || row.buying === true) &&
				row.selling !== 1 &&
				row.selling !== true;
			return (
				!isBuyingOnly &&
				(!rowCustomer || (!!customer && rowCustomer === customer)) &&
				(!rowCurrency || !currency || rowCurrency === currency) &&
				isActiveOn(row, query.date)
			);
		});

		applicable.sort((left, right) => {
			const leftCustomer = normalizeText(left.customer) === customer ? 1 : 0;
			const rightCustomer = normalizeText(right.customer) === customer ? 1 : 0;
			if (leftCustomer !== rightCustomer) return rightCustomer - leftCustomer;
			const leftValidFrom = normalizeText(left.valid_from);
			const rightValidFrom = normalizeText(right.valid_from);
			if (leftValidFrom !== rightValidFrom) {
				return rightValidFrom.localeCompare(leftValidFrom);
			}
			return normalizeText(right.modified).localeCompare(
				normalizeText(left.modified),
			);
		});

		return applicable[0] || null;
	}
}

export const itemPriceRepository = new ItemPriceRepository();
