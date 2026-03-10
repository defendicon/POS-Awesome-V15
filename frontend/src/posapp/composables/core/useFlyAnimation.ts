type FlyOptions = {
	speed?: number;
	easing?: string;
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
		const sourceStyles = window.getComputedStyle(sourceEl as Element);
		const duration = Math.max(180, Math.round(speed * 1000));

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
		clone.style.boxShadow = "0 18px 42px rgba(15, 23, 42, 0.24)";
		document.body.appendChild(clone);

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
