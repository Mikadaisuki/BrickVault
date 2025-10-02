// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './VaultBase.sol';
import './PropertyToken.sol';
import './EnvironmentConfig.sol';

/**
 * @title PropertyVault
 * @dev Core ERC4626 vault functionality for property investments
 * @notice Handles basic vault operations, deposits, withdrawals, and PropertyToken management
 */
contract PropertyVault is VaultBase {
    // Events
    event PropertyVaultInitialized(uint256 propertyId, address registry);
    event PropertyTokenCreated(address indexed propertyToken, uint256 propertyId, string propertyName);
    event NAVUpdated(uint256 propertyId, int256 delta, uint256 newTotalAssets);
    event RentHarvested(uint256 amount, uint256 newTotalAssets, uint256 propertyId);

    // State variables
    uint32 public immutable propertyId;
    EnvironmentConfig public immutable environmentConfig;
    
    // Property purchase state
    bool public propertyPurchased;
    uint256 public propertyPurchasePrice;
    address public propertyManager;
    string public propertyAddress;
    PropertyToken public propertyToken;
    
    // Income tracking
    uint256 public totalRentHarvested;
    uint256 public totalNAVChanges;
    uint256 public lastRentHarvest;
    
    // Period management for income distribution
    uint256 public currentPeriodIncome;
    uint256 public currentPeriodDistributed;
    mapping(address => uint256) public userPeriodWithdrawn;
    uint256 public lastNAVUpdate;
    uint256 public totalIncomeHarvested;
    uint256 public originalPrincipal;

    // Modifiers - using inherited onlyOwner from VaultBase

    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _depositCap,
        uint32 _propertyId,
        address _environmentConfig
    ) VaultBase(_asset, _name, _symbol, _owner, _depositCap) {
        require(_propertyId > 0, 'PropertyVault: invalid property ID');
        require(_environmentConfig != address(0), 'PropertyVault: invalid environment config address');
        
        propertyId = _propertyId;
        environmentConfig = EnvironmentConfig(_environmentConfig);
        
        // Verify EnvironmentConfig contract
        try environmentConfig.isStrictErrorHandling() returns (bool) {
            // Success - contract is valid
        } catch {
            revert('PropertyVault: invalid EnvironmentConfig contract');
        }
        
        emit PropertyVaultInitialized(_propertyId, _owner);
    }

    /**
     * @dev Harvest rent income for this specific property
     * @param amount Amount of underlying asset to add as rent income
     */
    function harvestRent(uint256 amount) external onlyOwner {
        require(amount > 0, 'PropertyVault: amount must be positive');
        
        // Reset period when new income is harvested
        if (currentPeriodDistributed > 0) {
            // Previous period was fully distributed, reset for new period
            currentPeriodIncome = 0;
            currentPeriodDistributed = 0;
            // Note: userPeriodWithdrawn mapping will be reset implicitly as new period starts
        }
        
        // Transfer assets from caller to vault
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        
        // Update tracking variables with overflow protection
        lastRentHarvest = block.timestamp;
        
        uint256 currentRentHarvested = totalRentHarvested;
        require(currentRentHarvested <= type(uint256).max - amount, 'PropertyVault: rent harvested overflow');
        totalRentHarvested = currentRentHarvested + amount;
        
        uint256 currentIncomeHarvested = totalIncomeHarvested;
        require(currentIncomeHarvested <= type(uint256).max - amount, 'PropertyVault: income harvested overflow');
        totalIncomeHarvested = currentIncomeHarvested + amount;
        
        // Set current period income
        currentPeriodIncome = amount;
        
        emit Harvest(amount, totalAssets());
        emit RentHarvested(amount, totalAssets(), propertyId);
    }

    /**
     * @dev Update NAV (Net Asset Value) for this specific property
     * @param delta Positive or negative amount to adjust NAV
     */
    function updateNAV(int256 delta) external override onlyOwner {
        require(address(propertyToken) != address(0), 'PropertyVault: property not purchased yet');
        
        if (delta > 0) {
            // Appreciation - mint new PropertyTokens
            uint256 mintAmount = uint256(delta);
            propertyToken.mint(address(this), mintAmount, "Property appreciation");
        } else if (delta < 0) {
            // Depreciation - burn PropertyTokens
            uint256 burnAmount = uint256(-delta);
            require(propertyToken.balanceOf(address(this)) >= burnAmount, 'PropertyVault: insufficient PropertyTokens for NAV reduction');
            propertyToken.burn(address(this), burnAmount, "Property depreciation");
        }
        
        // Update tracking variables
        lastNAVUpdate = block.timestamp;
        totalNAVChanges += delta > 0 ? uint256(delta) : uint256(-delta);
        
        emit NAVUpdated(propertyId, delta, totalAssets());
    }

    /**
     * @dev Initiate property purchase (called by owner or DAO via governance)
     */
    function initiatePropertyPurchase(
        uint256 purchasePrice, 
        address _propertyManager
    ) external virtual {
        require(!propertyPurchased, 'Already purchased');
        require(purchasePrice > 0, 'Invalid price');
        require(_propertyManager != address(0), 'Invalid manager');
        
        propertyPurchasePrice = purchasePrice;
        propertyManager = _propertyManager;
        originalPrincipal = totalAssets();
    }
    
    /**
     * @dev Withdraw funds for property purchase (called by owner or DAO via governance)
     */
    function withdrawForPurchase(uint256 amount) external virtual {
        require(!propertyPurchased, 'Already purchased');
        require(amount <= totalAssets(), 'Insufficient funds');
        require(propertyManager != address(0), 'Manager not set');
        
        IERC20(asset()).transfer(propertyManager, amount);
    }
    
    /**
     * @dev Mark property as purchased (called by owner or DAO via governance)
     */
    function completePropertyPurchase(string memory _propertyAddress) external virtual {
        require(!propertyPurchased, 'Already purchased');
        require(propertyManager != address(0), 'Manager not set');
        
        propertyPurchased = true;
        propertyAddress = _propertyAddress;
        
        // Create PropertyToken for this property
        string memory propertyName = string(abi.encodePacked("Property ", _propertyAddress));
        propertyToken = new PropertyToken(
            propertyId,
            propertyName,
            _propertyAddress,
            address(this) // Vault owns the PropertyToken
        );
        
        // Authorize this vault to mint/burn PropertyTokens for NAV updates
        propertyToken.addAuthorizedMinter(address(this));
        propertyToken.addAuthorizedBurner(address(this));
        
        emit PropertyTokenCreated(address(propertyToken), propertyId, propertyName);
    }

    /**
     * @dev Get property information
     */
    function getPropertyInfo() external view returns (
        uint32 _propertyId,
        bool _propertyPurchased,
        uint256 _propertyPurchasePrice,
        address _propertyManager,
        string memory _propertyAddress,
        address _propertyToken,
        uint256 _totalRentHarvested,
        uint256 _totalNAVChanges,
        uint256 _totalIncomeHarvested,
        uint256 _originalPrincipal
    ) {
        return (
            propertyId,
            propertyPurchased,
            propertyPurchasePrice,
            propertyManager,
            propertyAddress,
            address(propertyToken),
            totalRentHarvested,
            totalNAVChanges,
            totalIncomeHarvested,
            originalPrincipal
        );
    }

    /**
     * @dev Check if property is purchased
     */
    function isPropertyPurchased() external view returns (bool) {
        return propertyPurchased;
    }

    /**
     * @dev Get PropertyToken address
     */
    function getPropertyToken() external view returns (address) {
        return address(propertyToken);
    }
}
