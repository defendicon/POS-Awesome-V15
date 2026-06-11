import { db, withDbTransaction } from "../db";

export type OfflinePricingRuleRecord = {
	key: string;
	rule_name: string;
	target_type: string;
	target_value: string;
	modified?: string | null;
	[key: string]: any;
};

class PricingRuleRepository {
	async clear() {
		await db.table("pricing_rule_records").clear();
	}

	async replaceRuleTargets(rows: OfflinePricingRuleRecord[]) {
		const validRows = (rows || []).filter(
			(row) => row?.key && row?.rule_name,
		);
		if (!validRows.length) {
			return;
		}
		const ruleNames = [...new Set(validRows.map((row) => row.rule_name))];
		await withDbTransaction("rw", "pricing_rule_records", async () => {
			await db
				.table("pricing_rule_records")
				.where("rule_name")
				.anyOf(ruleNames)
				.delete();
			await db.table("pricing_rule_records").bulkPut(validRows);
		});
	}

	async deleteByRuleNames(ruleNames: string[]) {
		const names = [...new Set((ruleNames || []).filter(Boolean))];
		if (!names.length) {
			return;
		}
		await db
			.table("pricing_rule_records")
			.where("rule_name")
			.anyOf(names)
			.delete();
	}

	async findByTarget(
		targetType: string,
		targetValue: string,
	): Promise<OfflinePricingRuleRecord[]> {
		if (!targetType) {
			return [];
		}
		return db
			.table("pricing_rule_records")
			.where("[target_type+target_value]")
			.equals([targetType, targetValue || ""])
			.toArray();
	}

	async getAll(): Promise<OfflinePricingRuleRecord[]> {
		return db.table("pricing_rule_records").toArray();
	}
}

export const pricingRuleRepository = new PricingRuleRepository();
