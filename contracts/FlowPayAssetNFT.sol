// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

contract FlowPayAssetNFT is Owned {
    string public name;
    string public symbol;
    uint256 public nextTokenId = 1;
    address public controller;

    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private tokenApprovals;
    mapping(address => mapping(address => bool)) private operatorApprovals;
    mapping(uint256 => string) private tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event ControllerUpdated(address indexed controller);
    event MetadataUpdated(uint256 indexed tokenId, string tokenURI);

    modifier onlyController() {
        require(msg.sender == controller, "FlowPayAssetNFT: caller is not controller");
        _;
    }

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function setController(address controller_) external onlyOwner {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "FlowPayAssetNFT: zero address");
        return balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner_ = owners[tokenId];
        require(owner_ != address(0), "FlowPayAssetNFT: token not minted");
        return owner_;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(owners[tokenId] != address(0), "FlowPayAssetNFT: token not minted");
        return tokenURIs[tokenId];
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(owners[tokenId] != address(0), "FlowPayAssetNFT: token not minted");
        return tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner_, address operator) external view returns (bool) {
        return operatorApprovals[owner_][operator];
    }

    function approve(address to, uint256 tokenId) external {
        address owner_ = ownerOf(tokenId);
        require(
            msg.sender == owner_ || operatorApprovals[owner_][msg.sender],
            "FlowPayAssetNFT: caller not owner nor approved for all"
        );

        tokenApprovals[tokenId] = to;
        emit Approval(owner_, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(to != address(0), "FlowPayAssetNFT: transfer to zero");
        address owner_ = ownerOf(tokenId);
        require(owner_ == from, "FlowPayAssetNFT: incorrect from");
        require(_isApprovedOrOwner(msg.sender, tokenId), "FlowPayAssetNFT: caller not approved");

        _approve(address(0), tokenId);
        balances[from] -= 1;
        balances[to] += 1;
        owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            bytes4 retval = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            require(retval == IERC721Receiver.onERC721Received.selector, "FlowPayAssetNFT: unsafe recipient");
        }
    }

    function mintTo(address to, string calldata tokenURI_) external onlyController returns (uint256 tokenId) {
        require(to != address(0), "FlowPayAssetNFT: mint to zero");

        tokenId = nextTokenId++;
        owners[tokenId] = to;
        balances[to] += 1;
        tokenURIs[tokenId] = tokenURI_;

        emit Transfer(address(0), to, tokenId);
        emit MetadataUpdated(tokenId, tokenURI_);
    }

    function updateTokenURI(uint256 tokenId, string calldata tokenURI_) external onlyController {
        require(owners[tokenId] != address(0), "FlowPayAssetNFT: token not minted");
        tokenURIs[tokenId] = tokenURI_;
        emit MetadataUpdated(tokenId, tokenURI_);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner_ = owners[tokenId];
        return spender == owner_ || tokenApprovals[tokenId] == spender || operatorApprovals[owner_][spender];
    }

    function _approve(address to, uint256 tokenId) internal {
        tokenApprovals[tokenId] = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }
}
