// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Collections and counterparties used only by the client's local chains and tests. They are
// real contracts deployed on Anvil, standing in for the third-party collections and receivers
// the protocol accepts by design. None of them replaces a protocol contract.

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// ERC721 with an ERC2981 royalty anyone can change, and open minting.
contract TestNFT is ERC721, ERC2981 {
    string private baseURI;
    uint256 public totalSupply;

    constructor(string memory name_, string memory symbol_, address royaltyTo, uint96 royaltyBps, string memory baseURI_)
        ERC721(name_, symbol_)
    {
        baseURI = baseURI_;
        if (royaltyTo != address(0)) _setDefaultRoyalty(royaltyTo, royaltyBps);
    }

    function mint(address to, uint256 count) external returns (uint256 first) {
        first = totalSupply + 1;
        for (uint256 i; i < count; ++i) _mint(to, first + i);
        totalSupply += count;
    }

    function setRoyalty(address to, uint96 bps) external {
        if (to == address(0)) _deleteDefaultRoyalty();
        else _setDefaultRoyalty(to, bps);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}

/// ERC721 without ERC2981: pays no royalty.
contract PlainNFT is ERC721 {
    uint256 public totalSupply;

    constructor() ERC721("Plain", "PLN") {}

    function mint(address to, uint256 count) external returns (uint256 first) {
        first = totalSupply + 1;
        for (uint256 i; i < count; ++i) _mint(to, first + i);
        totalSupply += count;
    }
}

/// ERC721 whose holder can lock a token against transfers, like a nested Moonbird.
contract LockableNFT is ERC721 {
    mapping(uint256 => bool) public locked;
    uint256 public totalSupply;

    constructor() ERC721("Lockable", "LCK") {}

    function mint(address to, uint256 count) external returns (uint256 first) {
        first = totalSupply + 1;
        for (uint256 i; i < count; ++i) _mint(to, first + i);
        totalSupply += count;
    }

    function setLocked(uint256 id, bool on) external {
        require(ownerOf(id) == msg.sender, "owner");
        locked[id] = on;
    }

    function _update(address to, uint256 id, address auth) internal override returns (address) {
        require(!locked[id], "nested");
        return super._update(to, id, auth);
    }
}

/// Reports ERC2981 but asks a nonzero royalty with no receiver (BadRoyalty).
contract ZeroReceiverRoyaltyNFT is ERC721 {
    constructor() ERC721("ZeroRoyalty", "ZRR") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function royaltyInfo(uint256, uint256 price) external pure returns (address, uint256) {
        return (address(0), price / 20);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0x2a55205a || super.supportsInterface(id);
    }
}

/// A royalty receiver that refuses ETH until switched.
contract RefusingReceiver {
    bool public refuse = true;

    function setRefuse(bool on) external {
        refuse = on;
    }

    receive() external payable {
        require(!refuse, "refused");
    }
}

contract Test1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

/// Emits an event with `NFTSale.Sold`'s exact signature from an address that is not the handler.
contract FakeSoldEmitter {
    event Sold(address indexed order, address indexed buyer, address recipient, uint256 price, uint256 royalty);

    function emitSold(address order, address buyer, uint256 price) external {
        emit Sold(order, buyer, buyer, price, 0);
    }
}

/// Deploys a genuine clone of Market's Order implementation without Market, with the same
/// appended terms layout. Its fills are real, so the real handlers emit real events for an order
/// Market never created.
contract RogueCloneFactory {
    function deploy(address implementation, address owner, address handler, bytes32 configHash, bytes32 salt)
        external
        payable
        returns (address)
    {
        return Clones.cloneDeterministicWithImmutableArgs(
            implementation, abi.encodePacked(owner, handler, handler.codehash, configHash), salt, msg.value
        );
    }
}
