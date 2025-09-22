<template>
        <transition name="scanner-dev-fade">
                <div v-if="visible" class="scanner-dev-overlay">
                        <div class="scanner-dev-card">
                                <div class="scanner-dev-header">
                                        <div class="scanner-dev-title">
                                                <v-icon size="20" class="mr-2">mdi-monitor-dashboard</v-icon>
                                                <span>Scanner Diagnostics</span>
                                        </div>
                                        <div class="scanner-dev-actions">
                                                <v-btn
                                                        icon="mdi-close"
                                                        variant="text"
                                                        density="comfortable"
                                                        @click="closePanel"
                                                ></v-btn>
                                        </div>
                                </div>
                                <v-divider class="mb-4"></v-divider>

                                <div class="scanner-dev-content">
                                        <section class="scanner-dev-section">
                                                <header>
                                                        <h4>Last frame</h4>
                                                        <span class="scanner-dev-subtle" v-if="lastFrameTime">
                                                                {{ lastFrameTime }}
                                                        </span>
                                                </header>
                                                <div class="scanner-dev-grid">
                                                        <div class="scanner-dev-stat">
                                                                <label>Code</label>
                                                                <span class="mono">{{ lastFrame?.code || "—" }}</span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Raw</label>
                                                                <span class="mono">{{ lastFrame?.raw || "—" }}</span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Duration</label>
                                                                <span>
                                                                        {{ lastFrame?.durationMs ? formatMs(lastFrame.durationMs) : "—" }}
                                                                </span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Decision</label>
                                                                <span>{{ decisionPath }}</span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Symbology</label>
                                                                <span>{{ symbology || "unknown" }}</span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Checksum</label>
                                                                <span>{{ checksumLabel }}</span>
                                                        </div>
                                                        <div class="scanner-dev-stat">
                                                                <label>Queue depth</label>
                                                                <span>{{ queueDepth }}</span>
                                                        </div>
                                                </div>

                                                <div class="scanner-dev-histogram" v-if="histogramBuckets.length">
                                                        <div class="scanner-dev-hist-row" v-for="bucket in histogramBuckets" :key="bucket.label">
                                                                <span class="label">{{ bucket.label }}</span>
                                                                <div class="bar">
                                                                        <div class="bar-fill" :style="{ width: bucketWidth(bucket) }"></div>
                                                                </div>
                                                                <span class="count">{{ bucket.count }}</span>
                                                        </div>
                                                </div>
                                                <p v-else class="scanner-dev-subtle">No timing data captured yet.</p>
                                        </section>

                                        <section class="scanner-dev-section" v-if="workerCandidates.length || workerResolved.length">
                                                <header>
                                                        <h4>Worker resolution</h4>
                                                        <span class="scanner-dev-subtle">Candidates → resolved matches</span>
                                                </header>
                                                <div class="scanner-dev-worker">
                                                        <div class="worker-column">
                                                                <h5>candidates</h5>
                                                                <ul>
                                                                        <li v-for="candidate in workerCandidates" :key="candidate.value + candidate.reason">
                                                                                <span class="mono">{{ candidate.value }}</span>
                                                                                <span class="tag">{{ candidate.symbology }}</span>
                                                                                <span class="reason">{{ candidate.reason }}</span>
                                                                        </li>
                                                                </ul>
                                                        </div>
                                                        <div class="worker-column">
                                                                <h5>resolved</h5>
                                                                <ul>
                                                                        <li v-for="item in workerResolved" :key="item.item_code + item.uom + item.source">
                                                                                <span class="mono">{{ item.item_code }}</span>
                                                                                <span class="tag">{{ item.uom }}</span>
                                                                                <span class="reason">{{ item.source }}</span>
                                                                        </li>
                                                                </ul>
                                                        </div>
                                                </div>
                                        </section>

                                        <section class="scanner-dev-section">
                                                <header>
                                                        <h4>Synthetic scan generator</h4>
                                                        <span class="scanner-dev-subtle">
                                                                Use braces `{}` to mark human-typed segments. Escapes: `\n`, `\t`, `\{`, `\}`.
                                                        </span>
                                                </header>
                                                <v-textarea
                                                        v-model="syntheticInput"
                                                        rows="3"
                                                        auto-grow
                                                        label="Input sequence"
                                                        hint="Example: 01046012345678{TAB}ABC\n"
                                                        persistent-hint
                                                        class="mb-4"
                                                        density="comfortable"
                                                ></v-textarea>
                                                <div class="scanner-dev-controls">
                                                        <v-slider
                                                                v-model="msPerKey"
                                                                class="mr-4"
                                                                :min="1"
                                                                :max="10"
                                                                :step="1"
                                                                hide-details
                                                                label="Scanner speed (ms/key)"
                                                        ></v-slider>
                                                        <v-slider
                                                                v-model="humanDelayMs"
                                                                :min="60"
                                                                :max="250"
                                                                :step="10"
                                                                hide-details
                                                                label="Human gap (ms/key)"
                                                        ></v-slider>
                                                </div>
                                                <div class="scanner-dev-toggles">
                                                        <v-switch v-model="includePrefix" density="comfortable" hide-details label="Include configured prefix"></v-switch>
                                                        <v-switch v-model="includeSuffix" density="comfortable" hide-details label="Include configured suffix"></v-switch>
                                                </div>
                                                <div class="scanner-dev-actions">
                                                        <v-btn
                                                                color="primary"
                                                                :loading="simulating"
                                                                @click="triggerSimulation"
                                                        >
                                                                Dispatch sequence
                                                        </v-btn>
                                                        <v-btn variant="text" @click="useSample">Load sample</v-btn>
                                                        <span class="scanner-dev-subtle" v-if="syntheticStatus">{{ syntheticStatus }}</span>
                                                </div>
                                        </section>
                                </div>
                        </div>
                </div>
        </transition>
