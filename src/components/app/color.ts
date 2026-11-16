/** Resolves a CSS color token (any format, incl. oklch) to rgba() for canvas libraries. */
export function resolveToken(name: string, alpha = 1): string {
  if (typeof document === "undefined") return "rgba(0,0,0,1)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx || !raw) return "rgba(0,0,0,1)";
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${alpha})`;
}
