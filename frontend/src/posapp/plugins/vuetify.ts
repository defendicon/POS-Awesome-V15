import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import "@mdi/font/css/materialdesignicons.css";

const THEME_STORAGE_KEY = "posawesome_theme_preference";

const getSystemTheme = () => {
	if (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
	) {
		return "dark";
	}
	return "light";
};

const normalizeThemeMode = (value: string | null) => {
	return value === "light" || value === "dark" || value === "automatic"
		? value
		: null;
};

const normalizeResolvedTheme = (value: string | null) => {
	return value === "light" || value === "dark" ? value : null;
};

const resolveInitialThemeMode = () => {
	if (typeof document !== "undefined") {
		const domMode = normalizeThemeMode(
			document.documentElement.getAttribute("data-theme-mode"),
		);
		if (domMode) {
			return domMode;
		}

		const domTheme = normalizeResolvedTheme(
			document.documentElement.getAttribute("data-theme"),
		);
		if (domTheme) {
			return domTheme;
		}
	}

	if (typeof localStorage !== "undefined") {
		let storedThemePreference: string | null = null;
		try {
			storedThemePreference = localStorage.getItem(THEME_STORAGE_KEY);
		} catch {
			storedThemePreference = null;
		}
		const storedMode = normalizeThemeMode(storedThemePreference);
		if (storedMode) {
			return storedMode;
		}
	}

	return "automatic";
};

const resolveInitialTheme = () => {
	const mode = resolveInitialThemeMode();
	return mode === "automatic" ? getSystemTheme() : mode;
};

const bootstrapThemeAttributes = () => {
	if (typeof document === "undefined") {
		return;
	}

	const mode = resolveInitialThemeMode();
	const resolvedTheme = mode === "automatic" ? getSystemTheme() : mode;
	const root = document.documentElement;
	root.setAttribute("data-theme", resolvedTheme);
	root.setAttribute("data-theme-mode", mode);
	root.style.setProperty("color-scheme", resolvedTheme);
};

bootstrapThemeAttributes();

const lightTheme = {
	dark: false,
	colors: {
		background: "#F3F7F6",
		surface: "#FFFFFF",
		"surface-variant": "#E7EFED",
		"surface-bright": "#ffffff",
		"surface-light": "#F8FAF9",
		primary: "#006D72",
		"primary-variant": "#00575B",
		secondary: "#0B7A75",
		"secondary-variant": "#075F5B",
		accent: "#C4511B",
		"accent-variant": "#9F3D10",
		success: "#16784A",
		warning: "#A94F08",
		error: "#B3261E",
		info: "#0B67A3",
		outline: "#95A6A2",
		"on-primary": "#ffffff",
		"on-secondary": "#ffffff",
		"on-background": "#172321",
		"on-surface": "#172321",
		"on-surface-variant": "#172321",
		"on-error": "#ffffff",
		"on-warning": "#ffffff",
		"on-info": "#ffffff",
		"on-success": "#ffffff",
	},
};

const darkTheme = {
	dark: true,
	colors: {
		background: "#0D1413",
		surface: "#17201F",
		"surface-variant": "#2B3937",
		"surface-bright": "#1C2826",
		"surface-light": "#131C1B",
		primary: "#75D6D0",
		"primary-variant": "#9BE7E1",
		secondary: "#9BD0CA",
		"secondary-variant": "#B7E2DD",
		accent: "#FFB68F",
		"accent-variant": "#FF8C56",
		success: "#75D6A1",
		warning: "#FFBD79",
		error: "#FFB4AB",
		info: "#9DCCF0",
		outline: "#71817E",
		"on-primary": "#000000",
		"on-secondary": "#000000",
		"on-background": "#EEF5F3",
		"on-surface": "#EEF5F3",
		"on-surface-variant": "#EEF5F3",
		"on-error": "#10201B",
		"on-warning": "#000000",
		"on-info": "#10201B",
		"on-success": "#10201B",
	},
};

export default createVuetify({
	components,
	directives,
	locale: {
		rtl:
			typeof frappe !== "undefined" && frappe.utils
				? frappe.utils.is_rtl()
				: false,
	} as any,
	theme: {
		defaultTheme: resolveInitialTheme(),
		themes: {
			light: lightTheme,
			dark: darkTheme,
		},
	},
});
