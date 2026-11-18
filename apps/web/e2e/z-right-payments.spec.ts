import { test, expect } from "@playwright/test";
import { createTestClient, decodeEventLog, getAbiItem, http, parseEther, type Address } from "viem";
import { encodeCoveredConfig, marketAbi, randomSalt, rightAbi, rightsTx, tx, verifyRightDeposit, type ContractCall } from "@market/protocol";
import { artifacts } from "@market/protocol/devchain";
import { injectWallet, RPC } from "./wallet";
import { ACC, D, chain, collections, connect, mint, pub, waitFor, wallet } from "./helpers";

async function send(from: Address, call: ContractCall) {
  const hash = await wallet(from).writeContract({ ...call, account: from, chain } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
}

test("manual release beneficiary never redirects your default withdrawal when the indexer is unavailable", async ({ page }, info) => {
  const { driftlines: nft } = await collections();
  const id = await mint(nft, ACC.me);
  const price = parseEther("1");
  const [royaltyTo, royalty] = await pub.readContract({ address: nft, abi: artifacts.TestNFT.abi, functionName: "royaltyInfo", args: [id, price] }) as [Address, bigint];
  expect(royaltyTo.toLowerCase()).not.toBe(ACC.me.toLowerCase());
  expect(royalty).toBe(parseEther("0.05"));
  const deadline = (await pub.getBlock()).timestamp + 7n * 86400n;
  const config = { nft, tokenId: id, price, proceedsTo: ACC.me, maxRoyaltyBps: 500 };
  const bytes = encodeCoveredConfig(config);
  const created = await send(ACC.me, rightsTx.createRight(D, config, deadline, ACC.me, randomSalt()));
  const event = created.logs.map(log => {
    try { return decodeEventLog({ abi: marketAbi, ...log }); } catch { return null; }
  }).find(event => event?.eventName === "RightCreated");
  if (!event || event.eventName !== "RightCreated") throw new Error("Missing canonical right creation event");
  const account = event.args.account;
  await verifyRightDeposit(pub, D, account, ACC.me, config, deadline);
  await send(ACC.me, tx.depositNft(nft, ACC.me, account, id));
  await send(ACC.me, rightsTx.activateRight(account, bytes));
  await send(ACC.me, rightsTx.exerciseRight(account, bytes, ACC.other, price));
  const credit = (beneficiary: Address) => pub.readContract({ address: account, abi: rightAbi, functionName: "creditOf", args: [beneficiary] });
  expect(await credit(ACC.me)).toBe(parseEther("0.95"));
  expect(await credit(royaltyTo)).toBe(parseEther("0.05"));

  // Real empty blocks put creation outside the bounded discovery window before this browser opens it.
  const anvil = createTestClient({ chain, transport: http(RPC), mode: "anvil" });
  await anvil.mine({ blocks: 16_001, interval: 1 });
  let failedGets = 0;
  await page.route(url => url.pathname.toLowerCase() === `/api/rights/${account.toLowerCase()}`, async route => {
    if (route.request().method() === "GET") { failedGets++; await route.abort("failed"); }
    else await route.continue();
  });
  await injectWallet(page, ACC.me);
  await page.goto(`/rights/${account}`);
  await connect(page);
  await expect(page.getByRole("heading", { name: "Unresolved payments", exact: true })).toBeVisible();
  await expect(page.getByText("The creation config is unavailable. Actions requiring it are disabled.", { exact: true })).toBeVisible();
  await expect(page.getByText(/There are 1\.00 eth in outstanding credits/)).toBeVisible();
  await page.getByLabel("Payment beneficiary", { exact: true }).fill(royaltyTo);
  await expect(page.getByLabel("Alternate recipient for your own credit", { exact: true })).toHaveValue("");
  const beforeA = await pub.getBalance({ address: ACC.me });
  const beforeB = await pub.getBalance({ address: royaltyTo });
  const beforeBlock = await pub.getBlockNumber({ cacheTime: 0 });
  await page.getByRole("button", { name: "Withdraw your credit", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(`Recipient: ${ACC.me}`, { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw payment", exact: true }).click();
  await waitFor(() => credit(ACC.me), value => value === 0n);
  const withdrawals = await pub.getLogs({ address: account, event: getAbiItem({ abi: rightAbi, name: "CreditWithdrawn" }), args: { beneficiary: ACC.me }, fromBlock: beforeBlock + 1n, toBlock: "latest" });
  expect(withdrawals).toHaveLength(1);
  expect(withdrawals[0]!.args.recipient!.toLowerCase()).toBe(ACC.me.toLowerCase());
  expect(withdrawals[0]!.args.amount).toBe(parseEther("0.95"));
  const receipt = await pub.getTransactionReceipt({ hash: withdrawals[0]!.transactionHash });
  expect(await pub.getBalance({ address: ACC.me }) + receipt.gasUsed * receipt.effectiveGasPrice).toBe(beforeA + parseEther("0.95"));
  expect(await pub.getBalance({ address: royaltyTo })).toBe(beforeB);
  expect(await credit(royaltyTo)).toBe(parseEther("0.05"));
  expect(await pub.getBalance({ address: account })).toBe(parseEther("0.05"));
  expect(failedGets).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  await page.screenshot({ path: `test-results/rights-unresolved-payment-${info.project.name}.png`, fullPage: true });
});
