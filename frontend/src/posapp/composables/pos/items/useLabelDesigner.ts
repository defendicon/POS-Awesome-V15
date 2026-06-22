import { ref, computed, reactive } from "vue";

const generateId = (): string => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return generateId();
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

export type LabelObjectType = "text" | "barcode" | "image" | "shape" | "line";

export interface LabelObject {
	id: string;
	type: LabelObjectType;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	content: string;
	fontFamily?: string;
	fontSize?: number;
	fontBold?: boolean;
	fontItalic?: boolean;
	textAlign?: "left" | "center" | "right";
	color?: string;
	backgroundColor?: string;
	borderColor?: string;
	borderWidth?: number;
	symbology?: string;
	humanReadable?: boolean;
	shapeType?: "rect" | "ellipse";
	lineDirection?: "horizontal" | "vertical";
	imageSrc?: string;
	imageId?: string;
	hidden?: boolean;
	condition?: string;
	dateFormat?: string;
	fontUnderline?: boolean;
}

export interface LabelSize {
	widthMm: number;
	heightMm: number;
}

export interface LabelDesignerState {
	objects: LabelObject[];
	labelSize: LabelSize;
	zoom: number;
	selectedId: string | null;
	gridEnabled: boolean;
	gridSize: number;
	snapEnabled: boolean;
}

