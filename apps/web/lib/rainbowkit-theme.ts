import { darkTheme, type Theme } from "@rainbow-me/rainbowkit";

// Monochrome Square (PLAN.md §9 / STYLE_GUIDE): white accent, black modal, hairline borders, no
// shadows or blur, square corners.
const base = darkTheme({
  accentColor: "#fff",
  accentColorForeground: "#000",
  borderRadius: "none",
  overlayBlur: "none",
  fontStack: "system",
});

export const marketRainbowTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "#000",
    modalBorder: "#262626",
    generalBorder: "#333",
    actionButtonSecondaryBackground: "transparent",
    connectButtonBackground: "#fff",
    connectButtonText: "#000",
    profileForeground: "#000",
    menuItemBackground: "#0d0d0d",
  },
  shadows: {
    connectButton: "none",
    dialog: "none",
    profileDetailsAction: "none",
    selectedOption: "none",
    selectedWallet: "none",
    walletLogo: "none",
  },
  fonts: {
    body: "var(--font-ui), system-ui, sans-serif",
  },
};
