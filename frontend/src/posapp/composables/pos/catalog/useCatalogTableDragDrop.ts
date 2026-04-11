export function useItemsTableDragDrop(emit: any, eventBus: any) {
	const onDragOverFromSelector = (event: DragEvent) => {
		// Check if drag data is from item selector
		const dragData = event.dataTransfer?.types.includes("application/json");
		if (dragData) {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "copy";
			}
		}
	};

	const onDragEnterFromSelector = () => {
		emit("show-drop-feedback", true);
	};

	const onDragLeaveFromSelector = (event: DragEvent) => {
		// Only hide feedback if leaving the entire table area
		if (
			event.relatedTarget &&
			event.currentTarget &&
			!(event.currentTarget as Element).contains(
				event.relatedTarget as Node,
			)
		) {
			emit("show-drop-feedback", false);
		}
	};

	const onDropFromSelector = (event: DragEvent) => {
		event.preventDefault();

		try {
			const rawData = event.dataTransfer?.getData("application/json");
			if (!rawData) return;

			const dragData = JSON.parse(rawData);

			if (dragData.type === "item-from-selector") {
				// Using event bus to trigger logic-heavy add_item in Invoice.vue
				if (eventBus) {
					eventBus.emit("add_item", dragData.item);
				} else {
					// Fallback to prop if eventBus is missing
					emit("add-item", dragData.item);
				}
				emit("item-dropped", false);
			}
		} catch (error) {
			console.error("Error parsing drag data:", error);
		}
	};

	return {
		onDragOverFromSelector,
		onDragEnterFromSelector,
		onDragLeaveFromSelector,
		onDropFromSelector,
	};
}
