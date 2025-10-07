import { ref, computed, onMounted, onBeforeUnmount } from "vue";

export function useResponsive() {
	const windowWidth = ref(window.innerWidth);
	const windowHeight = ref(window.innerHeight);
	const baseWidth = ref(window.innerWidth);
	const baseHeight = ref(window.innerHeight);

	const widthScale = computed(() => windowWidth.value / baseWidth.value);
	const heightScale = computed(() => windowHeight.value / baseHeight.value);
	const averageScale = computed(() => (widthScale.value + heightScale.value) / 2);

	const dynamicSpacing = computed(() => {
		const baseSpacing = {
			xs: 4,
			sm: 8,
			md: 16,
			lg: 24,
			xl: 32,
		};

		return {
			xs: Math.max(2, Math.round(baseSpacing.xs * averageScale.value)),
			sm: Math.max(4, Math.round(baseSpacing.sm * averageScale.value)),
			md: Math.max(8, Math.round(baseSpacing.md * averageScale.value)),
			lg: Math.max(12, Math.round(baseSpacing.lg * averageScale.value)),
			xl: Math.max(16, Math.round(baseSpacing.xl * averageScale.value)),
		};
	});

	const responsiveStyles = computed(() => {
		let cardHeightVh;
		if (windowWidth.value <= 480) {
			cardHeightVh = Math.round(45 * heightScale.value);
		} else if (windowWidth.value <= 768) {
			cardHeightVh = Math.round(55 * heightScale.value);
		} else {
			cardHeightVh = Math.round(60 * heightScale.value);
		}

		cardHeightVh = Math.max(30, Math.min(cardHeightVh, 70));

		return {
			"--dynamic-xs": `${dynamicSpacing.value.xs}px`,
			"--dynamic-sm": `${dynamicSpacing.value.sm}px`,
			"--dynamic-md": `${dynamicSpacing.value.md}px`,
			"--dynamic-lg": `${dynamicSpacing.value.lg}px`,
			"--dynamic-xl": `${dynamicSpacing.value.xl}px`,
			"--container-height": `${Math.round(68 * heightScale.value)}vh`,
			"--card-height": `${cardHeightVh}vh`,
			"--font-scale": averageScale.value.toFixed(2),
		};
	});

	const handleResize = () => {
		windowWidth.value = window.innerWidth;
		windowHeight.value = window.innerHeight;
	};

	onMounted(() => {
		handleResize();
		window.addEventListener("resize", handleResize);
	});

	onBeforeUnmount(() => {
		window.removeEventListener("resize", handleResize);
	});

	return {
		windowWidth,
		windowHeight,
		baseWidth,
		baseHeight,
		widthScale,
		heightScale,
		averageScale,
		dynamicSpacing,
		responsiveStyles,
	};
}
