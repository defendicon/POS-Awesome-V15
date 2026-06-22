<template>
	<div class="designer-root" @keydown="onKeydown" tabindex="0" ref="rootEl">
		<div class="designer-toolbar d-flex align-center ga-2 pa-2">
			<v-btn size="x-small" icon="mdi-undo" @click="designer.undo()" :disabled="!designer.canUndo.value" :title="__('Undo')"></v-btn>
			<v-btn size="x-small" icon="mdi-redo" @click="designer.redo()" :disabled="!designer.canRedo.value" :title="__('Redo')"></v-btn>
			<v-divider vertical class="mx-1"></v-divider>
			<v-btn size="x-small" icon="mdi-content-copy" @click="designer.copySelected()" :disabled="!designer.selectedId.value" :title="__('Copy')"></v-btn>
			<v-btn size="x-small" icon="mdi-content-paste" @click="designer.pasteClipboard()" :title="__('Paste')"></v-btn>
			<v-btn size="x-small" icon="mdi-content-duplicate" @click="designer.duplicateSelected()" :disabled="!designer.selectedId.value" :title="__('Duplicate')"></v-btn>
			<v-divider vertical class="mx-1"></v-divider>
			<v-btn size="x-small" icon="mdi-arrow-up-bold-box" @click="designer.bringForward()" :disabled="!designer.selectedId.value" :title="__('Bring Forward')"></v-btn>
			<v-btn size="x-small" icon="mdi-arrow-down-bold-box" @click="designer.sendBackward()" :disabled="!designer.selectedId.value" :title="__('Send Backward')"></v-btn>
			<v-spacer></v-spacer>
			<v-checkbox v-model="designer.gridEnabled.value" :label="__('Grid')" hide-details density="compact" class="mr-2"></v-checkbox>
			<v-checkbox v-model="designer.snapEnabled.value" :label="__('Snap')" hide-details density="compact" class="mr-2"></v-checkbox>
			<v-btn size="x-small" icon="mdi-magnify-minus" @click="zoomOut" :disabled="designer.zoom.value <= 0.25"></v-btn>
			<span class="text-caption mx-1">{{ Math.round(designer.zoom.value * 100) }}%</span>
			<v-btn size="x-small" icon="mdi-magnify-plus" @click="zoomIn" :disabled="designer.zoom.value >= 4"></v-btn>
			<v-btn size="x-small" variant="text" class="ml-1" @click="resetZoom">{{ __("Fit") }}</v-btn>
			<v-btn size="x-small" icon="mdi-delete" color="error" @click="designer.clearAll()" :title="__('Clear All')" class="ml-2"></v-btn>
		</div>

		<div class="designer-scroll" ref="scrollEl">
			<div class="designer-stage" :style="stageStyle">
				<div class="designer-canvas" :style="canvasStyle">
					<svg class="ruler-top" :width="canvasPx.width" height="15">
						<line v-for="mm in rulerTopMarks" :key="'rt'+mm"
							:x1="mmToPx(mm)" y1="0"
							:x2="mmToPx(mm)" y2="5"
							stroke="#999" stroke-width="0.5" />
						<text v-for="mm in rulerTopLabels" :key="'rtl'+mm"
							:x="mmToPx(mm) + 1" y="12"
							font-size="7" fill="#666">{{ mm }}</text>
					</svg>
					<svg class="ruler-left" :width="15" :height="canvasPx.height">
						<line v-for="mm in rulerLeftMarks" :key="'rl'+mm"
							x1="0" :y1="mmToPx(mm)"
							x2="5" :y2="mmToPx(mm)"
							stroke="#999" stroke-width="0.5" />
						<text v-for="mm in rulerLeftLabels" :key="'rll'+mm"
							x="7" :y="mmToPx(mm) + 10"
							font-size="7" fill="#666" transform="rotate(90, 7, 0)">{{ mm }}</text>
					</svg>

					<svg class="grid-overlay" v-if="designer.gridEnabled.value"
						:width="canvasPx.width" :height="canvasPx.height">
						<line v-for="i in gridLinesX" :key="'gx'+i"
							:x1="mmToPx(i * designer.gridSize.value)" y1="0"
							:x2="mmToPx(i * designer.gridSize.value)" y2="canvasPx.height"
							stroke="#e0e0e0" stroke-width="0.5" />
						<line v-for="i in gridLinesY" :key="'gy'+i"
							x1="0" :y1="mmToPx(i * designer.gridSize.value)"
							:x2="canvasPx.width" :y2="mmToPx(i * designer.gridSize.value)"
							stroke="#e0e0e0" stroke-width="0.5" />
					</svg>

					<div
						v-for="obj in sortedObjects"
						:key="obj.id"
						class="designer-object"
						:class="{ selected: obj.id === designer.selectedId.value }"
						:style="objectStyle(obj)"
						@mousedown.stop="onObjectMouseDown($event, obj.id)"
						@dblclick.stop="onObjectDblClick(obj.id)"
					>
						<template v-if="obj.type === 'text'">
							<span class="designer-text" :style="textStyle(obj)">{{ resolveContent(obj.content) }}</span>
						</template>
						<template v-else-if="obj.type === 'barcode'">
							<div class="designer-barcode-placeholder">
								<div class="barcode-visual" :style="barcodeStyle(obj)"></div>
								<div v-if="obj.humanReadable" class="barcode-hr">{{ resolveContent(obj.content) }}</div>
							</div>
						</template>
						<template v-else-if="obj.type === 'shape'">
							<div v-if="obj.shapeType === 'ellipse'" class="designer-shape" :style="shapeStyle(obj, 'ellipse')"></div>
							<div v-else class="designer-shape" :style="shapeStyle(obj, 'rect')"></div>
						</template>
						<template v-else-if="obj.type === 'line'">
							<div class="designer-line" :style="lineStyle(obj)"></div>
						</template>
						<template v-else-if="obj.type === 'image' && obj.imageSrc">
							<img class="designer-image" :src="obj.imageSrc" :style="imageFitStyle(obj)" />
						</template>

						<div v-if="obj.id === designer.selectedId.value" class="selection-handle tl" @mousedown.stop="startResize($event, obj.id, 'tl')"></div>
						<div v-if="obj.id === designer.selectedId.value" class="selection-handle tr" @mousedown.stop="startResize($event, obj.id, 'tr')"></div>
						<div v-if="obj.id === designer.selectedId.value" class="selection-handle bl" @mousedown.stop="startResize($event, obj.id, 'bl')"></div>
						<div v-if="obj.id === designer.selectedId.value" class="selection-handle br" @mousedown.stop="startResize($event, obj.id, 'br')"></div>
						<div v-if="obj.id === designer.selectedId.value" class="rotation-handle" @mousedown.stop="startRotate($event, obj.id)"></div>
					</div>

					<div v-if="!designer.objects.value.length" class="designer-empty-hint">
						{{ __("Drag objects from the toolbox or use Add menu") }}
					</div>
				</div>
			</div>
		</div>

		<div class="designer-toolbox d-flex ga-1 pa-2 border-t">
			<v-btn size="small" variant="outlined" prepend-icon="mdi-format-text" @click="addTextObject">{{ __("Text") }}</v-btn>
			<v-btn size="small" variant="outlined" prepend-icon="mdi-calendar" @click="addDateTimeObject">{{ __("Date") }}</v-btn>
			<v-btn size="small" variant="outlined" prepend-icon="mdi-barcode" @click="addBarcodeObject">{{ __("Barcode") }}</v-btn>
			<v-btn size="small" variant="outlined" prepend-icon="mdi-rectangle-outline" @click="addRectObject">{{ __("Rect") }}</v-btn>
			<v-btn size="small" variant="outlined" prepend-icon="mdi-vector-line" @click="addLineObject">{{ __("Line") }}</v-btn>
			<v-spacer></v-spacer>
			<v-btn
				size="small"
				variant="text"
				prepend-icon="mdi-numeric"
				@click="showSerialPreview = !showSerialPreview"
				:color="showSerialPreview ? 'primary' : undefined"
			>
				<template v-if="serialPreview.length">{{ serialPreview[0] }} &rarr;</template>
			</v-btn>
		</div>

		<v-expand-transition>
			<div v-if="showSerialPreview" class="serial-preview-panel pa-2 border-t">
				<div class="text-caption text-medium-emphasis mb-1">{{ __("Next serials:") }}</div>
				<div class="d-flex flex-wrap ga-1">
					<v-chip
						v-for="serial in serialPreview"
						:key="serial"
						size="x-small"
						label
						variant="outlined"
					>
						{{ serial }}
					</v-chip>
				</div>
			</div>
		</v-expand-transition>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useSerializationEngine } from "../../../composables/pos/items/useSerializationEngine";

