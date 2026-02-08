import type { App } from "vue";
import {
	useTheme,
	setVuetifyInstance,
	type VuetifyInstance,
} from "../composables/core/useTheme";

export default {
	install(app: App, { vuetify }: { vuetify?: VuetifyInstance } = {}) {
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
