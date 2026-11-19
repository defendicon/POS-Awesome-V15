/** Fractional widths retain legacy card spans while mapping every pointer pixel. */
export const clampLayoutPercent = (value: number, min = 25) =>
	Math.max(min, Math.min(100, value));
export function resizedLayoutPercent(
	start: number,
	delta: number,
	width: number,
	gap: number,
	min = 25,
) {
	return width > 0
		? clampLayoutPercent(start + (delta * 100) / (width + gap), min)
		: start;
}
export function layoutBasis(
	percent: number,
	gap = "var(--workspace-layout-gap)",
) {
	return `calc(${percent}% - ${gap} * ${1 - percent / 100})`;
}
export function layoutPixels(percent: number, width: number, gap: number) {
	return Math.max(0, ((width + gap) * percent) / 100 - gap);
}
