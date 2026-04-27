export const resolveBooleanSetting = (value: unknown): boolean => {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "1" || normalized === "true" || normalized === "yes";
	}
	if (typeof value === "number") {
		return value === 1;
	}
	return Boolean(value);
};
