import { useState, useEffect } from 'react';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** < 768px */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** < 1024px (inclut tablette) */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
