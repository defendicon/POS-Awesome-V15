import stockCoordinator from "../../../utils/stockCoordinator";

export function useInvoiceStock(
	items: any,
	packed_items: any,
	eventBus: any,
	forceUpdate: (() => void) | null,
) {
	const applyStockStateToInvoiceItems = (codes: unknown = null) => {
		const collections: any[][] = [];
		if (Array.isArray(items.value)) {
			collections.push(items.value);
		}
		if (Array.isArray(packed_items.value)) {
			collections.push(packed_items.value);
		}
		if (!collections.length) {
			return;
		}
		const codesSet = (() => {
			if (codes === null) {
				return null;
			}
			const iterableCandidate = codes as any;
			const iterable = Array.isArray(codes)
				? codes
				: codes instanceof Set ||
					  (codes &&
							typeof iterableCandidate[Symbol.iterator] ===
								"function")
					? Array.from(iterableCandidate)
					: [codes];
			return new Set(
				iterable
					.map((code) =>
						code !== undefined && code !== null
							? String(code).trim()
							: "",
					)
					.filter(Boolean),
			);
		})();

		collections.forEach((collection) => {
			stockCoordinator.applyAvailabilityToCollection(
				collection,
				codesSet,
				{
					updateBaseAvailable: false,
				},
			);
		});

		if (forceUpdate) forceUpdate();
	};

	const emitCartQuantities = () => {
		const totals: Record<string, number> = {};
		const normalizeNumber = (value: unknown) => {
			const num = Number(value);
			return Number.isFinite(num) ? num : null;
		};
		const accumulate = (line: any) => {
			if (!line || !line.item_code) {
				return;
			}

			const code = String(line.item_code).trim();
			if (!code) {
				return;
			}

			let stockQty = normalizeNumber(line.stock_qty);
			if (stockQty === null) {
				const qty = normalizeNumber(line.qty);
				if (qty !== null) {
					const conversion = normalizeNumber(line.conversion_factor);
					const factor =
						conversion !== null && conversion !== 0
							? conversion
							: 1;
					stockQty = qty * factor;
				}
			}

			if (stockQty === null) {
				return;
			}

			const positiveQty = Math.max(0, stockQty);
			if (!positiveQty) {
				return;
			}

			totals[code] = (totals[code] || 0) + positiveQty;
		};

		(Array.isArray(items.value) ? items.value : []).forEach(accumulate);
		(Array.isArray(packed_items.value) ? packed_items.value : []).forEach(
			accumulate,
		);

		const impacted = stockCoordinator.updateReservations(totals, {
			source: "invoice",
		});
		if (impacted.length) {
			applyStockStateToInvoiceItems(impacted);
		}

		if (eventBus) {
			eventBus.emit("cart_quantities_updated", totals);
		}
	};

	const primeInvoiceStockState = (source = "invoice") => {
		const baseItems: any[] = [];
		if (Array.isArray(items.value)) {
			baseItems.push(...items.value);
		}
		if (Array.isArray(packed_items.value)) {
			baseItems.push(...packed_items.value);
		}
		if (!baseItems.length) {
			return;
		}

		stockCoordinator.primeFromItems(baseItems, { silent: true, source });
		const codes = baseItems
			.map((item) =>
				item && item.item_code !== undefined
					? String(item.item_code).trim()
					: null,
			)
			.filter(Boolean);
		applyStockStateToInvoiceItems(codes);
	};

	const handleStockCoordinatorUpdate = (event: any = {}) => {
		const codes = Array.isArray(event.codes) ? event.codes : [];
		if (!codes.length) {
			return;
		}
		applyStockStateToInvoiceItems(codes);
	};

	return {
		emitCartQuantities,
		applyStockStateToInvoiceItems,
		primeInvoiceStockState,
		handleStockCoordinatorUpdate,
	};
}
