import { onBeforeUnmount } from "vue";

/**
 * useScanner composable
 *
 * Usage:
 * ```ts
 * const scanner = useScanner();
 * const dispose = scanner.onScan((text) => console.log(text));
 * scanner.start();
 * // later -> dispose(); scanner.stop();
 * ```
 */

type ScannerCallback = (text: string) => void;

type ScannerConfig = {
        suffixKey?: string;
        idleCloseMs?: number;
        dedupMs?: number;
        bufferSize?: number;
        target?: Document | HTMLElement | Window;
};

type BufferEntry = {
        key: string;
        time: number;
};

const DEFAULT_CONFIG = {
        suffixKey: "Enter",
        idleCloseMs: 80,
        dedupMs: 200,
        bufferSize: 64,
} satisfies Required<Omit<ScannerConfig, "target">>;

export function useScanner(userConfig: ScannerConfig = {}) {
        const config = { ...DEFAULT_CONFIG, ...userConfig };
        let active = false;
        let state: "idle" | "collecting" = "idle";
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        let target: Document | HTMLElement | Window | null = null;
        const callbacks = new Set<ScannerCallback>();
        const buffer: BufferEntry[] = new Array(config.bufferSize);
        let bufferSize = 0;
        let head = 0;
        let lastScanText = "";
        let lastScanTime = 0;

        function clearBuffer() {
                bufferSize = 0;
                head = 0;
        }

        function push(char: string, time: number) {
                buffer[head] = { key: char, time };
                head = (head + 1) % config.bufferSize;
                if (bufferSize < config.bufferSize) {
                        bufferSize += 1;
                }
        }

        function readBuffer() {
                if (bufferSize === 0) {
                        return "";
                }
                let text = "";
                for (let i = 0; i < bufferSize; i += 1) {
                        const index = (head - bufferSize + i + config.bufferSize) % config.bufferSize;
                        const entry = buffer[index];
                        if (entry) {
                                text += entry.key;
                        }
                }
                return text;
        }

        function transitionToIdle() {
                state = "idle";
                if (idleTimer !== null) {
                        clearTimeout(idleTimer);
                        idleTimer = null;
                }
                clearBuffer();
        }

        function emitScan() {
                const text = readBuffer();
                transitionToIdle();
                if (!text) {
                        return;
                }
                const now = Date.now();
                if (text === lastScanText && now - lastScanTime < config.dedupMs) {
                        return;
                }
                lastScanText = text;
                lastScanTime = now;
                callbacks.forEach((callback) => {
                        try {
                                callback(text);
                        } catch (error) {
                                console.error("useScanner callback failed", error);
                        }
                });
        }

        function scheduleIdleFlush() {
                if (idleTimer !== null) {
                        clearTimeout(idleTimer);
                }
                idleTimer = setTimeout(() => {
                        if (state === "collecting") {
                                emitScan();
                        }
                }, config.idleCloseMs);
        }

        function handleKeydown(event: KeyboardEvent) {
                if (!active) {
                        return;
                }
                if (event.defaultPrevented) {
                        return;
                }

                if (event.key === config.suffixKey) {
                        if (state === "collecting") {
                                event.preventDefault();
                                emitScan();
                        }
                        return;
                }

                if (
                        event.key.length === 1 &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.altKey &&
                        !event.isComposing
                ) {
                        if (state === "idle") {
                                clearBuffer();
                                state = "collecting";
                        }
                        push(event.key, event.timeStamp);
                        scheduleIdleFlush();
                        return;
                }

                if (state === "collecting") {
                        scheduleIdleFlush();
                }
        }

        function resolveTarget(provided?: Document | HTMLElement | Window | null) {
                if (provided) {
                        return provided;
                }
                if (userConfig.target) {
                        return userConfig.target;
                }
                if (typeof document !== "undefined") {
                        return document;
                }
                return null;
        }

        function start(nextTarget?: Document | HTMLElement | Window | null) {
                if (active) {
                        return;
                }
                target = resolveTarget(nextTarget);
                if (!target || typeof target.addEventListener !== "function") {
                        return;
                }
                target.addEventListener("keydown", handleKeydown, true);
                active = true;
        }

        function stop() {
                if (!active) {
                        return;
                }
                if (target && typeof target.removeEventListener === "function") {
                        target.removeEventListener("keydown", handleKeydown, true);
                }
                transitionToIdle();
                active = false;
        }

        function onScan(callback: ScannerCallback) {
                callbacks.add(callback);
                return () => {
                        callbacks.delete(callback);
                };
        }

        onBeforeUnmount(() => {
                stop();
                callbacks.clear();
        });

        return { start, stop, onScan };
}
