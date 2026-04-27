export type ScanAssignment = {
	serialNo: string | null;
	batchNo: string | null;
};

export const emptyScanAssignment = (): ScanAssignment => ({
	serialNo: null,
	batchNo: null,
});

export const extractScanAssignmentFromItem = (
	item: any,
	rawCode: string,
): ScanAssignment => {
	const code = String(rawCode || "").trim();
	if (!item || !code) {
		return emptyScanAssignment();
	}

	let serialNo: string | null = null;
	let batchNo: string | null = null;

	if (item.has_serial_no && Array.isArray(item.serial_no_data)) {
		const serialMatch = item.serial_no_data.find(
			(row: any) => String(row?.serial_no || "").trim() === code,
		);
		if (serialMatch?.serial_no) {
			serialNo = String(serialMatch.serial_no);
			if (!batchNo && serialMatch?.batch_no) {
				batchNo = String(serialMatch.batch_no);
			}
		}
	}

	if (item.has_batch_no && Array.isArray(item.batch_no_data)) {
		const batchMatch = item.batch_no_data.find(
			(row: any) => String(row?.batch_no || "").trim() === code,
		);
		if (batchMatch?.batch_no) {
			batchNo = String(batchMatch.batch_no);
		}
	}

	return { serialNo, batchNo };
};
