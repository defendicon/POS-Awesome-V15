import { db, withDbTransaction } from "../db";

export type OfflineItemPriceRecord = {
	name: string;
	price_list: string;
	item_code: string;
	uom?: string | null;
	currency?: string | null;
	customer?: string | null;
	price_list_rate?: number | null;
	valid_from?: string | null;
	valid_upto?: string | null;
	modified?: string | null;
	[key: string]: any;
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
}

export const itemPriceRepository = new ItemPriceRepository();