</template>

<script>
export default {
        name: "ScannerDevPanel",
        props: {
                modelValue: {
                        type: Boolean,
                        default: false,
                },
                diagnostics: {
                        type: Object,
                        default: () => ({}),
                },
                config: {
                        type: Object,
                        default: () => ({}),
                },
        },
        emits: ["update:modelValue", "simulate"],
        data() {
                return {
                        syntheticInput: "",
                        msPerKey: 5,
                        humanDelayMs: 120,
                        includePrefix: true,
                        includeSuffix: true,
                        simulating: false,
                        syntheticStatus: "",
                };
        },
        computed: {
                visible: {
                        get() {
                                return this.modelValue;
                        },
                        set(value) {
                                this.$emit("update:modelValue", value);
                        },
                },
                lastFrame() {
                        return this.diagnostics?.frame || null;
                },
                lastFrameTime() {
                        if (!this.lastFrame?.completedAt) {
                                return "";
                        }
                        try {
                                const date = new Date(this.lastFrame.completedAt);
                                return date.toLocaleTimeString();
                        } catch (error) {
                                return "";
                        }
                },
                decisionPath() {
                        if (!this.lastFrame) {
                                return "—";
                        }
                        const reason = this.diagnostics?.frameReason || this.lastFrame?.meta?.reason;
                        if (!reason) {
                                return "—";
                        }
                        return reason.replace(/_/g, " ");
                },
                checksumLabel() {
                        const valid = this.lastFrame?.meta?.gtinValid;
                        if (valid === true) {
                                return "valid";
                        }
                        if (valid === false) {
                                return "invalid";
                        }
                        return "unknown";
                },
                symbology() {
                        return this.diagnostics?.symbology || this.lastFrame?.meta?.symbology || "";
                },
                queueDepth() {
                        return Number.isFinite(this.diagnostics?.queueDepth) ? this.diagnostics.queueDepth : 0;
                },
                histogramValues() {
                        return Array.isArray(this.diagnostics?.histogram) ? this.diagnostics.histogram : [];
                },
                histogramBuckets() {
                        if (!this.histogramValues.length) {
                                return [];
                        }
                        const buckets = [
                                { label: "≤10 ms", max: 10, count: 0 },
                                { label: "≤25 ms", max: 25, count: 0 },
                                { label: "≤50 ms", max: 50, count: 0 },
                                { label: "≤80 ms", max: 80, count: 0 },
                                { label: "≤120 ms", max: 120, count: 0 },
                                { label: "≤200 ms", max: 200, count: 0 },
                                { label: ">200 ms", max: Infinity, count: 0 },
                        ];
                        this.histogramValues.forEach((value) => {
                                const ms = Number(value);
                                if (!Number.isFinite(ms)) {
                                        return;
                                }
                                const bucket = buckets.find((entry) => ms <= entry.max) || buckets[buckets.length - 1];
                                bucket.count += 1;
                        });
                        return buckets;
                },
                workerCandidates() {
                        return Array.isArray(this.diagnostics?.worker?.candidates)
                                ? this.diagnostics.worker.candidates
                                : [];
                },
                workerResolved() {
                        return Array.isArray(this.diagnostics?.worker?.resolved)
                                ? this.diagnostics.worker.resolved
                                : [];
                },
        },
        methods: {
                closePanel() {
                        this.visible = false;
                },
                bucketWidth(bucket) {
                        if (!bucket || !this.histogramValues.length) {
                                return "0%";
                        }
                        const max = Math.max(...this.histogramBuckets.map((entry) => entry.count));
                        if (!max) {
                                return "0%";
                        }
                        const ratio = bucket.count / max;
                        return `${Math.round(ratio * 100)}%`;
                },
                formatMs(value) {
                        return `${value.toFixed(1)} ms`;
                },
                triggerSimulation() {
                        if (!this.syntheticInput) {
                                this.syntheticStatus = "Enter a sequence first.";
                                return;
                        }
                        this.syntheticStatus = "Dispatching…";
                        this.simulating = true;
                        this.$emit("simulate", {
                                input: this.syntheticInput,
                                msPerKey: this.msPerKey,
                                humanDelayMs: this.humanDelayMs,
                                includePrefix: this.includePrefix,
                                includeSuffix: this.includeSuffix,
                        });
                        setTimeout(() => {
                                this.simulating = false;
                                this.syntheticStatus = "Sequence dispatched.";
                        }, 120);
                },
                useSample() {
                        const suffix = this.config?.suffix === "Enter" || this.includeSuffix ? "\\n" : "";
                        this.syntheticInput = `01046012345678{TAB}ABC${suffix}`;
                        this.syntheticStatus = "Loaded sample sequence.";
                },
        },
};
</script>

