import { describe, expect, it } from "vitest";

import { extractScanAssignmentFromItem } from "../src/posapp/composables/pos/items/scanProcessor/scanAssignment";

describe("extractScanAssignmentFromItem", () => {
	it("returns serial and its batch when the scanned code matches serial data", () => {
		const assignment = extractScanAssignmentFromItem(
			{
				has_serial_no: 1,
				has_batch_no: 1,
				serial_no_data: [
					{ serial_no: "SER-001", batch_no: "BATCH-FROM-SERIAL" },
				],
				batch_no_data: [{ batch_no: "BATCH-OTHER" }],
			},
			" SER-001 ",
		);

		expect(assignment).toEqual({
			serialNo: "SER-001",
			batchNo: "BATCH-FROM-SERIAL",
		});
	});

	it("lets an exact batch match override the serial-linked batch", () => {
		const assignment = extractScanAssignmentFromItem(
			{
				has_serial_no: 1,
				has_batch_no: 1,
				serial_no_data: [
					{ serial_no: "MATCH-BOTH", batch_no: "BATCH-FROM-SERIAL" },
				],
				batch_no_data: [{ batch_no: "MATCH-BOTH" }],
			},
			"MATCH-BOTH",
		);

		expect(assignment).toEqual({
			serialNo: "MATCH-BOTH",
			batchNo: "MATCH-BOTH",
		});
	});

	it("returns an empty assignment for missing items or blank scanned codes", () => {
		expect(extractScanAssignmentFromItem(null, "SER-001")).toEqual({
			serialNo: null,
			batchNo: null,
		});
		expect(
			extractScanAssignmentFromItem({ has_serial_no: 1 }, "   "),
		).toEqual({
			serialNo: null,
			batchNo: null,
		});
	});
});