declare const __: (_str: string, _args?: any[]) => string;

const MM_PER_INCH = 25.4;
const PX_PER_MM = 96 / MM_PER_INCH;

interface Props {
	designer: ReturnType<typeof import("../../../composables/pos/items/useLabelDesigner").useLabelDesigner>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
	(e: "select", id: string | null): void;
	(e: "dblclick", id: string): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

const serialEngine = useSerializationEngine();
const showSerialPreview = ref(false);

const serialPreview = computed(() => {
	return serialEngine.previewSerials(5);
});

const canvasPx = computed(() => {
	const w = props.designer.labelSize.value.widthMm * PX_PER_MM * props.designer.zoom.value;
	const h = props.designer.labelSize.value.heightMm * PX_PER_MM * props.designer.zoom.value;
	return { width: Math.round(w), height: Math.round(h) };
});

const stageStyle = computed(() => {
	const vw = canvasPx.value.width + 40;
	const vh = canvasPx.value.height + 40;
	return {
		width: `${vw}px`,
		height: `${vh}px`,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	};
});

const canvasStyle = computed(() => ({
	width: `${canvasPx.value.width}px`,
	height: `${canvasPx.value.height}px`,
	position: "relative" as const,
	background: "#fff",
	border: "1px solid #ccc",
	boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
	overflow: "hidden",
}));

const sortedObjects = computed(() => {
	return [...props.designer.objects.value].sort((a, b) => a.zIndex - b.zIndex);
});

const rulerTopMarks = computed(() => {
	const marks: number[] = [];
	for (let i = 0; i <= props.designer.labelSize.value.widthMm; i += 5) {
		marks.push(i);
	}
	return marks;
});

const rulerTopLabels = computed(() => {
	const labels: number[] = [];
	for (let i = 0; i <= props.designer.labelSize.value.widthMm; i += 10) {
		labels.push(i);
	}
	return labels;
});

const rulerLeftMarks = computed(() => {
	const marks: number[] = [];
	for (let i = 0; i <= props.designer.labelSize.value.heightMm; i += 5) {
		marks.push(i);
	}
	return marks;
});

const rulerLeftLabels = computed(() => {
	const labels: number[] = [];
	for (let i = 0; i <= props.designer.labelSize.value.heightMm; i += 10) {
		labels.push(i);
	}
	return labels;
});

const gridLinesX = computed(() => {
	const count = Math.floor(props.designer.labelSize.value.widthMm / props.designer.gridSize.value);
	return Array.from({ length: count }, (_, i) => i + 1);
});

const gridLinesY = computed(() => {
	const count = Math.floor(props.designer.labelSize.value.heightMm / props.designer.gridSize.value);
	return Array.from({ length: count }, (_, i) => i + 1);
});

const mmToPx = (mm: number) => Math.round(mm * PX_PER_MM * props.designer.zoom.value);

const objectStyle = (obj: any) => ({
	position: "absolute" as const,
	left: `${mmToPx(obj.x)}px`,
	top: `${mmToPx(obj.y)}px`,
	width: `${mmToPx(obj.width)}px`,
	height: `${mmToPx(obj.height)}px`,
	transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
	cursor: "move",
});

const textStyle = (obj: any) => ({
	fontFamily: obj.fontFamily || "Arial",
	fontSize: `${mmToPx(obj.fontSize || 8)}px`,
	fontWeight: obj.fontBold ? "bold" : "normal",
	fontStyle: obj.fontItalic ? "italic" : "normal",
	textDecoration: obj.fontUnderline ? "underline" : "none",
	textAlign: obj.textAlign || "left",
	color: obj.color || "#000",
	width: "100%",
	height: "100%",
	overflow: "hidden",
	display: "flex",
	alignItems: "center",
	whiteSpace: "pre-wrap" as const,
	wordBreak: "break-word" as const,
});

const barcodeStyle = (obj: any) => ({
	width: "100%",
	height: obj.humanReadable ? "70%" : "100%",
	background: `repeating-linear-gradient(
		90deg,
		#000 0px,
		#000 ${Math.max(1, mmToPx(0.25))}px,
		#fff ${Math.max(1, mmToPx(0.25))}px,
		#fff ${Math.max(2, mmToPx(0.5))}px
	)`,
	borderRadius: "1px",
});

const shapeStyle = (obj: any, type: "rect" | "ellipse") => ({
	width: "100%",
	height: "100%",
	borderRadius: type === "ellipse" ? "50%" : "0",
	border: `${obj.borderWidth || 0.5}mm solid ${obj.borderColor || "#000"}`,
	background: obj.color || "transparent",
	boxSizing: "border-box" as const,
});

const lineStyle = (obj: any) => {
	if (obj.lineDirection === "vertical") {
		return {
			width: `${mmToPx(obj.borderWidth || 0.5)}px`,
			height: "100%",
			background: obj.borderColor || "#000",
			margin: "0 auto",
		};
	}
	return {
		height: `${mmToPx(obj.borderWidth || 0.5)}px`,
		width: "100%",
		background: obj.borderColor || "#000",
		margin: "auto 0",
	};
};

const imageFitStyle = (_obj: any) => ({
	width: "100%",
	height: "100%",
	objectFit: "contain" as const,
});

const resolveContent = (content: string): string => {
	return content.replace(/\{(\w+)\}/g, (_, key) => {
		const demoValues: Record<string, string> = {
			item_code: "ITEM-001",
			item_name: "Sample Item",
			barcode: "5901234123457",
			price: "10.50",
			qty: "1",
			uom: "Nos",
			date: "2026-01-15",
		};
		return demoValues[key] || `{${key}}`;
	});
};

let dragState: {
	objId: string;
	startX: number;
	startY: number;
	origX: number;
	origY: number;
	moved: boolean;
} | null = null;

let resizeState: {
	objId: string;
	handle: string;
	startX: number;
	startY: number;
	origW: number;
	origH: number;
	origX: number;
	origY: number;
} | null = null;

let rotateState: {
	objId: string;
	startX: number;
	startY: number;
	centerX: number;
	centerY: number;
	origRot: number;
} | null = null;

const onObjectMouseDown = (e: MouseEvent, id: string) => {
	if (e.button !== 0) return;
	props.designer.selectObject(id);
	emit("select", id);
	const obj = props.designer.objects.value.find((o) => o.id === id);
	if (!obj) return;
	dragState = {
		objId: id,
		startX: e.clientX,
		startY: e.clientY,
		origX: obj.x,
		origY: obj.y,
		moved: false,
	};
	document.addEventListener("mousemove", onDragMove);
	document.addEventListener("mouseup", onDragEnd);
};

const onDragMove = (e: MouseEvent) => {
	if (!dragState) return;
	const dxPx = e.clientX - dragState.startX;
	const dyPx = e.clientY - dragState.startY;
	const dxMm = dxPx / PX_PER_MM / props.designer.zoom.value;
	const dyMm = dyPx / PX_PER_MM / props.designer.zoom.value;
	if (Math.abs(dxMm) > 0.1 || Math.abs(dyMm) > 0.1) {
		dragState.moved = true;
	}
	props.designer.moveObjectDelta(dragState.objId, dxMm, dyMm);
	dragState.startX = e.clientX;
	dragState.startY = e.clientY;
};

const onDragEnd = () => {
	if (dragState && dragState.moved) {
		props.designer["pushHistory"]();
	}
	dragState = null;
	document.removeEventListener("mousemove", onDragMove);
	document.removeEventListener("mouseup", onDragEnd);
};

const startResize = (e: MouseEvent, id: string, handle: string) => {
	e.stopPropagation();
	const obj = props.designer.objects.value.find((o) => o.id === id);
	if (!obj) return;
	resizeState = {
		objId: id,
		handle,
		startX: e.clientX,
		startY: e.clientY,
		origW: obj.width,
		origH: obj.height,
		origX: obj.x,
		origY: obj.y,
	};
	document.addEventListener("mousemove", onResizeMove);
	document.addEventListener("mouseup", onResizeEnd);
};

const onResizeMove = (e: MouseEvent) => {
	if (!resizeState) return;
	const dxPx = e.clientX - resizeState.startX;
	const dyPx = e.clientY - resizeState.startY;
	const dxMm = dxPx / PX_PER_MM / props.designer.zoom.value;
	const dyMm = dyPx / PX_PER_MM / props.designer.zoom.value;
	const h = resizeState.handle;
	let dw = 0, dh = 0, dx = 0, dy = 0;
	if (h.includes("r")) { dw = dxMm; }
	if (h.includes("b")) { dh = dyMm; }
	if (h.includes("l")) { dw = -dxMm; dx = dxMm; }
	if (h.includes("t")) { dh = -dyMm; dy = dyMm; }
	const obj = props.designer.objects.value.find((o) => o.id === resizeState!.objId);
	if (!obj) return;
	obj.width = Math.max(3, resizeState.origW + dw);
	obj.height = Math.max(3, resizeState.origH + dh);
	if (h.includes("l")) obj.x = resizeState.origX + dx;
	if (h.includes("t")) obj.y = resizeState.origY + dy;
};

const onResizeEnd = () => {
	if (resizeState) {
		props.designer["pushHistory"]();
	}
	resizeState = null;
	document.removeEventListener("mousemove", onResizeMove);
	document.removeEventListener("mouseup", onResizeEnd);
};

const startRotate = (e: MouseEvent, id: string) => {
	e.stopPropagation();
	const obj = props.designer.objects.value.find((o) => o.id === id);
	if (!obj) return;
	const cxPx = mmToPx(obj.x + obj.width / 2);
	const cyPx = mmToPx(obj.y + obj.height / 2);
	rotateState = {
		objId: id,
		startX: e.clientX,
		startY: e.clientY,
		centerX: cxPx,
		centerY: cyPx,
		origRot: obj.rotation || 0,
	};
	document.addEventListener("mousemove", onRotateMove);
	document.addEventListener("mouseup", onRotateEnd);
};

const onRotateMove = (e: MouseEvent) => {
	const rs = rotateState;
	if (!rs) return;
	const dx = e.clientX - rs.centerX;
	const dy = e.clientY - rs.centerY;
	const angle = Math.atan2(dy, dx) * (180 / Math.PI);
	const snapped = Math.round(angle / 15) * 15;
	const obj = props.designer.objects.value.find((o) => o.id === rs.objId);
	if (obj) obj.rotation = snapped;
};

const onRotateEnd = () => {
	const rs = rotateState;
	if (rs) {
		props.designer["pushHistory"]();
	}
	rotateState = null;
	document.removeEventListener("mousemove", onRotateMove);
	document.removeEventListener("mouseup", onRotateEnd);
};

const onObjectDblClick = (id: string) => {
	emit("dblclick", id);
};

const onKeydown = (e: KeyboardEvent) => {
	if (e.ctrlKey && e.key === "z") {
		e.preventDefault();
		if (e.shiftKey) props.designer.redo();
		else props.designer.undo();
	} else if (e.key === "Delete" || e.key === "Backspace") {
		if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
			props.designer.removeSelected();
		}
	} else if (e.ctrlKey && e.key === "c") {
		props.designer.copySelected();
	} else if (e.ctrlKey && e.key === "v") {
		props.designer.pasteClipboard();
	} else if (e.ctrlKey && e.key === "d") {
		e.preventDefault();
		props.designer.duplicateSelected();
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		if (props.designer.selectedId.value) props.designer.moveObjectDelta(props.designer.selectedId.value, 0, -0.5);
	} else if (e.key === "ArrowDown") {
		e.preventDefault();
		if (props.designer.selectedId.value) props.designer.moveObjectDelta(props.designer.selectedId.value, 0, 0.5);
	} else if (e.key === "ArrowLeft") {
		e.preventDefault();
		if (props.designer.selectedId.value) props.designer.moveObjectDelta(props.designer.selectedId.value, -0.5, 0);
	} else if (e.key === "ArrowRight") {
		e.preventDefault();
		if (props.designer.selectedId.value) props.designer.moveObjectDelta(props.designer.selectedId.value, 0.5, 0);
	}
};

