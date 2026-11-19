import { nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

/** Observe the surface, and animate DOM moves without delaying pointer resizing. */
export function useLayoutSurface(
	root: Ref<HTMLElement | null>,
	order: () => string[],
	selector: string,
) {
	const width = ref(0);
	const gap = ref(0);
	let observer: ResizeObserver | undefined;
	let animations: Animation[] = [];
	let disposed = false;
	function measure() {
		if (!root.value) return;
		width.value = root.value.getBoundingClientRect().width;
		gap.value = parseFloat(getComputedStyle(root.value).columnGap) || 0;
	}
	watch(
		root,
		(element) => {
			observer?.disconnect();
			measure();
			if (element && typeof ResizeObserver !== "undefined") {
				observer = new ResizeObserver(measure);
				observer.observe(element);
			}
		},
		{ flush: "post" },
	);
	watch(
		() => order().join("\u0000"),
		async () => {
			animations.forEach((animation) => animation.cancel());
			animations = [];
			const before = new Map(
				Array.from(
					root.value?.querySelectorAll<HTMLElement>(selector) || [],
				).map((element) => [element, element.getBoundingClientRect()]),
			);
			await nextTick();
			if (
				disposed ||
				window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
			)
				return;
			for (const [element, previous] of before) {
				if (!element.isConnected || !element.animate) continue;
				const current = element.getBoundingClientRect();
				const x = previous.left - current.left,
					y = previous.top - current.top;
				if (x || y)
					animations.push(
						element.animate(
							[
								{ transform: `translate(${x}px, ${y}px)` },
								{ transform: "translate(0, 0)" },
							],
							{
								duration: 240,
								easing: "cubic-bezier(.22,1,.36,1)",
							},
						),
					);
			}
		},
		{ flush: "pre" },
	);
	onBeforeUnmount(() => {
		disposed = true;
		observer?.disconnect();
		animations.forEach((animation) => animation.cancel());
	});
	return { width, gap, measure };
}
