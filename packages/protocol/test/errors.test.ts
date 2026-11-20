import { describe, expect, it } from "vitest";
import { decodeRevert, revertCopy } from "../src/errors";

describe("decodeRevert", () => {
  it("reads a decoded contract error", () => {
    const err = { name: "X", cause: { name: "ContractFunctionRevertedError", data: { errorName: "AboveMaxPrice", args: [1n, 2n] } } };
    expect(decodeRevert(err)).toEqual({ name: "AboveMaxPrice", args: [1n, 2n] });
  });
  it("detects a user rejection", () => {
    expect(decodeRevert({ name: "UserRejectedRequestError" })).toEqual({ name: "UserRejected" });
    expect(decodeRevert(new Error("User rejected the request"))).toEqual({ name: "UserRejected" });
  });
  it("falls back to Unknown", () => {
    expect(decodeRevert(new Error("boom")).name).toBe("Unknown");
  });
});

describe("revertCopy", () => {
  it("returns null for a wallet rejection", () => {
    expect(revertCopy({ name: "UserRejected" }, { kind: "sale" })).toBeNull();
  });
  it("names the capped-royalty block for a buyer", () => {
    expect(revertCopy({ name: "RoyaltyAboveLimit", args: [] }, { kind: "sale" })).toMatch(/royalty is above/i);
  });
  it("directs bid approval to ExchangeAction", () => {
    expect(revertCopy({ name: "ERC721InsufficientApproval", args: [] }, { kind: "bid", token: "#7" })).toMatch(/ExchangeAction/);
  });
  it("explains WrongPayment with the exact price", () => {
    expect(revertCopy({ name: "WrongPayment", args: [10n ** 18n, 0n] }, { kind: "covered" })).toMatch(/exact price/i);
  });
  it("has a safe default", () => {
    expect(revertCopy({ name: "SomethingNew", args: [] }, { kind: "sale" })).toMatch(/would fail/i);
  });
});
