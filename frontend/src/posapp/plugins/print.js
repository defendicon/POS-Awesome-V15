import renderOfflineInvoiceHTML from "../../offline_print_template.js";

const DEFAULT_READY_SELECTORS = ["#print-view", ".print-format"];
const DEFAULT_TIMEOUT = 10000;

function waitForDocumentSelectors(targetWindow, selectors, timeout) {
        return new Promise((resolve, reject) => {
                if (!targetWindow) {
                        reject(new Error("No print target available"));
                        return;
                }

                let doc;
                try {
                        doc = targetWindow.document;
                } catch (err) {
                        reject(err);
                        return;
                }

                if (!doc) {
                        reject(new Error("Print target has no document"));
                        return;
                }

                let completed = false;
                let observer;
                let interval;
                let timer;
                let handleUnload;

                const cleanup = () => {
                        if (observer) observer.disconnect();
                        if (interval) clearInterval(interval);
                        if (timer) clearTimeout(timer);
                        if (handleUnload) {
                                try {
                                        targetWindow.removeEventListener("beforeunload", handleUnload);
                                } catch (err) {
                                        console.warn("Failed to remove unload handler from print target", err);
                                }
                        }
                };

                const finish = (err) => {
                        if (completed) return;
                        completed = true;
                        cleanup();
                        if (err) {
                                reject(err);
                        } else {
                                resolve();
                        }
                };

                const isReady = () => {
                        try {
                                return selectors.some((selector) => doc.querySelector(selector));
                        } catch (err) {
                                console.warn("Failed to query print selector", err);
                                return false;
                        }
                };

                handleUnload = () => {
                        finish(new Error("Print target navigated away before ready"));
                };

                if (isReady()) {
                        finish();
                        return;
                }

                try {
                        const root = doc.body || doc.documentElement;
                        if (root) {
                                observer = new MutationObserver(() => {
                                        if (isReady()) {
                                                finish();
                                        }
                                });
                                observer.observe(root, { childList: true, subtree: true });
                        }
                } catch (err) {
                        console.warn("Failed to observe print document mutations", err);
                }

                interval = setInterval(() => {
                        if (targetWindow.closed) {
                                finish(new Error("Print target closed before ready"));
                                return;
                        }
                        if (isReady()) {
                                finish();
                        }
                }, 200);

                timer = setTimeout(() => {
                        finish(new Error("Timed out waiting for print markup"));
                }, timeout);

                try {
                        targetWindow.addEventListener("beforeunload", handleUnload, { once: true });
                } catch (err) {
                        console.warn("Failed to attach unload handler to print target", err);
                }
        });
}

async function fallbackToOfflinePrint(invoiceDoc, existingWindow) {
        if (!invoiceDoc) {
                        return false;
        }

        try {
                const html = await renderOfflineInvoiceHTML(invoiceDoc);
                if (!html) {
                        return false;
                }

                let target = existingWindow && !existingWindow.closed ? existingWindow : null;
                if (target) {
                        try {
                                target.document.open();
                        } catch (err) {
                                console.warn("Failed to reuse print window for offline fallback", err);
                                target = null;
                        }
                }

                if (!target) {
                        target = window.open("", "_blank");
                        if (!target) {
                                return false;
                        }
                        target.document.open();
                }

                target.document.write(html);
                target.document.close();
                target.focus();
                target.print();
                return true;
        } catch (err) {
                console.error("Offline print fallback failed", err);
                return false;
        }
}

async function ensureReadyAndPrint(targetWindow, options = {}) {
        if (!targetWindow) {
                return;
        }

        const {
                selectors = DEFAULT_READY_SELECTORS,
                timeout = DEFAULT_TIMEOUT,
                invoiceDoc = null,
        } = options;

        const readySelectors = Array.isArray(selectors)
                ? selectors.filter(Boolean)
                : [selectors].filter(Boolean);

        try {
                await waitForDocumentSelectors(targetWindow, readySelectors.length ? readySelectors : DEFAULT_READY_SELECTORS, timeout);
                targetWindow.focus();
                targetWindow.print();
        } catch (err) {
                console.warn("Print readiness check failed", err);
                const usedFallback = await fallbackToOfflinePrint(invoiceDoc, targetWindow);
                if (!usedFallback) {
                        try {
                                targetWindow.focus();
                                targetWindow.print();
                        } catch (printErr) {
                                console.error("Printing failed after readiness check error", printErr);
                        }
                }
        }
}

export function watchPrintWindow(printWindow, options = {}) {
        if (!printWindow) {
                return;
        }

        const handleLoad = () => {
                ensureReadyAndPrint(printWindow, options);
        };

        try {
                const doc = printWindow.document;
                if (doc?.readyState === "complete") {
                        handleLoad();
                } else {
                        printWindow.addEventListener("load", handleLoad, { once: true });
                }
        } catch (err) {
                console.warn("Unable to attach load handler to print window", err);
                setTimeout(() => ensureReadyAndPrint(printWindow, options), 0);
        }
}

export function silentPrint(url, options = {}) {
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
                        const contentWindow = iframe.contentWindow;
                        const cleanup = () => setTimeout(() => iframe.remove(), 1000);
                        Promise.resolve(ensureReadyAndPrint(contentWindow, options)).finally(cleanup);
                };
                iframe.src = url;
                document.body.appendChild(iframe);
        } catch (err) {
                console.error("Silent print failed, falling back to new window", err);
                const win = window.open(url, "_blank");
                if (win) {
                        watchPrintWindow(win, options);
                }
        }
}
