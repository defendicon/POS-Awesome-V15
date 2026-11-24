export const POS_UI_TEMPLATE_CLASSIC = "Classic";
export const POS_UI_TEMPLATE_COUNTER_GRID = "POS Awesome Counter Grid";
export const POS_UI_TEMPLATE_RETAIL = "POS Awesome Retail";
export const LEGACY_POS_UI_TEMPLATE_COUNTER_GRID = "RetailMind Counter Grid";
export const COUNTER_GRID_MIN_WIDTH = 1024;
/**
 * The Retail layout is a two-pane desktop layout; below this width the Classic
 * screen switches to its compact tablet mode, so Retail falls back to it.
 */
export const RETAIL_MIN_WIDTH = 1100;

export type PosUiTemplate =
	| typeof POS_UI_TEMPLATE_CLASSIC
	| typeof POS_UI_TEMPLATE_COUNTER_GRID
	| typeof POS_UI_TEMPLATE_RETAIL;

export type PosUiTemplateResolution = {
	configuredTemplate: PosUiTemplate;
	effectiveTemplate: PosUiTemplate;
	fallbackReason: "viewport" | null;
};

export function normalizePosUiTemplate(value: unknown): PosUiTemplate {
	const normalizedValue = String(value || "").trim();
	if (
		normalizedValue === POS_UI_TEMPLATE_COUNTER_GRID ||
		normalizedValue === LEGACY_POS_UI_TEMPLATE_COUNTER_GRID
	) {
		return POS_UI_TEMPLATE_COUNTER_GRID;
	}
	if (normalizedValue === POS_UI_TEMPLATE_RETAIL) {
		return POS_UI_TEMPLATE_RETAIL;
	}
	return POS_UI_TEMPLATE_CLASSIC;
}

export function resolvePosUiTemplate(
	profile: { posa_ui_template?: unknown } | null | undefined,
	viewportWidth: number,
): PosUiTemplateResolution {
	const configuredTemplate = normalizePosUiTemplate(
		profile?.posa_ui_template,
	);
	const minWidth =
		configuredTemplate === POS_UI_TEMPLATE_COUNTER_GRID
			? COUNTER_GRID_MIN_WIDTH
			: configuredTemplate === POS_UI_TEMPLATE_RETAIL
				? RETAIL_MIN_WIDTH
				: 0;
	const hasDesktopViewport =
		Number.isFinite(viewportWidth) && viewportWidth >= minWidth;
	const fallbackReason =
		minWidth > 0 && !hasDesktopViewport ? "viewport" : null;

	return {
		configuredTemplate,
		effectiveTemplate: fallbackReason
			? POS_UI_TEMPLATE_CLASSIC
			: configuredTemplate,
		fallbackReason,
	};
}

export function isCounterGridTemplate(
	profile: { posa_ui_template?: unknown } | null | undefined,
	viewportWidth: number,
): boolean {
	return (
		resolvePosUiTemplate(profile, viewportWidth).effectiveTemplate ===
		POS_UI_TEMPLATE_COUNTER_GRID
	);
}

export function isRetailTemplate(
	profile: { posa_ui_template?: unknown } | null | undefined,
	viewportWidth: number,
): boolean {
	return (
		resolvePosUiTemplate(profile, viewportWidth).effectiveTemplate ===
		POS_UI_TEMPLATE_RETAIL
	);
}
