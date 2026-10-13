import { useEffect, useState } from 'react';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// React state mirrored into localStorage so it survives reloads — the same
// idea as the jotai `atomWithStorage` atoms Mirai uses for its settings.
// `migrate` lets the caller repair or upgrade whatever was stored before.
export function useLocalStorage(key, initialValue, migrate = (value) => value) {
  const [value, setValue] = useState(() => migrate(read(key, initialValue)));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked (private mode); the app still works without it.
    }
  }, [key, value]);

  return [value, setValue];
}
