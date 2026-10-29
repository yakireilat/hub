/** Design tokens — the only source of colour, type and spacing for the hub. */

export const color = {
  dark: {
    ground: "#0D0E11",
    rail: "#0F1014",
    surface: "#16181D",
    raised: "#1D2027",
    border: "#2A2E37",
    divider: "#23262E",
    text: "#ECEDEF",
    textSoft: "#C9CCD2",
    muted: "#9AA0AB",
    accent: "#F0B44C",
    accentSoft: "#F7CB7A",
    onAccent: "#0D0E11",
  },
  light: {
    ground: "#F7F7F5",
    rail: "#EFEFEC",
    surface: "#FFFFFF",
    raised: "#F1F1EE",
    border: "#DCDCD6",
    divider: "#E6E6E1",
    text: "#16171A",
    textSoft: "#33363D",
    muted: "#5E636D",
    accent: "#9A6200",
    accentSoft: "#7A4D00",
    onAccent: "#FFFFFF",
  },
} as const;

/** Status colours. Always shown with a shape and a word, never alone. */
export const status = {
  dark: { up: "#5BC58E", slow: "#F0B44C", failed: "#F2797A", info: "#7AA7F5", idle: "#9AA0AB" },
  light: { up: "#1E7A4C", slow: "#8F5A00", failed: "#B42828", info: "#2459B8", idle: "#5E636D" },
} as const;

export const font = {
  sans: "Geist, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

/** 4 px base spacing scale. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32 } as const;

export const radius = { sm: 8, md: 10, lg: 12, pill: 999 } as const;

/** Minimum touch target, px. */
export const touch = 44;

export type ThemeName = keyof typeof color;
