// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import './PropertyVaultGovernance.sol';

contract VaultFactory is Ownable {
    event VaultCreated(address indexed vault, uint32 indexed propertyId);
    event AuthorizedCallerAdded(address indexed caller);

    mapping(address => bool) public authorizedCallers;

    constructor(address _owner) Ownable(_owner) {}

    function addAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit AuthorizedCallerAdded(caller);
    }

    function removeAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    function createVault(
        address underlyingAsset,
        string memory name,
        string memory symbol,
        address vaultOwner,
        uint256 depositCap,
        uint32 propertyId,
        address environmentConfig
    ) external returns (address vault) {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), 'Not authorized');
        
        vault = address(new PropertyVaultGovernance(
            underlyingAsset,
            name,
            symbol,
            vaultOwner,
            depositCap,
            propertyId,
            environmentConfig
        ));
        emit VaultCreated(vault, propertyId);
    }
}

