/**
 * Nornux brand palette — single source of truth for POS colours.
 *
 * Used by the Vuetify theme (plugins/vuetify.ts) and by the runtime CSS
 * variable updates (composables/core/useTheme.ts). styles/theme.css mirrors
 * these values for the first paint before scripts run.
 *
 * Brand: ink #050708 + Nornux orange #F78F1E (sampled from the logo).
 * Light mode uses ink as the structural "primary" (orange on white is too
 * low-contrast for text) and orange for calls to action. Dark mode uses
 * orange as primary on near-black.
 */

export const BRAND = {
	ink: "#050708",
	inkSoft: "#15181C",
	orange: "#F78F1E",
	orangeDeep: "#D9740A",
	orangeSoft: "#FEF1E1",
} as const;

export const lightPalette = {
	background: "#F4F3F0",
	surface: "#FFFFFF",
	"surface-variant": "#F1EFEB",
	"surface-bright": "#FFFFFF",
	"surface-light": "#F8F7F4",
	primary: BRAND.inkSoft,
	"primary-variant": BRAND.ink,
	secondary: BRAND.orange,
	"secondary-variant": BRAND.orangeDeep,
	accent: BRAND.orange,
	"accent-variant": BRAND.orangeDeep,
	success: "#1E9E5A",
	warning: "#E39A13",
	error: "#D64545",
	info: "#2F6FDB",
	outline: "rgba(14, 16, 19, 0.16)",
	"on-primary": "#FFFFFF",
	"on-secondary": BRAND.ink,
	"on-accent": BRAND.ink,
	"on-background": "#14171A",
	"on-surface": "#14171A",
	"on-surface-variant": "#14171A",
	"on-error": "#FFFFFF",
	"on-warning": BRAND.ink,
	"on-info": "#FFFFFF",
	"on-success": "#FFFFFF",
};

export const darkPalette = {
	background: "#0B0C0E",
	surface: "#15171A",
	"surface-variant": "#22252A",
	"surface-bright": "#1C1F23",
	"surface-light": "#181A1E",
	primary: BRAND.orange,
	"primary-variant": BRAND.orangeDeep,
	secondary: "#FFB25E",
	"secondary-variant": BRAND.orange,
	accent: BRAND.orange,
	"accent-variant": BRAND.orangeDeep,
	success: "#3CC47C",
	warning: "#F2B33D",
	error: "#EF6A6A",
	info: "#6A9BF0",
	outline: "rgba(255, 255, 255, 0.18)",
	"on-primary": BRAND.ink,
	"on-secondary": BRAND.ink,
	"on-accent": BRAND.ink,
	"on-background": "#F4F3F0",
	"on-surface": "#F4F3F0",
	"on-surface-variant": "#F4F3F0",
	"on-error": BRAND.ink,
	"on-warning": BRAND.ink,
	"on-info": BRAND.ink,
	"on-success": BRAND.ink,
};

/** CSS custom properties applied at runtime when the theme switches. */
export const cssVariables = {
	light: {
		"--pos-bg-primary": "#F4F3F0",
		"--pos-bg-secondary": "#F8F7F4",
		"--pos-bg-tertiary": BRAND.orangeSoft,
		"--pos-surface": "#FFFFFF",
		"--pos-surface-variant": "#F1EFEB",
		"--pos-text-primary": "#14171A",
		"--pos-text-secondary": "#4B5058",
		"--pos-text-disabled": "#A3A7AE",
		"--pos-text-muted": "#6B7079",
		"--pos-primary": BRAND.inkSoft,
		"--pos-primary-variant": BRAND.ink,
		"--pos-secondary": BRAND.orange,
		"--pos-accent": BRAND.orange,
		"--pos-border": "rgba(14, 16, 19, 0.10)",
		"--pos-divider": "rgba(14, 16, 19, 0.07)",
		"--pos-shadow": "rgba(14, 16, 19, 0.08)",
		"--pos-card-bg": "#FFFFFF",
		"--pos-input-bg": "#F6F5F2",
		"--pos-tooltip-bg": "#FFFFFF",
		"--pos-tooltip-border": "rgba(14, 16, 19, 0.12)",
		"--pos-tooltip-shadow": "rgba(14, 16, 19, 0.14)",
		"--pos-hover-bg": "rgba(247, 143, 30, 0.08)",
		"color-scheme": "light",
	},
	dark: {
		"--pos-bg-primary": "#0B0C0E",
		"--pos-bg-secondary": "#15171A",
		"--pos-bg-tertiary": "#2A1E10",
		"--pos-surface": "#15171A",
		"--pos-surface-variant": "#22252A",
		"--pos-text-primary": "#F4F3F0",
		"--pos-text-secondary": "#C9CCD1",
		"--pos-text-disabled": "#6E737B",
		"--pos-text-muted": "#9AA0A8",
		"--pos-primary": BRAND.orange,
		"--pos-primary-variant": BRAND.orangeDeep,
		"--pos-secondary": "#FFB25E",
		"--pos-accent": BRAND.orange,
		"--pos-border": "rgba(255, 255, 255, 0.10)",
		"--pos-divider": "rgba(255, 255, 255, 0.07)",
		"--pos-shadow": "rgba(0, 0, 0, 0.45)",
		"--pos-card-bg": "#15171A",
		"--pos-input-bg": "#1C1F23",
		"--pos-tooltip-bg": "#1C1F23",
		"--pos-tooltip-border": "rgba(255, 255, 255, 0.14)",
		"--pos-tooltip-shadow": "rgba(0, 0, 0, 0.45)",
		"--pos-hover-bg": "rgba(247, 143, 30, 0.12)",
		"color-scheme": "dark",
	},
} as const;
