export const slushieTheme = {
  colors: {
    primary: "#DC2626",       // cherry red
    secondary: "#3B5BDB",     // berry blue
    background: "#F8FAFC",    // arctic white
    foreground: "#1e293b",
    muted: "#94a3b8",
    gradientStart: "#FEE2E2", // red
    gradientMid: "#EDE9FE",   // purple
    gradientEnd: "#DBEAFE",   // blue
  },
  fonts: {
    primary: "'Inter', sans-serif",
  },
} as const;

export type SlushieTheme = typeof slushieTheme;
