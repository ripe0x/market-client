import { describe, expect, it } from "vitest";
import { decodeAbiParameters, getAddress, type Address } from "viem";
import {
  Admission, Side, decodeExchangeConfig, encodeExchangeConfig, decodeCoveredConfig, encodeCoveredConfig,
  decodeReservedConfig, encodeReservedConfig, saleInput, bidInput, coveredInput, scheduleParam, exchangeConfigParam,
} from "../src/config";
import * as tx from "../src/tx";
import type { Deployment } from "../src/addresses";

const A = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`) as Address;
const d = { exchange: A(0xe), coveredNFTPurchase: A(0xc), reservedAction: A(0x5) } as unknown as Deployment;
const sched = { startPrice: 10n ** 18n, endPrice: 5n * 10n ** 17n, startTime: 100n, endTime: 200n };

describe("exchange config round-trips", () => {
  it("sale config survives encode/decode", () => {
    const spec = tx.saleSpec(d, { issuer: A(1), nft: A(2), tokenId: 7n, schedule: sched, proceedsTo: A(3), maxRoyaltyBps: 500 });
    expect(spec.action).toBe(d.exchange);
    expect(spec.admission).toBe(Admission.Public);
    expect(spec.residual).toBe(A(1));
    const c = decodeExchangeConfig(spec.config);
    expect(c.side).toBe(Side.Sale);
    expect(c.nft).toBe(A(2));
    expect(c.schedule.startPrice).toBe(sched.startPrice);
    const terms = decodeAbiParameters([{ type: "tuple", components: [{ name: "tokenId", type: "uint256" }, { name: "proceedsTo", type: "address" }, { name: "maxRoyaltyBps", type: "uint16" }] }], c.terms)[0] as { tokenId: bigint; proceedsTo: Address; maxRoyaltyBps: number };
    expect(terms.tokenId).toBe(7n);
    expect(terms.maxRoyaltyBps).toBe(500);
  });

  it("bid config survives encode/decode", () => {
    const spec = tx.bidSpec(d, { issuer: A(1), nft: A(2), schedule: sched, recipient: A(1), anyToken: false, tokenId: 9n, maxExecutions: 3n });
    const c = decodeExchangeConfig(spec.config);
    expect(c.side).toBe(Side.Bid);
  });

  it("the config schedule shape matches the ABI-derived schedule", () => {
    const schedComp = (exchangeConfigParam.components.find((x) => x.name === "schedule") as { components: readonly unknown[] }).components;
    expect(JSON.stringify(schedComp)).toBe(JSON.stringify(scheduleParam.components));
  });
});

describe("covered/reserved round-trips", () => {
  it("covered", () => {
    const c = { nft: A(2), tokenId: 1n, price: 10n ** 17n, proceedsTo: A(3), maxRoyaltyBps: 250 };
    expect(decodeCoveredConfig(encodeCoveredConfig(c))).toEqual(c);
  });
  it("reserved", () => {
    const c = { target: A(4), operation: "0xdeadbeef" as const, price: 10n ** 17n, targetValue: 10n ** 16n, proceedsTo: A(3) };
    expect(decodeReservedConfig(encodeReservedConfig(c))).toEqual(c);
  });
});

describe("execution inputs", () => {
  it("sale/bid/covered inputs decode", () => {
    expect(decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }], saleInput(A(3), 5n, 9n))).toEqual([A(3), 5n, 9n]);
    expect(decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "address" }], bidInput(1n, 2n, A(3)))).toEqual([1n, 2n, A(3)]);
    expect(decodeAbiParameters([{ type: "address" }], coveredInput(A(3)))).toEqual([A(3)]);
  });
});

describe("preset validation (trust boundary)", () => {
  it("rejects a collection-wide bid that also names a token", () => {
    expect(() => tx.bidSpec(d, { issuer: A(1), nft: A(2), schedule: sched, recipient: A(1), anyToken: true, tokenId: 5n, maxExecutions: 1n })).toThrow(/collection-wide/i);
  });
  it("requires minActionTimeLeft 0 for an ordinary NFT bid", () => {
    expect(() => tx.bidSpec(d, { issuer: A(1), nft: A(2), schedule: sched, recipient: A(1), anyToken: false, tokenId: 5n, maxExecutions: 1n, minActionTimeLeft: 60n })).toThrow(/minActionTimeLeft/i);
  });
  it("forbids collection-wide bids on Actions tokens", () => {
    expect(() => tx.bidSpec(d, { issuer: A(1), nft: A(2), schedule: sched, recipient: A(1), anyToken: true, maxExecutions: 1n, isActionsCollection: true })).toThrow(/Actions/i);
  });
  it("rejects an invalid time window", () => {
    expect(() => tx.saleSpec(d, { issuer: A(1), nft: A(2), tokenId: 1n, schedule: { ...sched, startTime: 300n, endTime: 200n }, proceedsTo: A(3), maxRoyaltyBps: 0 })).toThrow(/ends before/i);
  });
  it("rejects an empty reserved operation", () => {
    expect(() => tx.reservedSpec(d, { issuer: A(1), target: A(4), operation: "0x", price: 1n, targetValue: 0n, proceedsTo: A(3) })).toThrow(/empty/i);
  });
  it("rejects targetValue above price", () => {
    expect(() => tx.reservedSpec(d, { issuer: A(1), target: A(4), operation: "0xaa", price: 1n, targetValue: 2n, proceedsTo: A(3) })).toThrow(/targetValue/i);
  });
});
