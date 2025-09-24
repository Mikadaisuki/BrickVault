// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import './PropertyVault.sol';
import './EnvironmentConfig.sol';

/**
 * @title PropertyRegistry
 * @dev Core property registry functionality
 * @notice Handles property creation, basic CRUD operations, and vault deployment
 */
contract PropertyRegistry is Ownable {
    // Events
    event PropertyCreated(uint32 indexed propertyId, address indexed vault, uint256 depositCap);
    event PropertyStatusUpdated(uint32 indexed propertyId, uint8 status);
    event PropertyCapUpdated(uint32 indexed propertyId, uint256 newCap);
    event PropertyPaused(uint32 indexed propertyId, bool paused);

    // Property status enum
    enum PropertyStatus {
        Inactive,
        Active,
        Paused,
        Closing,
        Archived
    }

    // Property struct
    struct Property {
        address vault;
        uint256 depositCap;
        uint256 totalDeposited;
        PropertyStatus status;
        bool paused;
        uint256 createdAt;
    }

    // State variables
    mapping(uint32 => Property) public properties;
    mapping(address => bool) public authorizedVaults;
    uint32 public nextPropertyId = 1;
    EnvironmentConfig public immutable environmentConfig;

    // Modifiers
    modifier onlyAuthorizedVault(address vault) {
        require(authorizedVaults[vault], 'PropertyRegistryCore: unauthorized vault');
        _;
    }

    modifier propertyExists(uint32 propertyId) {
        require(properties[propertyId].vault != address(0), 'PropertyRegistryCore: property not found');
        _;
    }

    constructor(address _owner, address _environmentConfig) Ownable(_owner) {
        require(_environmentConfig != address(0), 'PropertyRegistryCore: invalid environment config address');
        environmentConfig = EnvironmentConfig(_environmentConfig);
        
        // Verify EnvironmentConfig contract
        try environmentConfig.isStrictErrorHandling() returns (bool) {
            // Success - contract is valid
        } catch {
            revert('PropertyRegistryCore: invalid EnvironmentConfig contract');
        }
    }

    /**
     * @dev Create a new property with associated vault
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
    ) external virtual onlyOwner returns (uint32 propertyId, address vault) {
        require(bytes(name).length > 0, 'PropertyRegistryCore: name required');
        require(depositCap > 0, 'PropertyRegistryCore: deposit cap must be positive');
        require(underlyingAsset != address(0), 'PropertyRegistryCore: invalid underlying asset');

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
     * @dev Update property status
     * @param propertyId Property ID
     * @param status New status
     */
    function updatePropertyStatus(uint32 propertyId, PropertyStatus status)
        external
        onlyOwner
        propertyExists(propertyId)
    {
        properties[propertyId].status = status;
        emit PropertyStatusUpdated(propertyId, uint8(status));
    }

    /**
     * @dev Pause/unpause a property
     * @param propertyId Property ID
     * @param paused Whether to pause or unpause
     */
    function setPropertyPaused(uint32 propertyId, bool paused)
        external
        onlyOwner
        propertyExists(propertyId)
    {
        properties[propertyId].paused = paused;
        emit PropertyPaused(propertyId, paused);
    }

    /**
     * @dev Update property deposit cap
     * @param propertyId Property ID
     * @param newCap New deposit cap
     */
    function updatePropertyCap(uint32 propertyId, uint256 newCap)
        external
        onlyOwner
        propertyExists(propertyId)
    {
        require(newCap > 0, 'PropertyRegistryCore: cap must be positive');
        properties[propertyId].depositCap = newCap;
        
        // Update vault cap
        PropertyVault vault = PropertyVault(properties[propertyId].vault);
        vault.setDepositCap(newCap);
        
        emit PropertyCapUpdated(propertyId, newCap);
    }

    /**
     * @dev Record deposit for property
     * @param propertyId Property ID
     * @param amount Deposit amount
     */
    function recordDeposit(uint32 propertyId, uint256 amount, address /* user */)
        external
        onlyAuthorizedVault(msg.sender)
        propertyExists(propertyId)
    {
        require(amount > 0, 'PropertyRegistryCore: amount must be positive');
        properties[propertyId].totalDeposited += amount;
    }

    /**
     * @dev Record redemption for property
     * @param propertyId Property ID
     * @param amount Redemption amount
     */
    function recordRedemption(uint32 propertyId, uint256 amount, address /* user */)
        external
        onlyAuthorizedVault(msg.sender)
        propertyExists(propertyId)
    {
        require(amount > 0, 'PropertyRegistryCore: amount must be positive');
        if (amount <= properties[propertyId].totalDeposited) {
            properties[propertyId].totalDeposited -= amount;
        }
    }

    /**
     * @dev Get property information
     * @param propertyId Property ID
     * @return property Property struct
     */
    function getProperty(uint32 propertyId) external view returns (Property memory property) {
        require(properties[propertyId].vault != address(0), 'PropertyRegistryCore: property not found');
        return properties[propertyId];
    }

    /**
     * @dev Check if property exists (external function)
     * @param propertyId Property ID
     * @return exists True if property exists
     */
    function propertyExistsExternal(uint32 propertyId) external view returns (bool exists) {
        return properties[propertyId].vault != address(0);
    }

    /**
     * @dev Get vault address for property
     * @param propertyId Property ID
     * @return vault Vault address
     */
    function getVaultAddress(uint32 propertyId) external view returns (address vault) {
        require(properties[propertyId].vault != address(0), 'PropertyRegistryCore: property not found');
        return properties[propertyId].vault;
    }

    /**
     * @dev Get total number of properties
     * @return count Total property count
     */
    function getPropertyCount() external view returns (uint256 count) {
        return nextPropertyId - 1;
    }

    /**
     * @dev Check if property is active
     * @param propertyId Property ID
     * @return isActive True if property is active
     */
    function isPropertyActive(uint32 propertyId) external view returns (bool isActive) {
        Property memory property = properties[propertyId];
        return property.vault != address(0) && 
               property.status == PropertyStatus.Active && 
               !property.paused;
    }
}
