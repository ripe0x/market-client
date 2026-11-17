import type { Metadata } from "next";
import { headers } from "next/headers";
import { archivo, jetBrainsMono } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market",
  description: "Trade ERC721 NFTs for ETH on the Market protocol.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The nonce set in middleware; passed to Providers so wagmi/RainbowKit style/script tags carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${archivo.variable} ${jetBrainsMono.variable}`}>
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
