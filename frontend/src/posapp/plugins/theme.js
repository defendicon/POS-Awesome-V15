import { useTheme, setVuetifyInstance } from "../composables/useTheme.js";

export default {
	install(app, { vuetify }) {
		// Set the Vuetify instance for the theme composable
		if (vuetify) {
			setVuetifyInstance(vuetify);
		}

		// Initialize the global theme composable
		const globalTheme = useTheme();

		// Make theme available globally via $theme (backwards compatibility)
		app.config.globalProperties.$theme = globalTheme;

		// Provide theme to all components
		app.provide("theme", globalTheme);
	},
};
