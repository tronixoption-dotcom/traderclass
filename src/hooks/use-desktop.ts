import { useSyncExternalStore } from "react";

/** Matches Tailwind's `md` breakpoint, including narrow desktop previews. */
const QUERY = "(min-width: 768px)";

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
