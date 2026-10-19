/**
 * Debounce Utilities
 * High-performance debouncing for expensive operations
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @param options.leading Execute on the leading edge of the timeout
 * @param options.trailing Execute on the trailing edge of the timeout
 * @returns Debounced function with cancel method
 *
 * @example
 * const debouncedSearch = debounce((query: string) => {
 *   api.search(query);
 * }, 300);
 *
 * // Usage
 * debouncedSearch('hello'); // Will only execute after 300ms of no calls
 * debouncedSearch.cancel(); // Cancel pending execution
 */
export function debounce<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = { trailing: true },
): ((this: This, ...args: Args) => R | undefined) & {
  cancel: () => void;
  flush: () => R | undefined;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  // A pending call is marked by its arguments. `this` is undefined for a plain
  // (non-method) call in strict mode, so it cannot mark one.
  let lastArgs: Args | null = null;
  let lastThis: This | undefined;
  let result: R | undefined;

  const { leading = false, trailing = true } = options;

  function invokeFunc() {
    if (lastArgs) {
      const args = lastArgs;
      const thisArg = lastThis as This;
      lastArgs = null;
      lastThis = undefined;
      result = func.apply(thisArg, args);
    }
  }

  function cancel() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastThis = undefined;
  }

  function flush() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      invokeFunc();
    }
    return result;
  }

  function debounced(this: This, ...args: Args) {
    lastArgs = args;
    lastThis = this;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (leading && timeoutId === null) {
      invokeFunc();
    }

    timeoutId = setTimeout(() => {
      if (trailing) {
        invokeFunc();
      }
      timeoutId = null;
    }, wait);

    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;

  return debounced;
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 *
 * @param func The function to throttle
 * @param wait The number of milliseconds to throttle invocations to
 * @returns Throttled function with cancel method
 *
 * @example
 * const throttledScroll = throttle((event) => {
 *   console.log('Scroll position:', event.scrollY);
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle<This, Args extends unknown[]>(
  func: (this: This, ...args: Args) => unknown,
  wait: number,
): ((this: This, ...args: Args) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastRan: number = 0;
  let lastArgs: Args | null = null;
  let lastThis: This | undefined;

  function cancel() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function throttled(this: This, ...args: Args) {
    const now = Date.now();
    lastArgs = args;
    lastThis = this;

    if (!lastRan) {
      func.apply(this, args);
      lastRan = now;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(
        () => {
          if (Date.now() - lastRan >= wait && lastArgs) {
            func.apply(lastThis as This, lastArgs);
            lastRan = Date.now();
          }
        },
        wait - (now - lastRan),
      );
    }
  }

  throttled.cancel = cancel;

  return throttled;
}

/**
 * Request Animation Frame based debounce for visual updates
 * More efficient than setTimeout for UI updates
 *
 * @param func The function to debounce
 * @returns Debounced function with cancel method
 *
 * @example
 * const debouncedUpdate = rafDebounce(() => {
 *   updateUI();
 * });
 */
export function rafDebounce<This, Args extends unknown[]>(
  func: (this: This, ...args: Args) => unknown,
): ((this: This, ...args: Args) => void) & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Args | null = null;
  let lastThis: This | undefined;

  function cancel() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
    lastThis = undefined;
  }

  function debounced(this: This, ...args: Args) {
    lastArgs = args;
    lastThis = this;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      if (lastArgs) {
        func.apply(lastThis as This, lastArgs);
      }
      rafId = null;
      lastArgs = null;
      lastThis = undefined;
    });
  }

  debounced.cancel = cancel;

  return debounced;
}
