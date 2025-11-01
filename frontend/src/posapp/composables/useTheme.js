import { ref, computed } from "vue";

// Global theme state
const isDarkMode = ref(false);
const theme = ref("light");

// Theme preference storage key
const THEME_STORAGE_KEY = "posawesome_theme_preference";

// Global Vuetify instance reference (set during app initialization)
let vuetifyInstance = null;

/**
 * Set the global Vuetify instance (called from the theme plugin)
 */
export function setVuetifyInstance(vuetify) {
	vuetifyInstance = vuetify;
}

/**
 * Global theme composable for POSAwesome
 * Provides centralized dark mode management across all components
 */
export function useTheme() {
	// Initialize theme from DOM or localStorage
	const initializeTheme = () => {
		const root = document.documentElement;
		const domTheme = root.getAttribute("data-theme-mode") || root.getAttribute("data-theme");

		if (domTheme) {
			setTheme(domTheme === "automatic" ? getSystemTheme() : domTheme);
		} else {
			// Fallback to localStorage or system preference
			const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
			if (savedTheme) {
				setTheme(savedTheme);
			} else {
				setTheme(getSystemTheme());
			}
		}
	};

	// Get system theme preference
	const getSystemTheme = () => {
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	};

	// Set theme and update all systems
	const setTheme = (newTheme) => {
		const resolvedTheme = newTheme === "automatic" ? getSystemTheme() : newTheme;

		theme.value = resolvedTheme;
		isDarkMode.value = resolvedTheme === "dark";

		// Update Vuetify theme if available
		if (vuetifyInstance?.theme?.global) {
			vuetifyInstance.theme.global.name.value = resolvedTheme;
		}

		// Update DOM attributes
		const root = document.documentElement;
		root.setAttribute("data-theme", resolvedTheme);
		root.setAttribute("data-theme-mode", newTheme);

		// Update CSS custom properties for immediate effect
		updateCSSProperties(resolvedTheme);

		// Force immediate DOM update to prevent caching lag
		forceStyleRefresh();

		// Save preference
		localStorage.setItem(THEME_STORAGE_KEY, newTheme);

		// Sync with Frappe if available
		syncWithFrappe(newTheme);
	};

	// Toggle between light and dark themes
	const toggleTheme = () => {
		const newTheme = isDarkMode.value ? "light" : "dark";
		setTheme(newTheme);
	};

	// Update CSS custom properties for immediate theme changes
	const updateCSSProperties = (themeName) => {
		const root = document.documentElement;

		if (themeName === "dark") {
			// Dark theme CSS custom properties
			root.style.setProperty("--pos-bg-primary", "#121212");
			root.style.setProperty("--pos-bg-secondary", "#1E1E1E");
			root.style.setProperty("--pos-bg-tertiary", "#2d2d2d");
			root.style.setProperty("--pos-surface", "#1E1E1E");
			root.style.setProperty("--pos-surface-variant", "#373737");

			root.style.setProperty("--pos-text-primary", "#ffffff");
			root.style.setProperty("--pos-text-secondary", "#e0e0e0");
			root.style.setProperty("--pos-text-disabled", "#9e9e9e");

			root.style.setProperty("--pos-primary", "#00D4FF");
			root.style.setProperty("--pos-primary-variant", "#00A0CC");
			root.style.setProperty("--pos-secondary", "#00E5B8");

			root.style.setProperty("--pos-border", "rgba(255, 255, 255, 0.12)");
			root.style.setProperty("--pos-divider", "#373737");
			root.style.setProperty("--pos-shadow", "rgba(0, 0, 0, 0.4)");

			root.style.setProperty("--pos-card-bg", "#1E1E1E");
			root.style.setProperty("--pos-input-bg", "#2d2d2d");
			root.style.setProperty("--pos-hover-bg", "rgba(255, 255, 255, 0.12)");
		} else {
			// Light theme CSS custom properties
			root.style.setProperty("--pos-bg-primary", "#ffffff");
			root.style.setProperty("--pos-bg-secondary", "#f8f9fa");
			root.style.setProperty("--pos-bg-tertiary", "#e3f2fd");
			root.style.setProperty("--pos-surface", "#ffffff");
			root.style.setProperty("--pos-surface-variant", "#f5f5f5");

			root.style.setProperty("--pos-text-primary", "#212121");
			root.style.setProperty("--pos-text-secondary", "#666666");
			root.style.setProperty("--pos-text-disabled", "#9e9e9e");

			root.style.setProperty("--pos-primary", "#0097A7");
			root.style.setProperty("--pos-primary-variant", "#00838F");
			root.style.setProperty("--pos-secondary", "#00BCD4");

			root.style.setProperty("--pos-border", "rgba(0, 0, 0, 0.12)");
			root.style.setProperty("--pos-divider", "rgba(0, 0, 0, 0.06)");
			root.style.setProperty("--pos-shadow", "rgba(0, 0, 0, 0.1)");

			root.style.setProperty("--pos-card-bg", "#ffffff");
			root.style.setProperty("--pos-input-bg", "#f5f5f5");
			root.style.setProperty("--pos-hover-bg", "rgba(25, 118, 210, 0.04)");
		}

		// Minimal DOM recalculation
		requestAnimationFrame(() => {
			root.offsetHeight;
		});
	};

	// Minimal style refresh - remove heavy DOM manipulation
	const forceStyleRefresh = () => {
		// Minimal reflow trigger
		const root = document.documentElement;
		requestAnimationFrame(() => {
			root.offsetHeight; // Single reflow trigger
		});
	};

	// Sync theme with Frappe system
	const syncWithFrappe = (themeName) => {
		// Update Frappe UI if available
		if (window.frappe?.ui?.set_theme) {
			window.frappe.ui.set_theme(themeName);
		}

		// Save to user preferences via API
		if (window.frappe?.xcall) {
			window.frappe
				.xcall("frappe.core.doctype.user.user.switch_theme", {
					theme: themeName.charAt(0).toUpperCase() + themeName.slice(1),
				})
				.catch(() => {
					// Ignore API errors - theme still works locally
				});
		}
	};

	// Listen for system theme changes
	const setupSystemThemeWatcher = () => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", () => {
			const currentMode = document.documentElement.getAttribute("data-theme-mode");
			if (currentMode === "automatic") {
				setTheme("automatic");
			}
		});
	};

	// Watch for DOM attribute changes (compatibility with existing theme plugin)
	const setupDOMWatcher = () => {
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === "attributes") {
					const root = document.documentElement;
					const newTheme = root.getAttribute("data-theme-mode") || root.getAttribute("data-theme");

					if (newTheme && newTheme !== theme.value) {
						const resolvedTheme = newTheme === "automatic" ? getSystemTheme() : newTheme;

						if (resolvedTheme !== theme.value) {
							theme.value = resolvedTheme;
							isDarkMode.value = resolvedTheme === "dark";
							updateCSSProperties(resolvedTheme);
						}
					}
				}
			});
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "data-theme-mode"],
		});

		return observer;
	};

	// Computed properties for common theme values
	const themeColors = computed(() => {
		return {
			background: isDarkMode.value ? "#121212" : "#ffffff",
			surface: isDarkMode.value ? "#1E1E1E" : "#ffffff",
			surfaceVariant: isDarkMode.value ? "#2d2d2d" : "#f5f5f5",
			primary: isDarkMode.value ? "#00D4FF" : "#0097A7",
			textPrimary: isDarkMode.value ? "#ffffff" : "#212121",
			textSecondary: isDarkMode.value ? "#e0e0e0" : "#666666",
			border: isDarkMode.value ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)",
			cardBackground: isDarkMode.value ? "#1E1E1E" : "#ffffff",
		};
	});

	// Initialize theme on first use
	let initialized = false;
	if (!initialized) {
		initializeTheme();
		setupSystemThemeWatcher();
		setupDOMWatcher();
		initialized = true;
	}

	return {
		// State
		isDark: computed(() => isDarkMode.value),
		theme: computed(() => theme.value),
		themeColors,

		// Methods
		toggleTheme,
		setTheme,

		// For backwards compatibility
		current: computed(() => theme.value),
		toggle: toggleTheme,
	};
}

// Export singleton instance for direct usage
const globalTheme = useTheme();
export default globalTheme;
