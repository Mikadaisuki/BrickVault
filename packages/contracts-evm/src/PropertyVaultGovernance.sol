// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './PropertyVault.sol';
import './PropertyDAO.sol';
import './StacksCrossChainManager.sol';

/**
 * @title PropertyVaultGovernance
 * @dev Governance and stage management for PropertyVault
 * @notice Handles DAO integration, stage-based restrictions, and voting logic
 */
contract PropertyVaultGovernance is PropertyVault {
    // Events
    event DAOSet(address indexed dao);
    event StageRestrictionApplied(PropertyDAO.PropertyStage stage, string operation, bool allowed);
    event StacksCrossChainManagerSet(address indexed manager);
    event SharesMinted(address indexed user, uint256 amount);
    event SharesBurned(address indexed user, uint256 amount);

    // State variables
    PropertyDAO public dao;
    StacksCrossChainManager public stacksManager;
    bool public isLiquidating;

    // Modifiers
    modifier onlyDAO() {
        require(msg.sender == address(dao), 'PropertyVaultGovernance: only DAO');
        _;
    }

    modifier notLiquidating() {
        require(!isLiquidating, 'PropertyVaultGovernance: vault is liquidating');
        _;
    }

    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _depositCap,
        uint32 _propertyId,
        address _environmentConfig
    ) PropertyVault(_asset, _name, _symbol, _owner, _depositCap, _propertyId, _environmentConfig) {}

    /**
     * @dev Set DAO contract
     * @param _dao Address of the PropertyDAO contract
     */
    function setDAO(address _dao) external onlyOwner {
        require(_dao != address(0), 'PropertyVaultGovernance: invalid DAO address');
        dao = PropertyDAO(_dao);
        emit DAOSet(_dao);
    }

    /**
     * @dev Override deposit to enforce stage restrictions
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        notLiquidating
        returns (uint256 shares)
    {
        // Check if deposits are allowed based on property stage
        require(_canDeposit(), 'PropertyVaultGovernance: deposits blocked - property not in OpenToFund stage');
        return super.deposit(assets, receiver);
    }

    /**
     * @dev Override redeem to enforce stage restrictions
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets redeemed
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        notLiquidating
        returns (uint256 assets)
    {
        // Check if redemptions are allowed based on stage
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.Liquidated) {
                    // In Liquidated stage, allow full redemptions
                    return super.redeem(shares, receiver, owner);
                } else {
                    // In other stages, use normal withdrawal logic
                    require(_canWithdraw(), 'PropertyVaultGovernance: withdrawals blocked - property purchase approved or completed');
                }
            } catch {
                // If DAO call fails, use normal withdrawal logic as fallback
                require(_canWithdraw(), 'PropertyVaultGovernance: withdrawals blocked - property purchase approved or completed');
            }
        } else {
            // If no DAO, use normal withdrawal logic
            require(_canWithdraw(), 'PropertyVaultGovernance: withdrawals blocked - property purchase approved or completed');
        }
        
        // Calculate assets that would be redeemed
        assets = convertToAssets(shares);
        
        // If property is purchased, enforce income-only withdrawals
        if (propertyPurchased) {
            uint256 maxWithdrawable = _getMaxWithdrawable(owner);
            require(assets <= maxWithdrawable, 'PropertyVaultGovernance: can only withdraw income, not principal');
        }
        
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @dev Override withdraw to enforce stage restrictions
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        notLiquidating
        returns (uint256 shares)
    {
        // Check if withdrawals are allowed
        require(_canWithdraw(), 'PropertyVaultGovernance: withdrawals blocked - property purchase approved or completed');
        
        // If property is purchased, enforce income-only withdrawals
        if (propertyPurchased) {
            uint256 maxWithdrawable = _getMaxWithdrawable(owner);
            require(assets <= maxWithdrawable, 'PropertyVaultGovernance: can only withdraw income, not principal');
        }
        
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @dev Override transfer to enforce transfer restrictions
     * @param to Address to transfer to
     * @param value Amount to transfer
     * @return success Whether transfer succeeded
     */
    function transfer(address to, uint256 value) public override(ERC20, IERC20) returns (bool success) {
        // Check if transfers are allowed based on stage
        require(_canTransfer(), 'PropertyVaultGovernance: transfers blocked during liquidation');
        return super.transfer(to, value);
    }

    /**
     * @dev Override transferFrom to enforce transfer restrictions
     * @param from Address to transfer from
     * @param to Address to transfer to
     * @param value Amount to transfer
     * @return success Whether transfer succeeded
     */
    function transferFrom(address from, address to, uint256 value) public override(ERC20, IERC20) returns (bool success) {
        // Check if transfers are allowed based on stage
        require(_canTransfer(), 'PropertyVaultGovernance: transfers blocked during liquidation');
        return super.transferFrom(from, to, value);
    }

    /**
     * @dev Initiate liquidation process (called by DAO)
     */
    function initiateLiquidation() external onlyDAO {
        require(!isLiquidating, 'PropertyVaultGovernance: already liquidating');
        isLiquidating = true;
        _pause();
    }

    /**
     * @dev Complete liquidation process (called by DAO)
     */
    function completeLiquidation() external onlyDAO {
        require(isLiquidating, 'PropertyVaultGovernance: not liquidating');
        isLiquidating = false;
        _unpause();
    }

    /**
     * @dev Pause vault for liquidation (only callable by DAO)
     */
    function pauseForLiquidation() external onlyDAO {
        _pause();
    }

    /**
     * @dev Get the maximum amount a user can withdraw (income only during management)
     * @param user User address
     * @return maxWithdrawable Maximum amount user can withdraw
     */
    function getMaxWithdrawable(address user) external view returns (uint256 maxWithdrawable) {
        return _getMaxWithdrawable(user);
    }

    /**
     * @dev Get withdrawal status message for user
     * @return statusMessage Current withdrawal status
     */
    function getWithdrawalStatus() external view returns (string memory statusMessage) {
        if (address(dao) == address(0)) {
            return "Withdrawals allowed - no DAO restrictions";
        }
        
        try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
            if (currentStage == PropertyDAO.PropertyStage.OpenToFund) {
                return "Withdrawals allowed - property not yet funded";
            } else if (currentStage == PropertyDAO.PropertyStage.Funded) {
                return "Withdrawals blocked - property funded, awaiting purchase";
            } else if (currentStage == PropertyDAO.PropertyStage.UnderManagement) {
                if (propertyPurchased) {
                    return "Income-only withdrawals - property under management";
                } else {
                    return "Withdrawals allowed - property not yet purchased";
                }
            } else if (currentStage == PropertyDAO.PropertyStage.Liquidating) {
                if (propertyPurchased) {
                    return "Income-only withdrawals - property liquidating";
                } else {
                    return "Withdrawals allowed - property not yet purchased";
                }
            } else if (currentStage == PropertyDAO.PropertyStage.Liquidated) {
                return "Withdrawals blocked - property liquidated";
            }
        } catch {
            return "Withdrawals allowed - DAO status unknown";
        }
        
        return "Withdrawals allowed - unknown stage";
    }

    /**
     * @dev Internal function to check if deposits are allowed
     * @return canDeposit True if deposits are allowed
     */
    function _canDeposit() internal view returns (bool) {
        // Cannot deposit if liquidating
        if (isLiquidating) {
            return false;
        }
        
        // Cannot deposit if DAO is set and property is not in OpenToFund stage
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                return currentStage == PropertyDAO.PropertyStage.OpenToFund;
            } catch {
                // If DAO call fails, allow deposit as fallback
                return true;
            }
        }
        
        return true;
    }

    /**
     * @dev Internal function to check if withdrawals are allowed
     * @return canWithdraw True if users can withdraw
     */
    function _canWithdraw() internal view returns (bool) {
        // Cannot withdraw if liquidating
        if (isLiquidating) {
            return false;
        }
        
        // Stage-based withdrawal restrictions
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.OpenToFund) {
                    return true; // Allow withdrawals in OpenToFund stage
                } else if (currentStage == PropertyDAO.PropertyStage.Funded) {
                    return false; // Block withdrawals in Funded stage (funds committed)
                } else if (currentStage == PropertyDAO.PropertyStage.UnderManagement) {
                    return true; // Allow withdrawals in UnderManagement stage (rent only)
                } else if (currentStage == PropertyDAO.PropertyStage.Liquidating) {
                    return true; // Allow withdrawals in Liquidating stage (rent only)
                } else if (currentStage == PropertyDAO.PropertyStage.Liquidated) {
                    return false; // Block withdrawals in Liquidated stage (use redeem instead)
                }
            } catch {
                // If DAO call fails, allow withdrawal as fallback
                return true;
            }
        }
        
        return true;
    }

    /**
     * @dev Internal function to check if transfers are allowed
     * @return canTransfer True if transfers are allowed
     */
    function _canTransfer() internal view returns (bool) {
        // Cannot transfer if liquidating
        if (isLiquidating) {
            return false;
        }
        
        // Stage-based transfer restrictions
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                // Block transfers during liquidation stage
                if (currentStage == PropertyDAO.PropertyStage.Liquidating) {
                    return false;
                }
            } catch {
                // If DAO call fails, allow transfer as fallback
                return true;
            }
        }
        
        return true;
    }

    /**
     * @dev Get the maximum amount a user can withdraw (income only during management)
     * @param user User address
     * @return maxWithdrawable Maximum amount user can withdraw
     */
    function _getMaxWithdrawable(address user) internal view returns (uint256 maxWithdrawable) {
        if (!_canWithdraw()) {
            return 0;
        }
        
        uint256 userShares = balanceOf(user);
        if (userShares == 0) {
            return 0;
        }
        
        // Stage-based withdrawal limits
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.OpenToFund) {
                    // In OpenToFund stage, user can withdraw everything
                    return convertToAssets(userShares);
                } else if (currentStage == PropertyDAO.PropertyStage.Funded) {
                    // In Funded stage, no withdrawals allowed
                    return 0;
                } else if (currentStage == PropertyDAO.PropertyStage.UnderManagement) {
                    // In UnderManagement stage, only rent income can be withdrawn
                    if (propertyPurchased) {
                        require(totalSupply() > 0, "PropertyVaultGovernance: no shares minted yet");
                        uint256 userIncomeShareUnderMgmt = (totalIncomeHarvested * userShares) / totalSupply();
                        return userIncomeShareUnderMgmt;
                    }
                    return convertToAssets(userShares);
                } else if (currentStage == PropertyDAO.PropertyStage.Liquidating) {
                    // In Liquidating stage, only rent income can be withdrawn
                    if (propertyPurchased) {
                        require(totalSupply() > 0, "PropertyVaultGovernance: no shares minted yet");
                        uint256 userIncomeShareLiquidating = (totalIncomeHarvested * userShares) / totalSupply();
                        return userIncomeShareLiquidating;
                    }
                    return convertToAssets(userShares);
                } else if (currentStage == PropertyDAO.PropertyStage.Liquidated) {
                    // In Liquidated stage, no withdrawals allowed (use redeem instead)
                    return 0;
                }
            } catch {
                // If DAO call fails, allow full withdrawal as fallback
                return convertToAssets(userShares);
            }
        }
        
        // If property is not purchased, user can withdraw everything
        if (!propertyPurchased) {
            return convertToAssets(userShares);
        }
        
        // If property is purchased, user can only withdraw their share of income
        require(totalSupply() > 0, "PropertyVaultGovernance: no shares minted yet");
        uint256 userIncomeShare = (totalIncomeHarvested * userShares) / totalSupply();
        
        return userIncomeShare;
    }

    /**
     * @dev Set Stacks Cross-Chain Manager
     * @param _stacksManager Address of the StacksCrossChainManager contract
     */
    function setStacksCrossChainManager(address _stacksManager) external onlyOwner {
        require(_stacksManager != address(0), 'PropertyVaultGovernance: invalid manager address');
        stacksManager = StacksCrossChainManager(_stacksManager);
        emit StacksCrossChainManagerSet(_stacksManager);
    }

    /**
     * @dev Mint shares to user (called by Stacks manager)
     * @param user Address of the user
     * @param amount Amount of shares to mint
     */
    function mintShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager), 'PropertyVaultGovernance: only Stacks manager');
        require(user != address(0), 'PropertyVaultGovernance: invalid user address');
        require(amount > 0, 'PropertyVaultGovernance: invalid amount');
        
        _mint(user, amount);
        emit SharesMinted(user, amount);
    }

    /**
     * @dev Burn shares from user (called by Stacks manager)
     * @param user Address of the user
     * @param amount Amount of shares to burn
     */
    function burnShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager), 'PropertyVaultGovernance: only Stacks manager');
        require(user != address(0), 'PropertyVaultGovernance: invalid user address');
        require(amount > 0, 'PropertyVaultGovernance: invalid amount');
        require(balanceOf(user) >= amount, 'PropertyVaultGovernance: insufficient shares');
        
        _burn(user, amount);
        emit SharesBurned(user, amount);
    }

    /**
     * @dev Check if user is a Stacks user
     * @param user User address
     * @return isStacksUser True if user has sBTC deposits
     * @return sbtcDeposit Amount of sBTC deposited
     * @return shares Amount of shares from sBTC
     */
    function isStacksUser(address user) external view returns (bool, uint256 sbtcDeposit, uint256 shares) {
        if (address(stacksManager) != address(0)) {
            (sbtcDeposit, , shares, , , , , ) = stacksManager.getStacksUserInfo(user, propertyId);
            return (sbtcDeposit > 0, sbtcDeposit, shares);
        }
        return (false, 0, 0);
    }

    /**
     * @dev Get total Stacks deposits for this property
     * @return totalSbtc Total sBTC locked
     * @return totalUsdValue Total USD value locked
     * @return totalShares Total shares minted for Stacks users
     */
    function getTotalStacksDeposits() external view returns (uint256 totalSbtc, uint256 totalUsdValue, uint256 totalShares) {
        if (address(stacksManager) != address(0)) {
            (totalSbtc, totalUsdValue, totalShares) = stacksManager.getTotalStacksDeposits(propertyId);
        }
    }
}
