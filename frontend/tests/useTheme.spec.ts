// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

it("uses stylesheet colors while synchronizing explicit, automatic and host themes", async () => {
	let systemDark = false;
	let onSystemChange: () => void = () => {};
	vi.stubGlobal("matchMedia", () => ({
		get matches() {
			return systemDark;
		},
		addEventListener: (_event: string, listener: () => void) => {
			onSystemChange = listener;
		},
	}));
	vi.stubGlobal("requestAnimationFrame", () => 0);
	localStorage.clear();
	const root = document.documentElement;
	root.setAttribute("data-theme", "light");
	const style = document.createElement("style");
	style.textContent =
		':root { --pos-primary: #006d72; } [data-theme="dark"] { --pos-primary: #75d6d0; }';
	document.head.append(style);
	const { useTheme, setVuetifyInstance } = await import(
		"../src/posapp/composables/core/useTheme"
	);
	const vuetify = { theme: { global: { name: { value: "light" } } } };
	setVuetifyInstance(vuetify);
	const theme = useTheme();
	try {
		expect(theme.themeColors.value.primary).toBe("#006d72");
		theme.setTheme("dark");
		expect(theme.themeColors.value.primary).toBe("#75d6d0");
		expect(root.style.getPropertyValue("--pos-primary")).toBe("");
		expect(root.style.colorScheme).toBe("dark");
		expect(vuetify.theme.global.name.value).toBe("dark");
		expect(localStorage.getItem("posawesome_theme_preference")).toBe(
			"dark",
		);

		theme.setTheme("automatic");
		expect(theme.theme.value).toBe("light");
		systemDark = true;
		onSystemChange();
		expect(theme.theme.value).toBe("dark");
		expect(theme.mode.value).toBe("automatic");
		expect(theme.themeColors.value.primary).toBe("#75d6d0");

		theme.setTheme("light");
		onSystemChange();
		expect(theme.theme.value).toBe("light");
		root.setAttribute("data-theme-mode", "dark");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(theme.theme.value).toBe("dark");
		expect(vuetify.theme.global.name.value).toBe("dark");
	} finally {
		theme.setTheme("light");
		style.remove();
		setVuetifyInstance(null);
		vi.unstubAllGlobals();
	}
});
