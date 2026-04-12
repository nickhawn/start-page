export interface Debounced<Args extends unknown[]> {
	(...args: Args): void;
	cancel(): void;
}

export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	wait: number
): Debounced<Args> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const debounced = ((...args: Args) => {
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			fn(...args);
		}, wait);
	}) as Debounced<Args>;

	debounced.cancel = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	return debounced;
}
