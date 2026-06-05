import { ref } from "vue";

declare const __: (_str: string, _args?: any[]) => string;
declare const frappe: any;

export const SSCC_TOTAL_DIGITS = 18;

export interface GeneratedSscc {
	sscc18: string;
	human_readable: string;
	serial_ref: number;
}

export function formatSsccHuman(sscc: string): string {
	const d = sscc.replace(/\D/g, "");
	if (d.length !== 18) return sscc;
	return `(00) ${d.substring(0, 1)} ${d.substring(1, 8)} ${d.substring(8, 17)} ${d[17]}`;
}

export function useSsccGenerator() {
	const companyPrefix = ref("1234567");
	const extensionDigit = ref("0");
	const generating = ref(false);

	const generateBatch = async (count: number): Promise<GeneratedSscc[]> => {
		generating.value = true;
		const c = Math.max(1, Math.min(100, Math.round(count) || 1));
		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.sscc_api.get_next_sscc_serials",
				args: {
					company_prefix: companyPrefix.value,
					extension_digit: extensionDigit.value,
					count: c,
				},
				silent: true,
			});
			return (res.message || []) as GeneratedSscc[];
		} finally {
			generating.value = false;
		}
	};

	return {
		companyPrefix,
		extensionDigit,
		generating,
		generateBatch,
	};
}
