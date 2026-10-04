import "@testing-library/jest-dom/vitest";

class ResizeObserverMock implements ResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		void callback;
	}

	disconnect() { }

	observe(target: Element) {
		void target;
	}

	unobserve(target: Element) {
		void target;
	}
}

Object.defineProperty(globalThis, "ResizeObserver", {
	writable: true,
	value: ResizeObserverMock,
});

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	}),
});
