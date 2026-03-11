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
		background: "#FFFFFF",
		surface: "#FFFFFF",
		"surface-variant": "#f5f5f5",
		"surface-bright": "#ffffff",
		"surface-light": "#fafafa",
		primary: "#0097a7",
		"primary-variant": "#00838f",
		secondary: "#00bcd4",
		"secondary-variant": "#0097a7",
		accent: "#ff6b35",
		"accent-variant": "#e55a2b",
		success: "#66bb6a",
		warning: "#ff9800",
		error: "#e86674",
		info: "#2196f3",
		outline: "rgba(0, 0, 0, 0.2)",
		"on-primary": "#ffffff",
		"on-secondary": "#ffffff",
		"on-background": "#212121",
		"on-surface": "#212121",
		"on-surface-variant": "#212121",
		"on-error": "#ffffff",
		"on-warning": "#212121",
		"on-info": "#ffffff",
		"on-success": "#ffffff",
	},
};

const darkTheme = {
	dark: true,
	colors: {
		background: "#121212",
		surface: "#1E1E1E",
		"surface-variant": "#373737",
		"surface-bright": "#242b33",
		"surface-light": "#1a2028",
		primary: "#00D4FF",
		"primary-variant": "#00A0CC",
		secondary: "#00E5B8",
		"secondary-variant": "#00b894",
		accent: "#ff6b35",
		"accent-variant": "#e55a2b",
		success: "#4caf50",
		warning: "#ffc107",
		error: "#f44336",
		info: "#2196f3",
		outline: "rgba(255, 255, 255, 0.2)",
		"on-primary": "#000000",
		"on-secondary": "#000000",
		"on-background": "#ffffff",
		"on-surface": "#ffffff",
		"on-surface-variant": "#ffffff",
		"on-error": "#ffffff",
		"on-warning": "#000000",
		"on-info": "#ffffff",
		"on-success": "#ffffff",
	},
};

export default createVuetify({
	components,
	directives,
	locale: {
		rtl: typeof frappe !== "undefined" && frappe.utils ? frappe.utils.is_rtl() : false,
	},
	theme: {
		defaultTheme: resolveInitialTheme(),
		themes: {
			light: lightTheme,
			dark: darkTheme,
		},
	},
});