const zoomIn = () => {
	props.designer.zoom.value = Math.min(4, Math.round((props.designer.zoom.value + 0.1) * 10) / 10);
};

const zoomOut = () => {
	props.designer.zoom.value = Math.max(0.25, Math.round((props.designer.zoom.value - 0.1) * 10) / 10);
};

const resetZoom = () => {
	if (scrollEl.value) {
		const availW = scrollEl.value.clientWidth - 40;
		const availH = scrollEl.value.clientHeight - 40;
		const zw = availW / (props.designer.labelSize.value.widthMm * PX_PER_MM);
		const zh = availH / (props.designer.labelSize.value.heightMm * PX_PER_MM);
		props.designer.zoom.value = Math.min(1, Math.round(Math.min(zw, zh) * 10) / 10);
	}
};

const addTextObject = () => {
	const cx = props.designer.labelSize.value.widthMm / 2 - 15;
	const cy = props.designer.labelSize.value.heightMm / 2 - 3;
	props.designer.addText(cx, cy);
};

const addBarcodeObject = () => {
	const cx = props.designer.labelSize.value.widthMm / 2 - 25;
	const cy = props.designer.labelSize.value.heightMm / 2 - 10;
	props.designer.addBarcode(cx, cy);
};

const addRectObject = () => {
	const cx = 5;
	const cy = 5;
	props.designer.addRectangle(cx, cy);
};

