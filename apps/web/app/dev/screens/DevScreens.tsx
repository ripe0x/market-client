"use client";

import { useState } from "react";
import { parseEther } from "viem";
import type { ApiOrder } from "@market/protocol";
import { Chrome, MobileNav, BottomCta } from "@/components/chrome";
import { GiantTabs, Hero, Toolbar, SortOptions, ViewToggle, Segmented, InlineTabs, Button } from "@/components/ui";
import {
  ListingsTable,
  ListingsGrid,
  CollectionsTable,
  CollectionHeader,
  CollectionListingsTable,
  OffersTable,
  AcceptOffer,
  TokenDetail,
  CreateListingForm,
  MakeOfferForm,
  Positions,
  ApprovalsRow,
  AddFundsSheet,
  Loading,
  Empty,
  WrongNetwork,
  IndexerBehind,
  TxStatus,
  ErrorNote,
  type CreateListingValue,
  type MakeOfferValue,
} from "@/components/screens";
import * as fx from "./fixtures";
import styles from "./dev.module.css";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionLabel}>
        {id} — {title}
      </div>
      <div className={styles.frame}>{children}</div>
    </section>
  );
}

export function DevScreens() {
  const now = fx.NOW;
  const [addFunds, setAddFunds] = useState<ApiOrder | null>(null);

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>Market V1 — screen QA</h1>
      <p className={styles.sub}>Resize the viewport to 390 and 1440 to check both layouts.</p>

      <Section id="Chrome" title="TopBar / MobileHeader / MobileNav / BottomCta">
        <Chrome sellActive />
        <div className={styles.mobileNavDemo}>
          <MobileNav title="Sell to offer" leading="cancel" />
          <MobileNav title="Driftlines" backHref="#" />
        </div>
      </Section>

      <Section id="01" title="Marketplace · Listings (table)">
        <Hero>
          <GiantTabs tabs={[{ label: "Listings", href: "#", active: true }, { label: "Collections", href: "#" }]} />
        </Hero>
        <Toolbar
          left={
            <>
              <span className={styles.menu}>All collections ▾</span>
              <SortOptions options={[{ label: "Newest", active: true }, { label: "Price low" }, { label: "Price high" }]} />
            </>
          }
          right={<ViewToggle value="table" />}
        />
        <ListingsTable orders={fx.LISTINGS} now={now} moreLabel="Show 50 more" moreHref="#" />
      </Section>

      <Section id="01" title="Marketplace · Listings (grid)">
        <ListingsGrid orders={fx.LISTINGS} now={now} />
      </Section>

      <Section id="02" title="Marketplace · Collections">
        <Hero>
          <GiantTabs tabs={[{ label: "Listings", href: "#" }, { label: "Collections", href: "#", active: true }]} />
          <Segmented
            options={[{ value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }]}
            value="7d"
          />
        </Hero>
        <CollectionsTable
          collections={fx.COLLECTIONS}
          period="7d"
          ownersOf={(c) => fx.OWNERS[c.name ?? ""] ?? null}
          moreLabel="Show 50 more"
          moreHref="#"
        />
      </Section>

      <Section id="03" title="Collection · Listings">
        <CollectionHeader collection={fx.DRIFTLINES} royaltyBps={500} items={600} owners={512} />
        <Toolbar
          left={
            <>
              <InlineTabs tabs={[{ label: "Listings", count: 48, active: true }, { label: "Offers", count: 6, href: "#" }]} />
              <SortOptions options={[{ label: "Price low", active: true }, { label: "Price high" }, { label: "Newest" }]} />
            </>
          }
          right={
            <>
              <ViewToggle value="table" />
              <Button size="inline">Make offer</Button>
            </>
          }
        />
        <CollectionListingsTable orders={fx.COLLECTION_LISTINGS} now={now} moreLabel="Show 38 more" moreHref="#" />
      </Section>

      <Section id="04" title="Collection · Offers">
        <CollectionHeader collection={fx.DRIFTLINES} compact inWallet={2} />
        <Toolbar
          left={
            <>
              <InlineTabs tabs={[{ label: "Listings", count: 48, href: "#" }, { label: "Offers", count: 6, active: true }]} />
              <SortOptions options={[{ label: "Highest", active: true }, { label: "Expiring" }, { label: "Newest" }]} />
            </>
          }
          right={<Button size="inline">Make offer</Button>}
        />
        <OffersTable
          offers={fx.OFFERS}
          now={now}
          eligibleOf={(o) => !!o.anyToken}
          sellHrefOf={(o) => `/c/${o.nft}/offers/${o.address}/sell`}
          moreLabel="Show all"
          moreHref="#"
        />
      </Section>

      <Section id="04" title="Accept offer (panel / mobile page)">
        <AcceptOffer offer={fx.ACCEPT_OFFER} now={now} eligible={fx.ELIGIBLE} breakdown={fx.ACCEPT_BREAKDOWN} />
      </Section>

      <Section id="05" title="NFT detail">
        <TokenDetail
          nft={fx.DRIFTLINES.address}
          tokenId="212"
          collectionName="Driftlines"
          now={now}
          order={fx.DETAIL_ORDER}
          royaltyBps={500}
          offers={fx.TOKEN_OFFERS}
          moreFrom={fx.COLLECTION_LISTINGS}
          totalListed={48}
        />
      </Section>

      <Section id="05b" title="NFT detail — not listed">
        <TokenDetail nft={fx.DRIFTLINES.address} tokenId="999" collectionName="Driftlines" now={now} order={null} royaltyBps={500} />
      </Section>

      <Section id="06" title="Create listing">
        <CreateListingDemo />
      </Section>

      <Section id="07" title="Make offer (collection)">
        <MakeOfferDemo />
      </Section>

      <Section id="07b" title="Make offer (single NFT)">
        <MakeOfferSingleDemo />
      </Section>

      <Section id="08" title="Positions">
        <Positions
          viewer={fx.VIEWER}
          listings={fx.POS_LISTINGS}
          offers={fx.POS_OFFERS}
          activity={fx.POS_ACTIVITY}
          now={now}
          onAddFunds={(o) => setAddFunds(o)}
        />
        <ApprovalsRow
          items={[
            { label: "Approval for #305", onRemove: () => {} },
            { label: "Approval for all Driftlines", onRemove: () => {} },
          ]}
        />
        <AddFundsSheet open={!!addFunds} order={addFunds} suggested={parseEther("0.5")} onClose={() => setAddFunds(null)} />
      </Section>

      <Section id="States" title="Shared states">
        <IndexerBehind />
        <div className={styles.states}>
          <Loading />
          <Empty title="No listings yet" note="When sellers list tokens here, they appear in this table." />
          <WrongNetwork chainName="Sepolia" onSwitch={() => {}} />
          <div className={styles.txRow}>
            <TxStatus phase={{ kind: "confirm" }} />
            <TxStatus phase={{ kind: "pending", txUrl: "#" }} />
            <TxStatus phase={{ kind: "confirmed", note: "Bought for 1.42 ETH" }} />
            <TxStatus phase={{ kind: "failed", message: "The price rose before this confirmed. Nothing was bought.", onchain: true }} />
            <TxStatus phase={{ kind: "rejected" }} />
          </div>
          <ErrorNote emphasis>Expired 27 Oct. Cancel and withdraw to get #15 back.</ErrorNote>
        </div>
      </Section>

      <Section id="Mobile" title="BottomCta (visible < 768px)">
        <div style={{ minHeight: 80 }} />
        <BottomCta>
          <Button size="mobile" block>
            List #15
          </Button>
        </BottomCta>
      </Section>
    </div>
  );
}

