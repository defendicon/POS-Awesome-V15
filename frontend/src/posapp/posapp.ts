import { createApp } from "vue";
// @ts-ignore
import vuetify from "./plugins/vuetify";
import "@mdi/font/css/materialdesignicons.css";
import "@fontsource/roboto/100.css";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/900.css";
// @ts-ignore
import Dexie from "dexie/dist/dexie.mjs";
import VueDatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import "../../../posawesome/public/css/rtl.css";
import "../style.css";
import "./styles/theme.css";
import eventBus from "./bus";
import themePlugin from "./plugins/theme";
import { pinia } from "./stores";
import { useToastStore } from "./stores/toastStore";
import { useSocketStore } from "./stores/socketStore";
import { createPosAppRouter } from "./router";
import "../sw-updater.js"; // Initialize service worker auto-updater
import App from "./App.vue";
// @ts-ignore
import {
	attachProfilerHelpers,
	initLongTaskObserver,
	isPerfEnabled,
} from "./utils/perf.js";

attachProfilerHelpers();

// Suppress known benign error from Frappe's shortcut.js (vendor)
// This error occurs because POS view might not have the expected breadcrumb structure
if (typeof window !== "undefined") {
	window.addEventListener("error", (event) => {
		if (
			event.message &&
			(event.message.includes("remove_last_divider") ||
				(event.message.includes("offsetWidth") &&
					event.filename &&
					event.filename.includes("shortcut.js")))
		) {
			event.preventDefault();
			console.warn("Suppressed known benign error in shortcut.js");
			return true;
		}
	});
}

// Expose Dexie globally for libraries that expect a global Dexie instance
if (typeof window !== "undefined" && !(window as any).Dexie) {
	(window as any).Dexie = Dexie;
}

// Ensure frappe is available
if (typeof frappe === "undefined") {
	console.error("Frappe is not defined");
} else {
	frappe.provide("frappe.PosApp");
}

frappe.PosApp.posapp = class {
	$parent: any;
	page: any;
	app: any;
	router: any;
	routerHistory: any;
	$el: any;

	constructor({ parent }: { parent: any }) {
		this.$parent = $(document);
		this.page = parent?.page || parent;
		this.app = null;
		this.make_body();
	}

	make_body() {
		this.$el = this.$parent.find(".main-section");
		// Vuetify instance is now imported from plugins/vuetify.ts
		this.app = createApp(App);
		const { router, history } = createPosAppRouter();
		this.router = router;
		this.routerHistory = history;
		this.app.component("VueDatePicker", VueDatePicker);
		this.app.use(pinia);
		this.app.use(this.router);
		this.app.use(eventBus);
		this.app.use(vuetify);
		this.app.use(themePlugin, { vuetify });

		// Global Error Handler
		this.app.config.errorHandler = (
			err: any,
			instance: any,
			info: string,
		) => {
			console.error("Global Error:", err, info);
			const toastStore = useToastStore();
			toastStore.show({
				message: `An unexpected error occurred: ${err.message || err}`,
				color: "error",
				timeout: 5000,
			});
		};

		this.app.mount(this.$el[0]);

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
			("serviceWorker" in navigator &&
				window.location.protocol === "https:") ||
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

	unmount() {
		if (this.app) {
			// Clean up router to prevent global navigation interference
			if (this.router) {
				// Remove all route guards and listeners
				this.router.beforeEachCbs = [];
				this.router.afterEachCbs = [];
			}

			if (
				this.routerHistory &&
				typeof this.routerHistory.destroy === "function"
			) {
				this.routerHistory.destroy();
			} else if (
				this.router &&
				this.router.options &&
				this.router.options.history &&
				typeof this.router.options.history.destroy === "function"
			) {
				this.router.options.history.destroy();
			}

			this.app.unmount();
			this.app = null;
			this.router = null;
			this.routerHistory = null;
			console.info("POS App unmounted");
		}
	}

	setup_header() {}
};