const addLineObject = () => {
	const cx = 10;
	const cy = props.designer.labelSize.value.heightMm / 2;
	props.designer.addLine(cx, cy, "horizontal");
};

const addDateTimeObject = () => {
	const cx = props.designer.labelSize.value.widthMm / 2 - 15;
	const cy = props.designer.labelSize.value.heightMm / 2 - 3;
	props.designer.addDateTime(cx, cy);
};

onMounted(() => {
	resetZoom();
});

onUnmounted(() => {
	document.removeEventListener("mousemove", onDragMove);
	document.removeEventListener("mouseup", onDragEnd);
	document.removeEventListener("mousemove", onResizeMove);
	document.removeEventListener("mouseup", onResizeEnd);
	document.removeEventListener("mousemove", onRotateMove);
	document.removeEventListener("mouseup", onRotateEnd);
});

watch(() => props.designer.labelSize.value, () => {
	resetZoom();
});
</script>

<style scoped>
.designer-root {
	display: flex;
	flex-direction: column;
	height: 100%;
	outline: none;
	user-select: none;
}

.designer-toolbar {
	flex-shrink: 0;
	border-bottom: 1px solid var(--pos-border-light, #e0e0e0);
	background: var(--pos-surface-variant, #fafafa);
}

.designer-scroll {
	flex-grow: 1;
	overflow: auto;
	display: flex;
	justify-content: center;
	background: var(--pos-background, #f0f0f0);
}

.designer-stage {
	position: relative;
}

.designer-canvas {
	position: relative;
}

.ruler-top {
	position: absolute;
	top: -15px;
	left: 15px;
	z-index: 10;
	pointer-events: none;
}

.ruler-left {
	position: absolute;
	top: 0;
	left: -15px;
	z-index: 10;
	pointer-events: none;
}

.grid-overlay {
	position: absolute;
	top: 0;
	left: 0;
	pointer-events: none;
	z-index: 1;
}

.designer-object {
	position: absolute;
	z-index: 2;
	outline: none;
	transition: outline 0.1s;
	box-sizing: border-box;
}

.designer-object.selected {
	outline: 1px dashed #1565c0;
	outline-offset: 1px;
}

.designer-object:hover {
	outline: 1px dashed rgba(21, 101, 192, 0.5);
	outline-offset: 1px;
}

.designer-text {
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.2;
}

.designer-barcode-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.barcode-visual {
	width: 100%;
}

.barcode-hr {
	font-size: 8px;
	font-family: monospace;
	text-align: center;
	color: #333;
	margin-top: 1px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	width: 100%;
}

.designer-shape {
	width: 100%;
	height: 100%;
	box-sizing: border-box;
}

.designer-line {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.designer-image {
	display: block;
}

.designer-empty-hint {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	color: #999;
	font-size: 13px;
	text-align: center;
	pointer-events: none;
}

.selection-handle {
	position: absolute;
	width: 7px;
	height: 7px;
	background: #1565c0;
	border: 1px solid #fff;
	z-index: 5;
}

.selection-handle.tl { top: -4px; left: -4px; cursor: nw-resize; }
.selection-handle.tr { top: -4px; right: -4px; cursor: ne-resize; }
.selection-handle.bl { bottom: -4px; left: -4px; cursor: sw-resize; }
.selection-handle.br { bottom: -4px; right: -4px; cursor: se-resize; }

.rotation-handle {
	position: absolute;
	top: -20px;
	left: 50%;
	margin-left: -6px;
	width: 12px;
	height: 12px;
	background: #4caf50;
	border: 2px solid #fff;
	border-radius: 50%;
	cursor: grab;
	z-index: 6;
	box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.rotation-handle:hover {
	background: #66bb6a;
	transform: scale(1.2);
}

.rotation-handle::after {
	content: "";
	position: absolute;
	top: -10px;
	left: 50%;
	margin-left: -0.5px;
	width: 1px;
	height: 10px;
	background: #4caf50;
}

.designer-toolbox {
	flex-shrink: 0;
	border-top: 1px solid var(--pos-border-light, #e0e0e0);
	background: var(--pos-surface-variant, #fafafa);
}
</style>
