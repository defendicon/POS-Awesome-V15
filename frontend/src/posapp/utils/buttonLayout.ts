export type ButtonDefinition = { key: string; label: string; full?: boolean };
export type ButtonPreference = {
	key: string;
	width: "auto" | "single" | "double" | number;
};

// Keep disabled actions in preferences so profile toggles never lose their position.
export function normalizeButtonLayout(
	value: unknown,
	defaults: ButtonDefinition[],
): ButtonPreference[] {
	const result: ButtonPreference[] = [];
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (
				!defaults.some((item) => item.key === entry?.key) ||
				result.some((item) => item.key === entry.key)
			)
				continue;
			result.push({
				key: entry.key,
				width:
					["single", "double"].includes(entry.width) ||
					(typeof entry.width === "number" &&
						Number.isFinite(entry.width) &&
						entry.width >= 10 &&
						entry.width <= 100)
						? entry.width
						: "auto",
			});
		}
	}
	for (const item of defaults) {
		if (!result.some((entry) => entry.key === item.key))
			result.push({ key: item.key, width: "auto" });
	}
	return result;
}

export function repositionButton(
	layout: ButtonPreference[],
	key: string,
	target: string,
	after = false,
): ButtonPreference[] {
	const result = layout.map((entry) => ({ ...entry }));
	const from = result.findIndex((entry) => entry.key === key);
	if (
		from < 0 ||
		key === target ||
		!result.some((entry) => entry.key === target)
	)
		return result;
	const [entry] = result.splice(from, 1);
	result.splice(
		result.findIndex((entry) => entry.key === target) + Number(after),
		0,
		entry!,
	);
	return result;
}
