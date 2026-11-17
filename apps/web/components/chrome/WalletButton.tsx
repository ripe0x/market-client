"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortAddress } from "@market/protocol";
import styles from "./WalletButton.module.css";

// 42px, bg #fff, text #000, mono 500 14px. Connected → links to /positions showing 0x7a…e41;
// disconnected → "Connect"; wrong network → "Wrong network" opening the chain modal (PLAN.md §9).
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div aria-hidden={!ready} className={ready ? undefined : styles.hidden}>
            {!connected ? (
              <button type="button" className={styles.button} onClick={openConnectModal} data-interactive>
                Connect
              </button>
            ) : chain.unsupported ? (
              <button type="button" className={styles.button} onClick={openChainModal} data-interactive>
                Wrong network
              </button>
            ) : (
              <Link href="/positions" className={styles.button} data-interactive>
                {shortAddress(account.address, 4, 3)}
              </Link>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
