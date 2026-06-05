import { ref } from "vue";

declare const frappe: any;

export interface SerializationConfig {
	prefix: string;
	suffix: string;
	zeroPadWidth: number;
	startNumber: number;
	step: number;
	checkDigit: "none" | "mod10" | "mod43";
	scope: "per_job" | "per_label";
	namingSeries: string;
}

export function useSerializationEngine() {
	const config = ref<SerializationConfig>({
		prefix: "SN-",
		suffix: "",
		zeroPadWidth: 4,
		startNumber: 1,
		step: 1,
		checkDigit: "none",
		scope: "per_job",
		namingSeries: "POS-SERIAL-.#####",
	});

	const fetchNextSerials = async (count: number): Promise<number[]> => {
		try {
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.label_data_sources.get_next_serial_numbers",
				args: {
					naming_series: config.value.namingSeries,
					count,
				},
			});
			return Array.isArray(message) ? message : [];
		} catch {
			return [];
		}
	};

	const formatSerial = (num: number): string => {
		const padded = String(num).padStart(config.value.zeroPadWidth, "0");
		let serial = `${config.value.prefix}${padded}${config.value.suffix}`;

		if (config.value.checkDigit === "mod10") {
			serial += checkDigitMod10(serial);
		} else if (config.value.checkDigit === "mod43") {
			serial += checkDigitMod43(serial);
		}

		return serial;
	};

	const applySerialization = async (items: any[]): Promise<any[]> => {
		const totalLabels = items.reduce((sum: number, item: any) => sum + Math.max(1, Math.round(Number(item.qty) || 1)), 0);
		if (totalLabels <= 0) return items;

		const serialNumbers = await fetchNextSerials(totalLabels);
		if (!serialNumbers.length) return items;

		let serialIdx = 0;
		return items.map((item) => {
			const copies = Math.max(1, Math.round(Number(item.qty) || 1));
			const itemSerials: string[] = [];

			for (let i = 0; i < copies; i++) {
				if (serialIdx < serialNumbers.length) {
					itemSerials.push(formatSerial(serialNumbers[serialIdx]!));
					serialIdx++;
				}
			}

			return {
				...item,
				serial_no: itemSerials[0] || item.serial_no,
				_generated_serials: itemSerials,
				_serialization_applied: true,
			};
		});
	};

	const previewSerials = (count: number): string[] => {
		const result: string[] = [];
		for (let i = 0; i < count; i++) {
			result.push(formatSerial(config.value.startNumber + i * config.value.step));
		}
		return result;
	};

	const checkDigitMod10 = (value: string): number => {
		const digits = value.replace(/\D/g, "");
		let sum = 0;
		for (let i = 0; i < digits.length; i++) {
			const d = parseInt(digits[i]!, 10) || 0;
			sum += (i % 2 === 0) ? d * 3 : d;
		}
		return (10 - (sum % 10)) % 10;
	};

	const checkDigitMod43 = (value: string): string => {
		const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
		let sum = 0;
		for (const ch of value) {
			sum += chars.indexOf(ch.toUpperCase());
		}
		return chars[sum % 43] || "0";
	};

	const resetCounter = () => {
		config.value.startNumber = 1;
	};

	return {
		config,
		fetchNextSerials,
		formatSerial,
		applySerialization,
		previewSerials,
		checkDigitMod10,
		checkDigitMod43,
		resetCounter,
	};
}
