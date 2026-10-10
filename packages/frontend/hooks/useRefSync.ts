import { useRef, useEffect } from 'react';

/**
 * Custom hook to keep refs in sync with state values
 * Useful for accessing the latest state values in async callbacks or timeouts
 */
export const useRefSync = <T>(value: T) => {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
};

/**
 * Sync multiple values to refs at once
 * Returns an object with all the refs
 */
export const useMultiRefSync = <T extends Record<string, unknown>>(
  values: T,
): { [K in keyof T]: React.MutableRefObject<T[K]> } => {
  const refs = {} as { [K in keyof T]: React.MutableRefObject<T[K]> };

  for (const key in values) {
    // biome-ignore lint/correctness/useHookAtTopLevel: the loop runs over the keys of `values`, so the hook count is stable as long as callers pass the same keys every render
    refs[key] = useRefSync(values[key]);
  }

  return refs;
};
