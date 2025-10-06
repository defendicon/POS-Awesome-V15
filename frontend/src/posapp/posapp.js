import { createVuetify } from "vuetify";
import { createApp } from "vue";
import Dexie from "dexie/dist/dexie.mjs";
import VueDatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import "../../../posawesome/public/css/rtl.css";
import "../style.css";
import eventBus from "./bus";
import themePlugin from "./plugins/theme.js";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import Home from "./Home.vue";

// Expose Dexie globally for libraries that expect a global Dexie instance
if (typeof window !== "undefined" && !window.Dexie) {
	window.Dexie = Dexie;
}

frappe.provide("frappe.PosApp");

frappe.PosApp.posapp = class {
	constructor({ parent }) {
		this.$parent = $(document);
		this.page = parent.page;
		this.make_body();
	}
	make_body() {
		this.$el = this.$parent.find(".main-section");
		const vuetify = createVuetify({
			components,
			directives,
			locale: {
				rtl: frappe.utils.is_rtl(),
			},
			theme: {
				defaultTheme: "light",
				themes: {
					light: {
						colors: {
							background: "#FFFFFF",
							primary: "#0097A7",
							secondary: "#00BCD4",
							accent: "#9575CD",
							success: "#66BB6A",
							info: "#2196F3",
							warning: "#FF9800",
							error: "#E86674",
							orange: "#E65100",
							golden: "#A68C59",
							badge: "#F5528C",
							customPrimary: "#085294",
						},
					},
					dark: {
						dark: true,
						colors: {
							background: "#121212",
							surface: "#1E1E1E",
							primary: "#BB86FC",
							primaryVariant: "#985EFF",
							secondary: "#03DAC6",
							accent: "#9575CD",
							success: "#66BB6A",
							info: "#2196F3",
							warning: "#FF9800",
							error: "#CF6679",
							orange: "#FF6F00",
							golden: "#A68C59",
							badge: "#F5528C",
							customPrimary: "#4FC3F7",
							onBackground: "#FFFFFF",
							onSurface: "#FFFFFF",
							divider: "#373737",
						},
					},
				},
			},
		});
		const app = createApp(Home);
		app.component("VueDatePicker", VueDatePicker);
		app.use(eventBus);
		app.use(vuetify);
		app.use(themePlugin, { vuetify });
		app.mount(this.$el[0]);

		if (!document.querySelector('link[rel="manifest"]')) {
			const link = document.createElement("link");
			link.rel = "manifest";
			link.href = "/manifest.json";
			document.head.appendChild(link);
		}

		if (
			("serviceWorker" in navigator && window.location.protocol === "https:") ||
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1"
		) {
			navigator.serviceWorker
				.register("/sw.js")
				.catch((err) => console.error("SW registration failed", err));
		}
	}
	setup_header() { }
};
