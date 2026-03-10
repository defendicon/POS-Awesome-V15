import { ref, computed, onMounted, onBeforeUnmount } from "vue";

export function useResponsive() {
	const windowWidth = ref(window.innerWidth);
	const windowHeight = ref(window.innerHeight);
	const baseWidth = ref(window.innerWidth);
	const baseHeight = ref(window.innerHeight);

	const widthScale = computed(() => windowWidth.value / baseWidth.value);
	const heightScale = computed(() => windowHeight.value / baseHeight.value);
	const averageScale = computed(
		() => (widthScale.value + heightScale.value) / 2,
	);
	const isCompactViewport = computed(() => windowWidth.value <= 768);
	const isTabletViewport = computed(
		() => windowWidth.value > 768 && windowWidth.value <= 1024,
	);
	const isUltraCompactTerminal = computed(
		() =>
			windowWidth.value > 768 &&
			(windowWidth.value <= 1180 || windowHeight.value <= 720),
	);
	const isLowResTerminal = computed(
		() =>
			windowWidth.value > 768 &&
			!isUltraCompactTerminal.value &&
			(windowWidth.value <= 1366 || windowHeight.value <= 820),
	);

	const dynamicSpacing = computed(() => {
		let baseSpacing;

		if (isCompactViewport.value) {
			baseSpacing = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 };
		} else if (isUltraCompactTerminal.value) {
			baseSpacing = { xs: 3, sm: 6, md: 10, lg: 14, xl: 18 };
		} else if (isLowResTerminal.value || isTabletViewport.value) {
			baseSpacing = { xs: 4, sm: 6, md: 12, lg: 18, xl: 24 };
		} else {
			baseSpacing = {
				xs: 4,
				sm: 8,
				md: 16,
				lg: 24,
				xl: 32,
			};
		}

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
		} else if (isUltraCompactTerminal.value) {
			cardHeightVh = 60;
		} else if (isLowResTerminal.value) {
			cardHeightVh = 62;
		} else {
			cardHeightVh = Math.round(60 * heightScale.value);
		}

		cardHeightVh = Math.max(30, Math.min(cardHeightVh, 70));
		let containerHeightVh = 68;
		if (isCompactViewport.value) {
			containerHeightVh = windowHeight.value <= 700 ? 64 : 72;
		} else if (isTabletViewport.value) {
			containerHeightVh = windowHeight.value <= 800 ? 62 : 68;
		} else if (isUltraCompactTerminal.value) {
			containerHeightVh = windowHeight.value <= 720 ? 78 : 74;
		} else if (isLowResTerminal.value) {
			containerHeightVh = windowHeight.value <= 800 ? 72 : 70;
		} else if (windowHeight.value <= 800) {
			containerHeightVh = 64;
		} else if (windowHeight.value <= 900) {
			containerHeightVh = 66;
		}

		const containerMinHeightPx = isCompactViewport.value
			? 380
			: isTabletViewport.value
				? 440
				: isUltraCompactTerminal.value
					? 420
						: isLowResTerminal.value
							? 460
							: 520;
		const sectionPaddingPx = isCompactViewport.value
			? dynamicSpacing.value.xs
			: isUltraCompactTerminal.value
				? 8
				: isLowResTerminal.value
					? 10
					: dynamicSpacing.value.sm;
		const sectionGapPx = isCompactViewport.value
			? dynamicSpacing.value.xs
			: isUltraCompactTerminal.value
				? 6
				: isLowResTerminal.value
					? 8
					: dynamicSpacing.value.sm;
		const controlHeightPx = isCompactViewport.value
			? 44
			: isUltraCompactTerminal.value
				? 34
				: isLowResTerminal.value
					? 38
					: 44;
		const controlHeightLargePx = isCompactViewport.value
			? 48
			: isUltraCompactTerminal.value
				? 38
				: isLowResTerminal.value
					? 40
					: 48;
		const searchMaxWidthPx = isUltraCompactTerminal.value
			? 220
			: isLowResTerminal.value
				? 260
				: 320;
		const terminalCardRadiusPx = isUltraCompactTerminal.value
			? 14
			: isLowResTerminal.value
				? 16
				: 18;
		const sectionHeadingPadding = isUltraCompactTerminal.value
			? "10px 12px 0"
			: isLowResTerminal.value
				? "12px 14px 0"
				: "14px 16px 0";

		return {
			"--dynamic-xs": `${dynamicSpacing.value.xs}px`,
			"--dynamic-sm": `${dynamicSpacing.value.sm}px`,
			"--dynamic-md": `${dynamicSpacing.value.md}px`,
			"--dynamic-lg": `${dynamicSpacing.value.lg}px`,
			"--dynamic-xl": `${dynamicSpacing.value.xl}px`,
			"--container-height": `${containerHeightVh}vh`,
			"--container-min-height": `${containerMinHeightPx}px`,
			"--card-height": `${cardHeightVh}vh`,
			"--font-scale": averageScale.value.toFixed(2),
			"--terminal-density-scale": isUltraCompactTerminal.value
				? "0.84"
				: isLowResTerminal.value
					? "0.92"
					: "1",
			"--terminal-shell-gap": `${sectionGapPx}px`,
			"--terminal-panel-gap": `${sectionGapPx}px`,
			"--terminal-section-padding": `${sectionPaddingPx}px`,
			"--terminal-inner-padding": `${Math.max(
				4,
				sectionPaddingPx - 2,
			)}px`,
			"--terminal-control-height": `${controlHeightPx}px`,
			"--terminal-control-height-lg": `${controlHeightLargePx}px`,
			"--terminal-card-radius": `${terminalCardRadiusPx}px`,
			"--terminal-search-max-width": `${searchMaxWidthPx}px`,
			"--terminal-section-heading-padding": sectionHeadingPadding,
			"--terminal-title-size": isUltraCompactTerminal.value
				? "0.92rem"
				: isLowResTerminal.value
					? "0.96rem"
					: "1rem",
			"--terminal-body-font-size": isUltraCompactTerminal.value
				? "0.82rem"
				: isLowResTerminal.value
					? "0.88rem"
					: "0.94rem",
			"--terminal-image-size": isUltraCompactTerminal.value
				? "42px"
				: isLowResTerminal.value
					? "46px"
					: "50px",
		};
	});

	let resizeRafId: number | null = null;

	const handleResize = () => {
		// Debounce with requestAnimationFrame for better performance
		if (resizeRafId) {
			cancelAnimationFrame(resizeRafId);
		}

		resizeRafId = requestAnimationFrame(() => {
			windowWidth.value = window.innerWidth;
			windowHeight.value = window.innerHeight;
			resizeRafId = null;
		});
	};

	onMounted(() => {
		handleResize();
		window.addEventListener("resize", handleResize);
	});

	onBeforeUnmount(() => {
		window.removeEventListener("resize", handleResize);
		if (resizeRafId) {
			cancelAnimationFrame(resizeRafId);
			resizeRafId = null;
		}
	});

	return {
		windowWidth,
		windowHeight,
		baseWidth,
		baseHeight,
		widthScale,
		heightScale,
		averageScale,
		isCompactViewport,
		isTabletViewport,
		isLowResTerminal,
		isUltraCompactTerminal,
		dynamicSpacing,
		responsiveStyles,
	};
}
