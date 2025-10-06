// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";

/**
 * @title OFTUSDC
 * @notice ERC20 representation of USDC for cross-chain functionality
 * @dev This contract represents USDC on all chains, enabling seamless cross-chain transfers
 */
contract OFTUSDC is OFT {
    // Authorized minters (e.g., StacksCrossChainManager)
    mapping(address => bool) public authorizedMinters;
    
    event OFTUSDCminted(address indexed to, uint256 amount, string reason);
    
    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender], 'OFTUSDC: not authorized minter');
        _;
    }
    
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {
        // Mint initial supply for testing
        _mint(msg.sender, 1000000 * 10**18); // 1M OFTUSDC with 18 decimals
    }
    
    /**
     * @dev Mint OFTUSDC tokens (only authorized minters)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param reason Reason for minting (for event logging)
     */
    function mint(address to, uint256 amount, string memory reason) 
        external 
        onlyAuthorizedMinter 
    {
        require(to != address(0), 'OFTUSDC: mint to zero address');
        require(amount > 0, 'OFTUSDC: amount must be positive');
        
        _mint(to, amount);
        emit OFTUSDCminted(to, amount, reason);
    }
    
    /**
     * @dev Add authorized minter
     * @param minter Address to authorize for minting
     */
    function addAuthorizedMinter(address minter) external onlyOwner {
        require(minter != address(0), 'OFTUSDC: invalid minter address');
        authorizedMinters[minter] = true;
    }
    
    /**
     * @dev Remove authorized minter
     * @param minter Address to remove authorization from
     */
    function removeAuthorizedMinter(address minter) external onlyOwner {
        require(minter != address(0), 'OFTUSDC: invalid minter address');
        authorizedMinters[minter] = false;
    }
}