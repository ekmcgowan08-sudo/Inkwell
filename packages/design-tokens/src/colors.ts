/**
 * Inkwell color tokens.
 *
 * Source palette (from the prototype / product spec) is preserved verbatim for
 * "ink" (dark, the signature "writer's den" mode). The light palette is a new
 * derivation built to hit WCAG AA contrast against its own backgrounds while
 * keeping the same hues, since the spec only specified dark-mode values.
 */

export const brand = {
  inkNavy: "#1B1F2E",
  inkSoft: "#252B3D",
  parchment: "#F3EEDF",
  burgundy: "#8B3A3A",
  burgundyLight: "#A9524F",
  gold: "#C9A227",
  slate: "#8891A6",
  cream: "#FAF8F3",
} as const;

/** Dark theme — "Writer's Den" (default). */
export const darkTheme = {
  bg: brand.inkNavy,
  bgElevated: brand.inkSoft,
  bgSunken: "#15182280",
  surfaceManuscript: brand.parchment,
  surfaceManuscriptText: "#2A2318",
  textPrimary: brand.cream,
  textSecondary: brand.slate,
  textOnPrimary: brand.cream,
  primary: brand.burgundy,
  primaryHover: brand.burgundyLight,
  accent: brand.gold,
  accentText: "#241C04",
  border: "#333A4F",
  borderStrong: "#4A5270",
  danger: "#C24545",
  dangerBg: "#3A1F22",
  success: "#4F9D6E",
  successBg: "#173025",
  warning: "#C9A227",
  warningBg: "#332B10",
  focusRing: brand.gold,
  scrollbarThumb: "#3A4260",
} as const;

/** Light theme — full parity feature set, not an afterthought. */
export const lightTheme = {
  bg: "#FBF9F4",
  bgElevated: "#FFFFFF",
  bgSunken: "#ECE6D8",
  surfaceManuscript: brand.parchment,
  surfaceManuscriptText: "#2A2318",
  textPrimary: "#211D2B",
  textSecondary: "#5B5F72",
  textOnPrimary: brand.cream,
  primary: brand.burgundy,
  primaryHover: "#7A3232",
  accent: "#8C6B10",
  accentText: "#FFFFFF",
  border: "#DED6C2",
  borderStrong: "#C7BCA0",
  danger: "#9C2E2E",
  dangerBg: "#FBEAEA",
  success: "#2F7A4F",
  successBg: "#EAF6EE",
  warning: "#8C6B10",
  warningBg: "#FBF2D9",
  focusRing: brand.burgundy,
  scrollbarThumb: "#D3C9AF",
} as const;

export type ThemeTokens = { [K in keyof typeof darkTheme]: string };
export type ThemeName = "dark" | "light";

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
};
