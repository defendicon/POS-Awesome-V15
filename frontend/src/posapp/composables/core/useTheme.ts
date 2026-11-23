import { ref, computed } from "vue";

type ThemeMode = "light" | "dark" | "automatic";
type ResolvedTheme = "light" | "dark";

export type VuetifyInstance = {
	theme?: {
		global?: {
			name: { value: string };
		};
	};
};

// Global theme state
const isDarkMode = ref(false);
const theme = ref<ResolvedTheme>("light");
const themeMode = ref<ThemeMode>("automatic");

// Theme preference storage key
const THEME_STORAGE_KEY = "posawesome_theme_preference";

// Global Vuetify instance reference (set during app initialization)
let vuetifyInstance: VuetifyInstance | null = null;
let initialized = false;
let domObserver: MutationObserver | null = null;
let mediaQueryListenerAttached = false;

/**
 * Set the global Vuetify instance (called from the theme plugin)
 */
export function setVuetifyInstance(vuetify: VuetifyInstance | null) {
	vuetifyInstance = vuetify;
}

/**
 * Global theme composable for POSAwesome
 * Provides centralized dark mode management across all components
 */
export function useTheme() {
	const normalizeTheme = (value: string | null): ThemeMode | null => {
		if (value === "light" || value === "dark" || value === "automatic") {
			return value;
		}
		return null;
	};

	const normalizeResolvedTheme = (
		value: string | null,
	): ResolvedTheme | null => {
		if (value === "light" || value === "dark") {
			return value;
		}
		return null;
	};

	// Initialize theme from DOM or localStorage
	const initializeTheme = () => {
		const root = document.documentElement;
		const domTheme = normalizeTheme(root.getAttribute("data-theme-mode"));
		const domResolvedTheme = normalizeResolvedTheme(
			root.getAttribute("data-theme"),
		);

		if (domTheme) {
			setTheme(domTheme);
			return;
		}

		if (domResolvedTheme) {
			setTheme(domResolvedTheme);
		} else {
			// Fallback to localStorage or system preference
			const savedTheme = normalizeTheme(
				localStorage.getItem(THEME_STORAGE_KEY),
			);
			if (savedTheme) {
				setTheme(savedTheme);
			} else {
				setTheme("automatic");
			}
		}
	};

	// Get system theme preference
	const getSystemTheme = (): ResolvedTheme => {
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	};

	// Set theme and update all systems
	const setTheme = (newTheme: ThemeMode) => {
		const resolvedTheme =
			newTheme === "automatic" ? getSystemTheme() : newTheme;

		themeMode.value = newTheme;
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
		root.style.setProperty("color-scheme", resolvedTheme);

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

	// Minimal style refresh - remove heavy DOM manipulation
	const forceStyleRefresh = () => {
		// Minimal reflow trigger
		const root = document.documentElement;
		requestAnimationFrame(() => {
			root.offsetHeight; // Single reflow trigger
		});
	};

	// Sync theme with Frappe system
	const syncWithFrappe = (themeName: ThemeMode) => {
		// Update Frappe UI if available
		if (window.frappe?.ui?.set_theme) {
			window.frappe.ui.set_theme(themeName);
		}

		// Save to user preferences via API
		if (window.frappe?.xcall) {
			window.frappe
				.xcall("frappe.core.doctype.user.user.switch_theme", {
					theme:
						themeName.charAt(0).toUpperCase() + themeName.slice(1),
				})
				.catch(() => {
					// Ignore API errors - theme still works locally
				});
		}
	};

	// Listen for system theme changes
	const setupSystemThemeWatcher = () => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		if (mediaQueryListenerAttached) {
			return;
		}
		mediaQuery.addEventListener("change", () => {
			if (themeMode.value === "automatic") {
				setTheme("automatic");
			}
		});
		mediaQueryListenerAttached = true;
	};

	// Watch for DOM attribute changes (compatibility with existing theme plugin)
	const setupDOMWatcher = () => {
		if (domObserver) {
			return domObserver;
		}

		domObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === "attributes") {
					const root = document.documentElement;
					const newTheme = normalizeTheme(
						root.getAttribute("data-theme-mode"),
					);
					const resolvedTheme = normalizeResolvedTheme(
						root.getAttribute("data-theme"),
					);

					if (newTheme && newTheme !== themeMode.value) {
						setTheme(newTheme);
						return;
					}

					if (
						resolvedTheme &&
						!newTheme &&
						resolvedTheme !== theme.value
					) {
						themeMode.value = resolvedTheme;
						theme.value = resolvedTheme;
						isDarkMode.value = resolvedTheme === "dark";
						root.style.setProperty("color-scheme", resolvedTheme);
					}
				}
			});
		});

		domObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "data-theme-mode"],
		});

		return domObserver;
	};

	// Computed properties for common theme values
	// CSS owns the palette for both initial render and subsequent theme switches.
	// Keep this compatibility API reactive without introducing another color table.
	const themeColors = computed(() => {
		void theme.value;
		const styles = getComputedStyle(document.documentElement);
		const color = (token: string) => styles.getPropertyValue(token).trim();
		return {
			background: color("--pos-bg-primary"),
			surface: color("--pos-surface"),
			surfaceVariant: color("--pos-surface-variant"),
			primary: color("--pos-primary"),
			textPrimary: color("--pos-text-primary"),
			textSecondary: color("--pos-text-secondary"),
			border: color("--pos-border"),
			cardBackground: color("--pos-card-bg"),
		};
	});

	// Initialize theme on first use
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
		mode: computed(() => themeMode.value),
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