export function useLabelDesigner() {
	const objects = ref<LabelObject[]>([]);
	const selectedId = ref<string | null>(null);
	const labelSize = ref<LabelSize>({ widthMm: 100, heightMm: 75 });
	const zoom = ref(1);
	const gridEnabled = ref(true);
	const gridSize = ref(5);
	const snapEnabled = ref(true);
	const isDragging = ref(false);
	const dragOffset = reactive({ x: 0, y: 0 });
	const clipboard = ref<LabelObject | null>(null);

	const history = ref<LabelObject[][]>([]);
	const historyIndex = ref(-1);

	const selectedObject = computed(() => {
		if (!selectedId.value) return null;
		return objects.value.find((o) => o.id === selectedId.value) || null;
	});

	const canUndo = computed(() => historyIndex.value > 0);
	const canRedo = computed(() => historyIndex.value < history.value.length - 1);

	const pushHistory = () => {
		history.value = history.value.slice(0, historyIndex.value + 1);
		history.value.push(JSON.parse(JSON.stringify(objects.value)));
		if (history.value.length > 50) history.value.shift();
		historyIndex.value = history.value.length - 1;
	};

	const addObject = (obj: Omit<LabelObject, "id">) => {
		const newObj: LabelObject = { ...obj, id: generateId() };
		objects.value.push(newObj);
		selectedId.value = newObj.id;
		pushHistory();
		return newObj;
	};

	const updateObject = (id: string, updates: Partial<LabelObject>) => {
		const idx = objects.value.findIndex((o) => o.id === id);
		if (idx >= 0) {
			objects.value[idx] = { ...objects.value[idx], ...updates } as LabelObject;
			pushHistory();
		}
	};

	const removeSelected = () => {
		if (!selectedId.value) return;
		objects.value = objects.value.filter((o) => o.id !== selectedId.value);
		selectedId.value = null;
		pushHistory();
	};

	const duplicateSelected = () => {
		if (!selectedId.value) return;
		const src = objects.value.find((o) => o.id === selectedId.value);
		if (!src) return;
		const copy: LabelObject = {
			...JSON.parse(JSON.stringify(src)),
			id: generateId(),
			x: src.x + 5,
			y: src.y + 5,
		};
		objects.value.push(copy);
		selectedId.value = copy.id;
		pushHistory();
	};

	const moveObject = (id: string, dx: number, dy: number) => {
		const obj = objects.value.find((o) => o.id === id);
		if (!obj) return;
		let newX = obj.x + dx;
		let newY = obj.y + dy;
		if (snapEnabled.value) {
			newX = Math.round(newX / gridSize.value) * gridSize.value;
			newY = Math.round(newY / gridSize.value) * gridSize.value;
		}
		newX = Math.max(0, Math.min(newX, labelSize.value.widthMm - 5));
		newY = Math.max(0, Math.min(newY, labelSize.value.heightMm - 5));
		obj.x = newX;
		obj.y = newY;
	};

	const moveObjectDelta = (id: string, dxMm: number, dyMm: number) => {
		moveObject(id, dxMm, dyMm);
	};

	const resizeObject = (id: string, dw: number, dh: number) => {
		const obj = objects.value.find((o) => o.id === id);
		if (!obj) return;
		obj.width = Math.max(3, obj.width + dw);
		obj.height = Math.max(3, obj.height + dh);
	};

	const selectObject = (id: string | null) => {
		selectedId.value = id;
	};

	const selectNext = () => {
		if (!objects.value.length) return;
		const idx = selectedId.value
			? objects.value.findIndex((o) => o.id === selectedId.value)
			: -1;
		const next = (idx + 1) % objects.value.length;
		selectedId.value = objects.value[next]!.id;
	};

	const bringForward = () => {
		if (!selectedId.value) return;
		const idx = objects.value.findIndex((o) => o.id === selectedId.value);
		if (idx < objects.value.length - 1) {
			[objects.value[idx], objects.value[idx + 1]] = [
				objects.value[idx + 1]!,
				objects.value[idx]!,
			];
			reindexZ();
			pushHistory();
		}
	};

	const sendBackward = () => {
		if (!selectedId.value) return;
		const idx = objects.value.findIndex((o) => o.id === selectedId.value);
		if (idx > 0) {
			[objects.value[idx], objects.value[idx - 1]] = [
				objects.value[idx - 1]!,
				objects.value[idx]!,
			];
			reindexZ();
			pushHistory();
		}
	};

	const reindexZ = () => {
		objects.value.forEach((o, i) => {
			o.zIndex = i;
		});
	};

	const undo = () => {
		if (historyIndex.value <= 0) return;
		historyIndex.value--;
		objects.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]));
	};

	const redo = () => {
		if (historyIndex.value >= history.value.length - 1) return;
		historyIndex.value++;
		objects.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]));
	};

	const clearAll = () => {
		objects.value = [];
		selectedId.value = null;
		pushHistory();
	};

	const copySelected = () => {
		if (!selectedId.value) return;
		const src = objects.value.find((o) => o.id === selectedId.value);
		if (src) clipboard.value = JSON.parse(JSON.stringify(src));
	};

	const pasteClipboard = () => {
		if (!clipboard.value) return;
		const copy: LabelObject = {
			...JSON.parse(JSON.stringify(clipboard.value)),
			id: generateId(),
			x: clipboard.value.x + 10,
			y: clipboard.value.y + 10,
		};
		objects.value.push(copy);
		selectedId.value = copy.id;
		pushHistory();
	};

	const setLabelSize = (w: number, h: number) => {
		labelSize.value = { widthMm: w, heightMm: h };
	};

	const exportLayout = (): string => {
		return JSON.stringify(objects.value, null, 2);
	};

	const importLayout = (json: string) => {
		try {
			const parsed = JSON.parse(json) as LabelObject[];
			if (!Array.isArray(parsed)) throw new Error("Invalid layout");
			parsed.forEach((o) => {
				if (!o.id) o.id = generateId();
			});
			objects.value = parsed;
			selectedId.value = null;
			pushHistory();
			return true;
		} catch {
			return false;
		}
	};

	const addText = (x: number, y: number, content?: string) => {
		return addObject({
			type: "text",
			x,
			y,
			width: 30,
			height: 6,
			rotation: 0,
			zIndex: objects.value.length,
			content: content || "Text",
			fontFamily: "Arial",
			fontSize: 8,
			fontBold: false,
			fontItalic: false,
			textAlign: "left",
			color: "#000000",
		});
	};

	const addBarcode = (x: number, y: number, content?: string) => {
		return addObject({
			type: "barcode",
			x,
			y,
			width: 50,
			height: 20,
			rotation: 0,
			zIndex: objects.value.length,
			content: content || "{barcode}",
			symbology: "CODE128",
			humanReadable: true,
		});
	};

	const addRectangle = (x: number, y: number) => {
		return addObject({
			type: "shape",
			x,
			y,
			width: 40,
			height: 20,
			rotation: 0,
			zIndex: objects.value.length,
			content: "",
			shapeType: "rect",
			borderColor: "#000000",
			borderWidth: 0.5,
			color: "transparent",
		});
	};

	const addLine = (x: number, y: number, direction: "horizontal" | "vertical") => {
		return addObject({
			type: "line",
			x,
			y,
			width: direction === "horizontal" ? 50 : 0,
			height: direction === "vertical" ? 50 : 0,
			rotation: 0,
			zIndex: objects.value.length,
			content: "",
			lineDirection: direction,
			borderColor: "#000000",
			borderWidth: 0.5,
		});
	};

	const addDateTime = (x: number, y: number, dateFormat?: string) => {
		return addObject({
			type: "text",
			x,
			y,
			width: 30,
			height: 6,
			rotation: 0,
			zIndex: objects.value.length,
			content: dateFormat ? `{date:${dateFormat}}` : "{date}",
			fontFamily: "Arial",
			fontSize: 8,
			fontBold: false,
			fontItalic: false,
			textAlign: "left",
			color: "#000000",
			dateFormat: dateFormat || "YYYY-MM-DD",
		});
	};

	const addImage = (x: number, y: number, imageSrc: string, imageId: string) => {
		return addObject({
			type: "image",
			x,
			y,
			width: 30,
			height: 15,
			rotation: 0,
			zIndex: objects.value.length,
			content: "",
			imageSrc,
			imageId,
		});
	};

	return {
		objects,
		selectedId,
		selectedObject,
		labelSize,
		zoom,
		gridEnabled,
		gridSize,
		snapEnabled,
		isDragging,
		dragOffset,
		history,
		historyIndex,
		canUndo,
		canRedo,

		addObject,
		updateObject,
		removeSelected,
		duplicateSelected,
		moveObject,
		moveObjectDelta,
		resizeObject,
		selectObject,
		selectNext,
		bringForward,
		sendBackward,
		undo,
		redo,
		clearAll,
		copySelected,
		pasteClipboard,
		setLabelSize,
		exportLayout,
		importLayout,

		addText,
		addBarcode,
		addRectangle,
		addLine,
		addImage,
		addDateTime,
	};
}
