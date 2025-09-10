export function useFlyAnimation(defaultOptions = {}) {
	const activeClones = new Set();

	const fly = (sourceEl, targetEl, options = {}) => {
		if (!sourceEl || !targetEl) {
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

		const clone = sourceEl.cloneNode(true);
		clone.style.position = "fixed";
		clone.style.top = `${start.top}px`;
		clone.style.left = `${start.left}px`;
		clone.style.width = `${start.width}px`;
		clone.style.height = `${start.height}px`;
		clone.style.margin = "0";
		clone.style.pointerEvents = "none";
		clone.style.transition = `transform ${speed}s ${easing}, opacity ${speed}s ${easing}`;
		clone.style.zIndex = 1000;
		document.body.appendChild(clone);

		const translateX = end.left + end.width / 2 - (start.left + start.width / 2);
		const translateY = end.top + end.height / 2 - (start.top + start.height / 2);

		requestAnimationFrame(() => {
			clone.style.transform = `translate(${translateX}px, ${translateY}px) scale(0.1)`;
			clone.style.opacity = "0";
		});

		const cleanup = () => {
			clone.removeEventListener("transitionend", cleanup);
			clone.remove();
			activeClones.delete(clone);
		};
		clone.addEventListener("transitionend", cleanup);
		activeClones.add(clone);
	};

	return { fly };
}
