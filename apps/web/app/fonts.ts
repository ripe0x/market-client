import { Archivo, JetBrains_Mono } from "next/font/google";

// Self-hosted at build (PLAN.md §9). Exposed as --font-ui / --font-mono (see tokens.css).
export const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-ui",
  display: "swap",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
