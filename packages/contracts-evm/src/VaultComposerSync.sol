// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { VaultComposerSync as LayerZeroVaultComposerSync } from "@layerzerolabs/ovault-evm/contracts/VaultComposerSync.sol";

/**
 * @title MyOVaultComposer
 * @notice Cross-chain vault composer enabling omnichain vault operations via LayerZero
 */
contract VaultComposerSync is LayerZeroVaultComposerSync {
    constructor(
        address _vault,        // ERC4626 vault contract
        address _assetOFT,     // OFTUSDC contract
        address _shareOFT      // ShareOFTAdapter contract
    ) LayerZeroVaultComposerSync(_vault, _assetOFT, _shareOFT) {}
}
