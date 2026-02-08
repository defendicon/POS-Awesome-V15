export function useItemTasks() {
	const runAsyncTask = (
		task: (() => unknown) | null | undefined,
		contextLabel?: string,
	) => {
		Promise.resolve().then(() => {
			try {
				const result: any = typeof task === "function" ? task() : null;
				if (result && typeof result.then === "function") {
					result.catch((error) => {
						console.error(
							`Async task failed${contextLabel ? ` (${contextLabel})` : ""}:`,
							error,
						);
					});
				}
			} catch (error) {
				console.error(
					`Async task threw synchronously${contextLabel ? ` (${contextLabel})` : ""}:`,
					error,
				);
			}
		});
	};

	const scheduleItemTask = (
		context: any,
		item: any,
		taskName: string,
		task: (() => unknown) | null | undefined,
		contextLabel?: string,
	) => {
		runAsyncTask(() => {
			if (
				item?.posa_row_id &&
				typeof context?.getItemTaskPromise === "function"
			) {
				const existing = context.getItemTaskPromise(
					item.posa_row_id,
					taskName,
				);
				if (existing) {
					return existing;
				}
			}
			return typeof task === "function" ? task() : null;
		}, contextLabel);
	};

	return {
		runAsyncTask,
		scheduleItemTask,
	};
}
