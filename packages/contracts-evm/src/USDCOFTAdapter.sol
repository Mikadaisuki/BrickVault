// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

/**
 * @title USDCOFTAdapter
 * @notice OFT adapter for USDC (the asset) enabling cross-chain transfers
 * @dev This wraps the ASSET (MockUSDC), NOT the vault shares
 * @dev The asset token MUST be an OFT adapter (lockbox model)
 * 
 * Architecture:
 * - MockUSDC (ERC20, 6 decimals) → This adapter locks it
 * - Adapter issues OFT tokens (18 decimals) 
 * - Vault accepts these OFT tokens as the underlying asset
 */
contract USDCOFTAdapter is OFTAdapter {
    constructor(
        address _token,        // MockUSDC address (ERC20, 6 decimals)
        address _lzEndpoint,   // LayerZero endpoint
        address _delegate      // Owner address
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {}
}

