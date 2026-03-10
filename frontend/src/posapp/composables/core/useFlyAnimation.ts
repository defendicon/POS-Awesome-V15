type FlyOptions = {
	speed?: number;
	easing?: string;
};

const resolveThemeHost = (element: Element) => {
	return (
		element.closest(
			".v-theme--dark, .v-theme--light, [data-theme='dark'], [data-theme='light'], [data-theme-mode='dark'], [data-theme-mode='light'], .v-application",
		) || document.body
	);
};

const isDarkThemeElement = (element: Element | null) => {
	if (!element) {
		return false;
	}
	return Boolean(
		element.closest(".v-theme--dark, [data-theme='dark'], [data-theme-mode='dark']"),
	);
};

export function useFlyAnimation(defaultOptions: FlyOptions = {}) {
	const activeClones = new Set<HTMLElement>();

	const fly = (
		sourceEl: Element | null,
		targetEl: Element | null,
		options: FlyOptions = {},
	) => {
		if (!sourceEl || !targetEl) {
			return;
		}
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
			return;
		}
		const { speed = 0.6, easing = "ease-in-out" } = {
			speed: 0.6,
			easing: "ease-in-out",
			...defaultOptions,
			...options,
		};

		const start = sourceEl.getBoundingClientRect();
		const end = targetEl.getBoundingClientRect();
		if (start.width <= 0 || start.height <= 0 || end.width <= 0 || end.height <= 0) {
			return;
		}

		const clone = sourceEl.cloneNode(true) as HTMLElement;
		const themeHost = resolveThemeHost(sourceEl);
		const hostStyles = window.getComputedStyle(themeHost as Element);
		const sourceStyles = window.getComputedStyle(sourceEl as Element);
		const isDarkTheme = isDarkThemeElement(sourceEl) || isDarkThemeElement(targetEl);
		const duration = Math.max(180, Math.round(speed * 1000));
		const primaryRgb = hostStyles.getPropertyValue("--v-theme-primary").trim() || "59, 130, 246";
		const raisedSurface =
			hostStyles.getPropertyValue("--pos-surface-raised").trim() ||
			hostStyles.getPropertyValue("--pos-card-bg").trim() ||
			sourceStyles.backgroundColor;

		clone.style.position = "fixed";
		clone.style.top = `${start.top}px`;
		clone.style.left = `${start.left}px`;
		clone.style.width = `${start.width}px`;
		clone.style.height = `${start.height}px`;
		clone.style.margin = "0";
		clone.style.pointerEvents = "none";
		clone.style.transform = "translate3d(0, 0, 0) scale(1)";
		clone.style.transformOrigin = "center center";
		clone.style.opacity = "0.96";
		clone.style.willChange = "transform, opacity";
		clone.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
		clone.style.zIndex = "2600";
		clone.style.overflow = "hidden";
		clone.style.borderRadius = sourceStyles.borderRadius || "16px";
		clone.style.background = raisedSurface || sourceStyles.backgroundColor || "transparent";
		clone.style.border = `1px solid rgba(${primaryRgb}, ${isDarkTheme ? "0.55" : "0.22"})`;
		clone.style.boxShadow = isDarkTheme
			? `0 0 0 1px rgba(${primaryRgb}, 0.2), 0 0 24px rgba(${primaryRgb}, 0.28), 0 18px 42px rgba(0, 0, 0, 0.46)`
			: `0 0 0 1px rgba(${primaryRgb}, 0.08), 0 18px 42px rgba(15, 23, 42, 0.24)`;
		clone.style.filter = isDarkTheme ? "brightness(1.18) saturate(1.1)" : "none";
		(themeHost as HTMLElement).appendChild(clone);

		const translateX =
			end.left + end.width / 2 - (start.left + start.width / 2);
		const translateY =
			end.top + end.height / 2 - (start.top + start.height / 2);
		const endTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(0.18)`;

		requestAnimationFrame(() => {
			clone.getBoundingClientRect();

			if (typeof clone.animate === "function") {
				const animation = clone.animate(
					[
						{ transform: "translate3d(0, 0, 0) scale(1)", opacity: 0.96 },
						{ transform: endTransform, opacity: 0.08 },
					],
					{
						duration,
						easing,
						fill: "forwards",
					},
				);

				animation.onfinish = cleanup;
				animation.oncancel = cleanup;
				return;
			}

			requestAnimationFrame(() => {
				clone.style.transform = endTransform;
				clone.style.opacity = "0.08";
			});
		});

		const cleanup = () => {
			clone.removeEventListener("transitionend", cleanup);
			if (clone.isConnected) {
				clone.remove();
			}
			activeClones.delete(clone);
		};
		clone.addEventListener("transitionend", cleanup);
		window.setTimeout(cleanup, duration + 120);
		activeClones.add(clone);
	};

	return { fly };
}
