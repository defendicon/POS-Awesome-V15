import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import "@mdi/font/css/materialdesignicons.css";

const lightTheme = {
	dark: false,
	colors: {
		background: "#FFFFFF",
		surface: "#FFFFFF",
		"surface-variant": "#f5f5f5",
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
	},
};

const darkTheme = {
	dark: true,
	colors: {
		background: "#121212",
		surface: "#1E1E1E",
		"surface-variant": "#373737",
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
	},
};

export default createVuetify({
	components,
	directives,
	locale: {
		rtl: typeof frappe !== "undefined" && frappe.utils ? frappe.utils.is_rtl() : false,
	},
	theme: {
		defaultTheme: "light",
		themes: {
			light: lightTheme,
			dark: darkTheme,
		},
	},
});