function CreateListingDemo() {
  const [value, setValue] = useState<CreateListingValue>({
    startPrice: "1.50",
    changeOverTime: true,
    endPrice: "1.00",
    duration: "7D",
    expires: "Never",
    maxRoyaltyBps: 500,
  });
  return (
    <CreateListingForm
      now={fx.NOW}
      walletNfts={fx.WALLET_NFTS}
      value={value}
      onChange={setValue}
      breakdown={value.changeOverTime ? fx.CREATE_BREAKDOWN : { atStart: fx.CREATE_BREAKDOWN.atStart }}
      royaltyOptions={fx.ROYALTY_OPTIONS}
      collectionRoyaltyBps={500}
    />
  );
}

function MakeOfferDemo() {
  const [value, setValue] = useState<MakeOfferValue>({ amount: "0.58", quantity: 5, expires: "7D" });
  return (
    <MakeOfferForm
      collectionName="Driftlines"
      anyToken
      floor={parseEther("0.62")}
      listed={48}
      ladder={fx.OFFER_LADDER}
      value={value}
      onChange={setValue}
      walletBalance={parseEther("4.12")}
    />
  );
}

function MakeOfferSingleDemo() {
  const [value, setValue] = useState<MakeOfferValue>({ amount: "1.10", quantity: 1, expires: "3D" });
  return (
    <MakeOfferForm
      collectionName="Driftlines"
      anyToken={false}
      tokenId="212"
      single
      listingPrice={parseEther("1.42")}
      topOffer={parseEther("1.05")}
      value={value}
      onChange={setValue}
      walletBalance={parseEther("2.10")}
    />
  );
}
