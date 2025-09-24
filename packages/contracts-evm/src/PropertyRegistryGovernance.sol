// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './PropertyRegistry.sol';
import './PropertyRegistryRateLimit.sol';

/**
 * @title PropertyRegistryGovernance
 * @dev Governance for PropertyRegistry with rate limiting
 * @notice Handles property creation with rate limiting, inherits core functionality
 */
contract PropertyRegistryGovernance is PropertyRegistry {
    // Events
    event RateLimitContractSet(address indexed rateLimitContract);

    // State variables
    PropertyRegistryRateLimit public rateLimitContract;

    // Modifiers
    modifier propertyCreationRateLimited() {
        rateLimitContract.checkPropertyCreationRateLimit(msg.sender);
        _;
    }

    constructor(address _owner, address _environmentConfig) PropertyRegistry(_owner, _environmentConfig) {}

    /**
     * @dev Set rate limit contract
     * @param _rateLimitContract Address of the rate limit contract
     */
    function setRateLimitContract(address _rateLimitContract) external onlyOwner {
        require(_rateLimitContract != address(0), 'PropertyRegistryGovernance: invalid rate limit contract');
        rateLimitContract = PropertyRegistryRateLimit(_rateLimitContract);
        emit RateLimitContractSet(_rateLimitContract);
    }

    /**
     * @dev Create a new property with rate limiting
     * @param name Property name
     * @param depositCap Deposit cap
     * @param underlyingAsset Underlying asset for the vault
     * @return propertyId The ID of the created property
     * @return vault The address of the created vault
     */
    function createProperty(
        string memory name,
        uint256 depositCap,
        address underlyingAsset
    ) external override onlyOwner propertyCreationRateLimited returns (uint32 propertyId, address vault) {
        require(bytes(name).length > 0, 'PropertyRegistryGovernance: name required');
        require(depositCap > 0, 'PropertyRegistryGovernance: deposit cap must be positive');
        require(underlyingAsset != address(0), 'PropertyRegistryGovernance: invalid underlying asset');

        propertyId = nextPropertyId++;
        
        // Deploy new PropertyVault
        vault = address(new PropertyVault(
            underlyingAsset,
            name,
            string(abi.encodePacked(name, 'SHARE')),
            owner(),
            depositCap,
            propertyId,
            address(environmentConfig)
        ));

        // Initialize property
        properties[propertyId] = Property({
            vault: vault,
            depositCap: depositCap,
            totalDeposited: 0,
            status: PropertyStatus.Active,
            paused: false,
            createdAt: block.timestamp
        });

        // Authorize the vault
        authorizedVaults[vault] = true;

        emit PropertyCreated(propertyId, vault, depositCap);
    }

    /**
     * @dev Get property creation rate limit status
     * @param user User address
     * @return canCreate Whether user can create property
     * @return remainingCount Remaining properties user can create
     * @return timeUntilReset Time until rate limit resets
     */
    function getPropertyCreationStatus(address user) external view returns (
        bool canCreate,
        uint256 remainingCount,
        uint256 timeUntilReset
    ) {
        return rateLimitContract.getPropertyCreationStatus(user);
    }

    /**
     * @dev Reset rate limit for a user (only owner)
     * @param user User address
     */
    function resetRateLimit(address user) external onlyOwner {
        rateLimitContract.resetRateLimit(user);
    }

    /**
     * @dev Get rate limit data for a user
     * @param user User address
     * @return lastCreation Last creation timestamp
     * @return count Current creation count
     */
    function getRateLimitData(address user) external view returns (uint256 lastCreation, uint256 count) {
        return rateLimitContract.getRateLimitData(user);
    }
}
