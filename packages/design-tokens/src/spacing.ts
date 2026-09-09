export const space = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
} as const;

export const radii = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  pill: "999px",
} as const;

export const shadows = {
  card: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
  manuscript: "0 12px 40px rgba(0,0,0,0.35)",
  popover: "0 8px 30px rgba(0,0,0,0.25)",
} as const;

/** Minimum touch target size (WCAG 2.5.5 / platform HIGs). */
export const touchTarget = "44px";

export const motion = {
  fast: "120ms",
  base: "180ms",
  slow: "260ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const;
