import { computed, type CSSProperties, type Ref } from "vue";

type ResponsiveStyleMap = Record<string, string | number | undefined>;

type UseItemsSelectorPanelSizingArgs = {
	isPhone: Ref<boolean>;
	windowWidth: Ref<number>;
	windowHeight: Ref<number>;
	responsiveStyles: Ref<ResponsiveStyleMap>;
};

const PHONE_SELECTOR_HEIGHT =
	"calc(var(--viewport-height) - var(--bottom-safe-space) - 24px)";

export function useItemsSelectorPanelSizing({
	isPhone,
	windowWidth,
	windowHeight,
	responsiveStyles,
}: UseItemsSelectorPanelSizingArgs) {
	const canResizeSelectorPanel = computed(
		() => windowWidth.value >= 1280 && windowHeight.value >= 860,
	);

	const selectorCardStyle = computed<CSSProperties>(() => {
		const containerHeight = responsiveStyles.value["--container-height"];
		const height = isPhone.value ? PHONE_SELECTOR_HEIGHT : containerHeight;

		return {
			height,
			maxHeight: height,
			minHeight: isPhone.value
				? "calc(var(--viewport-height) * 0.46)"
				: containerHeight,
			resize: canResizeSelectorPanel.value ? "vertical" : "none",
			overflow: "auto",
			position: "relative",
		};
	});

	return {
		canResizeSelectorPanel,
		selectorCardStyle,
	};
}