<style scoped>
.scanner-dev-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(4px);
        z-index: 5000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 32px 24px;
        overflow-y: auto;
}

.scanner-dev-card {
        width: min(960px, 100%);
        background: var(--v-theme-surface, rgba(15, 23, 42, 0.95));
        color: var(--v-theme-on-surface, #f8fafc);
        border-radius: 16px;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
        padding: 20px 28px 28px;
}

.scanner-dev-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
}

.scanner-dev-title {
        display: flex;
        align-items: center;
        font-weight: 600;
        font-size: 1.1rem;
}

.scanner-dev-content {
        display: flex;
        flex-direction: column;
        gap: 32px;
}

.scanner-dev-section header {
        display: flex;
        align-items: baseline;
        gap: 16px;
        margin-bottom: 12px;
}

.scanner-dev-section h4 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
}

.scanner-dev-section h5 {
        margin: 0 0 8px;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
}

.scanner-dev-subtle {
        color: rgba(226, 232, 240, 0.75);
        font-size: 0.85rem;
}

.scanner-dev-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px 16px;
        margin-bottom: 16px;
}

.scanner-dev-stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(148, 163, 184, 0.12);
}

.scanner-dev-stat label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(226, 232, 240, 0.7);
}

.scanner-dev-stat span {
        font-size: 0.95rem;
        font-weight: 500;
        word-break: break-all;
}

.mono {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.scanner-dev-histogram {
        display: flex;
        flex-direction: column;
        gap: 6px;
}

.scanner-dev-hist-row {
        display: grid;
        grid-template-columns: 120px 1fr 40px;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
}

.scanner-dev-hist-row .bar {
        position: relative;
        height: 8px;
        background: rgba(148, 163, 184, 0.2);
        border-radius: 999px;
        overflow: hidden;
}

.scanner-dev-hist-row .bar-fill {
        height: 100%;
        background: #38bdf8;
}

.scanner-dev-worker {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 24px;
}

.worker-column ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
}

.worker-column li {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 0.85rem;
        background: rgba(148, 163, 184, 0.1);
        padding: 6px 8px;
        border-radius: 6px;
}

.worker-column .tag {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 0.75rem;
}

.worker-column .reason {
        color: rgba(226, 232, 240, 0.7);
        font-size: 0.75rem;
}

.scanner-dev-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 12px;
}

.scanner-dev-controls .v-slider {
        flex: 1 1 240px;
}

.scanner-dev-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 12px;
}

.scanner-dev-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
}

.scanner-dev-fade-enter-active,
.scanner-dev-fade-leave-active {
        transition: opacity 0.2s ease;
}

.scanner-dev-fade-enter-from,
.scanner-dev-fade-leave-to {
        opacity: 0;
}

@media (max-width: 960px) {
        .scanner-dev-card {
                padding: 16px 18px 24px;
        }
        .scanner-dev-grid {
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
        .scanner-dev-hist-row {
                grid-template-columns: 100px 1fr 32px;
        }
}
</style>
