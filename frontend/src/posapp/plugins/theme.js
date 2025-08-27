import { ref } from "vue";

export default {
	install(app, { vuetify }) {
		const root = document.documentElement;

		const getEffectiveTheme = () => {
			const mode = root.getAttribute("data-theme-mode") || "light";
			if (mode === "automatic") {
				return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			}
			return mode;
		};

		const current = ref(getEffectiveTheme());
		vuetify.theme.global.name.value = current.value;

		const observer = new MutationObserver(() => {
			current.value = getEffectiveTheme();
			vuetify.theme.global.name.value = current.value;
		});
		observer.observe(root, { attributes: true, attributeFilter: ["data-theme-mode", "data-theme"] });

		const toggle = () => {
			const mode = root.getAttribute("data-theme-mode") || "light";
			const newMode = mode === "dark" ? "light" : "dark";
			root.setAttribute("data-theme-mode", newMode);
			if (window.frappe?.ui?.set_theme) {
				window.frappe.ui.set_theme(newMode);
			} else {
				root.setAttribute("data-theme", newMode);
			}

			if (window.frappe?.xcall) {
				window.frappe
					.xcall("frappe.core.doctype.user.user.switch_theme", {
						theme: newMode.charAt(0).toUpperCase() + newMode.slice(1),
					})
					.catch(() => {
						/* ignore */
					});
			}
		};

		app.config.globalProperties.$theme = {
			get current() {
				return current.value;
			},
			toggle,
			isDark: current,
		};
	},
};
