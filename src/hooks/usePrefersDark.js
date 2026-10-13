import { useEffect, useState } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

// Whether the operating system is in dark mode, updated live when it changes.
export function usePrefersDark() {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.(QUERY).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return undefined;
    const update = (event) => setPrefersDark(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return prefersDark;
}
