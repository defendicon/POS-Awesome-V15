import { createApp } from "vue";
import vuetify from "./plugins/vuetify";
import "@mdi/font/css/materialdesignicons.css";
import "@fontsource/roboto/100.css";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/900.css";
import Dexie from "dexie/dist/dexie.mjs";
import VueDatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import "../../../posawesome/public/css/rtl.css";
import "../style.css";
import "./styles/theme.css";
import eventBus from "./bus";
import themePlugin from "./plugins/theme.js";
import { pinia } from "./stores/index.js";
import { useToastStore } from "./stores/toastStore.js";
import { useSocketStore } from "./stores/socketStore.js";
import router from "./router/index.js";
import "../sw-updater.js"; // Initialize service worker auto-updater
import Home from "./Home.vue";
import { attachProfilerHelpers, initLongTaskObserver, isPerfEnabled } from "./utils/perf.js";

attachProfilerHelpers();

// Expose Dexie globally for libraries that expect a global Dexie instance
if (typeof window !== "undefined" && !window.Dexie) {
	window.Dexie = Dexie;
}

// Ensure frappe is available
if (typeof frappe === "undefined") {
	console.error("Frappe is not defined");
} else {
	frappe.provide("frappe.PosApp");
}

frappe.PosApp.posapp = class {
	constructor({ parent }) {
		this.$parent = $(document);
		this.page = parent?.page || parent;
		this.make_body();
	}
	make_body() {
		this.$el = this.$parent.find(".main-section");
		// Vuetify instance is now imported from plugins/vuetify.ts
		const app = createApp(Home);
		app.component("VueDatePicker", VueDatePicker);
		app.use(pinia);
		app.use(router);
		app.use(eventBus);
		app.use(vuetify);
		app.use(themePlugin, { vuetify });
		app.mount(this.$el[0]);

		// Initialize socket listeners
		const socketStore = useSocketStore();
		socketStore.init();

		if (isPerfEnabled()) {
			initLongTaskObserver("posapp");
		}

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
				.then((registration) => {
					console.log("SW registered successfully", registration);
				})
				.catch((err) => console.error("SW registration failed", err));
		}
	}
	setup_header() {}
};
