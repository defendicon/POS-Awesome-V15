import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import "@mdi/font/css/materialdesignicons.css";
import { darkPalette, lightPalette } from "../config/brandPalette";

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
	colors: { ...lightPalette },
};

const darkTheme = {
	dark: true,
	colors: { ...darkPalette },
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
