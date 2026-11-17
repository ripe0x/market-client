// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Seeds a Market deployment with a few listings and one offer so the app has something to show.
// Deploys a fresh test collection (onchain SVG art, 5% ERC2981 royalty to the sender), mints to
// the sender, and creates through the real Market:
//   - #1 fixed price              0.002 ETH
//   - #2 falling 0.01 -> 0.003 ETH over 3 days
//   - #3 rising  0.004 -> 0.006 ETH over 5 days
//   - #4 fixed price              0.005 ETH, expires in 30 days
//   - an offer for any token of the collection: 0.001 ETH x 2, expires in 7 days (0.002 ETH)
// Each listing is create, then transfer the token in (DECISIONS D23). Everything stays the
// sender's: cancel and withdraw from Positions in the app. Total ETH out: the offer's 0.002
// plus gas.
//
// Dry run (no transaction is sent):
//   forge script script/SeedListings.s.sol --rpc-url https://sepolia.gateway.tenderly.co --sender <address>
// Broadcast with the keystore:
//   forge script script/SeedListings.s.sol --rpc-url https://sepolia.gateway.tenderly.co --account ripe0x --sender <address> --broadcast --slow

import {Script, console} from "forge-std/Script.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Market} from "market/src/Market.sol";
import {Order} from "market/src/Order.sol";
import {NFTTrade} from "market/handlers/NFTTrade.sol";
import {NFTSale} from "market/handlers/NFTSale.sol";
import {NFTBid} from "market/handlers/NFTBid.sol";
import {TestNFT} from "../src/TestCollections.sol";

contract SeedListings is Script {
    // CREATE2 addresses of the pinned release (packages/protocol/src/addresses.ts).
    Market constant MARKET = Market(0x7c91e34703ae3E32812bad1f7251CD0976A31FD4);
    NFTSale constant SALE = NFTSale(0xfEf3a72600a453F82650343525751811120da2c8);
    NFTBid constant BID = NFTBid(0x8dbB30441bB0ca607bC17A3ea763C8f66B30017E);

    function run() external {
        require(address(MARKET).code.length != 0 && address(SALE).code.length != 0, "Market not deployed here");
        address me = msg.sender;
        uint256 t = block.timestamp;

        vm.startBroadcast();
        TestNFT nft = new TestNFT("Market Test", "MKTT", me, 500, "");
        uint256 first = nft.mint(me, 4);
        _list(nft, first, NFTTrade.Schedule(0.002 ether, 0.002 ether, 0, 0, 0), me);
        _list(nft, first + 1, NFTTrade.Schedule(0.01 ether, 0.003 ether, t, t + 3 days, 0), me);
        _list(nft, first + 2, NFTTrade.Schedule(0.004 ether, 0.006 ether, t, t + 5 days, 0), me);
        _list(nft, first + 3, NFTTrade.Schedule(0.005 ether, 0.005 ether, 0, 0, t + 30 days), me);
        Order offer = _offer(nft, t + 7 days, me);
        vm.stopBroadcast();

        console.log("collection", address(nft));
        console.log("offer", address(offer));
    }

    /// 0.001 ETH each for up to 2 tokens of `nft`, funded with 0.002 ETH.
    function _offer(TestNFT nft, uint256 expiry, address me) internal returns (Order) {
        NFTTrade.Schedule memory s = NFTTrade.Schedule(0.001 ether, 0.001 ether, 0, 0, expiry);
        bytes memory config = abi.encode(NFTBid.Config(IERC721(address(nft)), true, 0, s, me, 2));
        return MARKET.create{value: 0.002 ether}(BID, config, keccak256(abi.encode(address(nft), "offer")));
    }

    function _list(TestNFT nft, uint256 id, NFTTrade.Schedule memory s, address me) internal {
        // maxRoyaltyBps 500: exactly the collection's 5% (DECISIONS D3).
        bytes memory config = abi.encode(NFTSale.Config(IERC721(address(nft)), id, s, me, 500));
        Order order = MARKET.create(SALE, config, keccak256(abi.encode(address(nft), id)));
        nft.transferFrom(me, address(order), id);
        require(nft.ownerOf(id) == address(order), "not escrowed");
        console.log("listing", id, address(order));
    }
}
