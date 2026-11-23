export const POS_APP_ID = "posawesome";
export const POS_BRAND_NAME = "Nornux POS";
export const POS_BRAND_SHORT_NAME = "Nornux";

export type PosBrandingProfile = {
	posa_enable_custom_branding?: unknown;
	posa_brand_name?: unknown;
	posa_brand_short_name?: unknown;
	posa_brand_logo?: unknown;
} | null | undefined;

const isEnabled = (value: unknown) =>
	value === true || value === 1 || value === "1" || value === "true";

const cleanBrandValue = (value: unknown) =>
	typeof value === "string" ? value.trim() : "";

export function isCustomBrandingEnabled(profile: PosBrandingProfile) {
	return isEnabled(profile?.posa_enable_custom_branding);
}

export function resolvePosBranding(profile: PosBrandingProfile) {
	if (!isEnabled(profile?.posa_enable_custom_branding)) {
		return {
			name: POS_BRAND_NAME,
			shortName: POS_BRAND_SHORT_NAME,
			logo: "",
		};
	}

	return {
		name: cleanBrandValue(profile?.posa_brand_name) || POS_BRAND_NAME,
		shortName:
			cleanBrandValue(profile?.posa_brand_short_name) || POS_BRAND_SHORT_NAME,
		logo: cleanBrandValue(profile?.posa_brand_logo),
	};
}

export function getPosAppDisplayName(appName: string) {
	return appName === POS_APP_ID ? POS_BRAND_NAME : appName;
}
