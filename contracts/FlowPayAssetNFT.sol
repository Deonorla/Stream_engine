// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./utils/Owned.sol";

/**
 * @title FlowPayAssetNFT
 * @dev ERC721 digital twin for real-world rental assets.
 * Extends OpenZeppelin ERC721URIStorage for per-token metadata URIs
 * and Owned for owner + operator access control via OpenZeppelin
 * Ownable and AccessControl.
 *
 * Minting and metadata updates are restricted to the designated
 * controller (FlowPayRWAHub) enforcing a hub-and-spoke architecture.
 */
contract FlowPayAssetNFT is ERC721URIStorage, Owned {
    uint256 public nextTokenId = 1;
    address public controller;

    event ControllerUpdated(address indexed controller);
    event MetadataUpdated(uint256 indexed tokenId, string tokenURI);

    modifier onlyController() {
        require(msg.sender == controller, "FlowPayAssetNFT: caller is not controller");
        _;
    }

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Owned()
    {}

    function setController(address controller_) external onlyOwner {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    /**
     * @dev Mints a new asset NFT to `to` with the given IPFS metadata URI.
     * Only callable by the controller (RWAHub).
     */
    function mintTo(address to, string calldata tokenURI_)
        external
        onlyController
        returns (uint256 tokenId)
    {
        require(to != address(0), "FlowPayAssetNFT: mint to zero");
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        emit MetadataUpdated(tokenId, tokenURI_);
    }

    /**
     * @dev Updates the metadata URI for an existing token.
     * Only callable by the controller (RWAHub).
     */
    function updateTokenURI(uint256 tokenId, string calldata tokenURI_)
        external
        onlyController
    {
        require(ownerOf(tokenId) != address(0), "FlowPayAssetNFT: token not minted");
        _setTokenURI(tokenId, tokenURI_);
        emit MetadataUpdated(tokenId, tokenURI_);
    }

    /**
     * @dev Required override for multiple inheritance (ERC721URIStorage + AccessControl).
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, Owned)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
