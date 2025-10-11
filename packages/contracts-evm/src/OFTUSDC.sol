// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";

/**
 * @title OFTUSDC
 * @notice ERC20 representation of USDC for cross-chain functionality
 * @dev This contract represents USDC on all chains, enabling seamless cross-chain transfers
 * @dev All OFTUSDC is backed by locked USDC in the USDCOFTAdapter (no unbacked minting)
 */
contract OFTUSDC is OFT {
    
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {
    }
}