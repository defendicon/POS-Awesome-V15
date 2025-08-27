export function silentPrint(url) {
	if (!url) return;
	try {
		const iframe = document.createElement("iframe");
		iframe.style.position = "fixed";
		iframe.style.right = "0";
		iframe.style.bottom = "0";
		iframe.style.width = "0";
		iframe.style.height = "0";
		iframe.style.border = "0";
		iframe.onload = () => {
			try {
				iframe.contentWindow.focus();
				iframe.contentWindow.print();
			} finally {
				setTimeout(() => iframe.remove(), 1000);
			}
		};
		iframe.src = url;
		document.body.appendChild(iframe);
	} catch (err) {
		console.error("Silent print failed, falling back to new window", err);
		const win = window.open(url, "_blank");
		if (win) {
			win.addEventListener("load", () => win.print(), { once: true });
		}
	}
}
