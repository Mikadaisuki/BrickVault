// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import './VaultFactory.sol';
import './EnvironmentConfig.sol';

/**
 * @title PropertyRegistry
 * @dev Core property registry functionality
 * @notice Handles property creation, basic CRUD operations, and vault deployment via VaultFactory
 */
contract PropertyRegistry is Ownable {
    // Events
    event PropertyCreated(uint32 indexed propertyId, address indexed vault, uint256 depositCap);
    event PropertyStatusUpdated(uint32 indexed propertyId, uint8 status);
    event PropertyCapUpdated(uint32 indexed propertyId, uint256 newCap);

    // Property status enum
    enum PropertyStatus {
        Inactive,
        Active
    }

    // Property struct
    struct Property {
        address vault;
        uint256 depositCap;
        uint256 totalDeposited;
        PropertyStatus status;
        uint256 createdAt;
    }

    // State variables
    mapping(uint32 => Property) public properties;
    mapping(address => bool) public authorizedVaults;
    uint32 public nextPropertyId = 1;
    EnvironmentConfig public immutable environmentConfig;
    VaultFactory public immutable vaultFactory;

    // Modifiers
    modifier onlyAuthorizedVault(address vault) {
        require(authorizedVaults[vault], 'PropertyRegistryCore: unauthorized vault');
        _;
    }

    modifier propertyExists(uint32 propertyId) {
        require(properties[propertyId].vault != address(0), 'PropertyRegistryCore: property not found');
        _;
    }

    constructor(address _owner, address _environmentConfig, address _vaultFactory) Ownable(_owner) {
        require(_environmentConfig != address(0), "PReg1");
        require(_vaultFactory != address(0), "PReg2");
        
        environmentConfig = EnvironmentConfig(_environmentConfig);
        vaultFactory = VaultFactory(_vaultFactory);
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
        require(bytes(name).length > 0, "PR1");
        require(depositCap > 0, "PR2");
        require(underlyingAsset != address(0), "PR3");

        propertyId = nextPropertyId++;
        
        // Deploy new PropertyVaultGovernance via VaultFactory
        vault = vaultFactory.createVault(
            underlyingAsset,
            name,
            string(abi.encodePacked(name, 'SHARE')),
            owner(),
            depositCap,
            propertyId,
            address(environmentConfig),
            address(this)  // Pass registry address
        );

        // Initialize property
        properties[propertyId] = Property({
            vault: vault,
            depositCap: depositCap,
            totalDeposited: 0,
            status: PropertyStatus.Active,
            createdAt: block.timestamp
        });

        // Authorize the vault
        authorizedVaults[vault] = true;

        emit PropertyCreated(propertyId, vault, depositCap);
    }

    /**
     * @dev Update property status (activate or deactivate)
     * @param propertyId Property ID
     * @param status New status (Active or Inactive)
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
               property.status == PropertyStatus.Active;
    }
}
