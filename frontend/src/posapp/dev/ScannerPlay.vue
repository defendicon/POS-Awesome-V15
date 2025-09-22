<template>
        <div class="scanner-play pos-themed-card">
                <header class="scanner-play__header">
                        <h2>Scanner demo</h2>
                        <p>
                                Keyboard wedge scanners feed characters quickly. This playground listens globally and
                                emits when it sees the configured suffix key or an idle gap.
                        </p>
                </header>
                <section class="scanner-play__config">
                        <p><strong>Suffix:</strong> {{ config.suffixKey }}</p>
                        <p><strong>Idle timeout:</strong> {{ config.idleCloseMs }} ms</p>
                        <p><strong>Deduplicate window:</strong> {{ config.dedupMs }} ms</p>
                </section>
                <section class="scanner-play__controls">
                        <v-btn class="pos-themed-button" color="primary" :disabled="isActive" @click="startDemo">
                                Start listener
                        </v-btn>
                        <v-btn class="pos-themed-button" color="secondary" :disabled="!isActive" @click="stopDemo">
                                Stop listener
                        </v-btn>
                </section>
                <section class="scanner-play__log">
                        <h3>Recent scans</h3>
                        <p v-if="!events.length" class="scanner-play__empty">
                                Try typing <code>abc</code> quickly then press <kbd>Enter</kbd> — the FSM should emit once.
                        </p>
                        <ul v-else>
                                <li v-for="event in events" :key="event.id">
                                        <span class="scanner-play__badge">{{ event.when }}</span>
                                        <code>{{ event.text }}</code>
                                </li>
                        </ul>
                </section>
        </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useScanner } from "../composables/useScanner";

type ScanEvent = {
        id: number;
        text: string;
        when: string;
};

const config = {
        suffixKey: "Enter",
        idleCloseMs: 80,
        dedupMs: 200,
};

const events = ref<ScanEvent[]>([]);
const isActive = ref(false);

const scanner = useScanner(config);
let dispose: (() => void) | null = null;

function logScan(text: string) {
        const now = new Date();
        const event: ScanEvent = {
                id: now.getTime() + Math.random(),
                text,
                when: now.toLocaleTimeString(),
        };
        events.value = [event, ...events.value].slice(0, 8);
}

function startDemo() {
        if (isActive.value) {
                return;
        }
        dispose = scanner.onScan((text) => {
                logScan(text);
        });
        scanner.start();
        isActive.value = true;
}

function stopDemo() {
        if (!isActive.value) {
                return;
        }
        scanner.stop();
        if (dispose) {
                dispose();
                dispose = null;
        }
        isActive.value = false;
}

onMounted(() => {
        startDemo();
});

onBeforeUnmount(() => {
        stopDemo();
});
</script>

<style scoped>
.scanner-play {
        display: grid;
        gap: 1.5rem;
        padding: 1.5rem;
        max-width: 640px;
        margin: 0 auto;
}

.scanner-play__header h2 {
        margin-bottom: 0.5rem;
}

.scanner-play__config {
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
}

.scanner-play__controls {
        display: flex;
        gap: 0.75rem;
}

.scanner-play__log ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.5rem;
}

.scanner-play__badge {
        background: rgba(0, 151, 167, 0.15);
        border-radius: 999px;
        padding: 0.15rem 0.75rem;
        margin-right: 0.75rem;
        font-size: 0.85rem;
}

.scanner-play__empty {
        margin: 0;
        color: rgba(0, 0, 0, 0.6);
}

code {
        font-family: "Fira Code", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
