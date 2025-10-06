// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './PropertyVault.sol';
import './PropertyDAO.sol';
import './StacksCrossChainManager.sol';

contract PropertyVaultGovernance is PropertyVault {
    event DAOSet(address indexed dao);
    event StacksCrossChainManagerSet(address indexed manager);
    event SharesMinted(address indexed user, uint256 amount);
    event SharesBurned(address indexed user, uint256 amount);

    PropertyDAO public dao;
    StacksCrossChainManager public stacksManager;
    bool public isLiquidating;
    uint256 public totalIncomeDistributed;

    modifier onlyDAO() {
        require(msg.sender == address(dao), 'Only DAO');
        _;
    }

    modifier notLiquidating() {
        require(!isLiquidating, 'Liquidating');
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

    function setDAO(address _dao) external onlyOwner {
        require(_dao != address(0), 'Invalid DAO');
        dao = PropertyDAO(_dao);
        emit DAOSet(_dao);
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        notLiquidating
        returns (uint256 shares)
    {
        require(_canDeposit(), 'deposits blocked');
        shares = super.deposit(assets, receiver);
        if (address(dao) != address(0)) {
            dao.updateTotalInvested(totalAssets());
        }
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        notLiquidating
        returns (uint256 assets)
    {
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.Liquidated) {
                    return super.redeem(shares, receiver, owner);
                } else {
                    require(_canWithdraw(), 'withdrawals blocked');
                }
            } catch {
                require(_canWithdraw(), 'withdrawals blocked');
            }
        } else {
            require(_canWithdraw(), 'withdrawals blocked');
        }
        
        assets = convertToAssets(shares);
        
        if (propertyPurchased) {
            uint256 maxWithdrawable = _getMaxWithdrawable(owner);
            require(assets <= maxWithdrawable, 'income only');
        }
        
        return super.redeem(shares, receiver, owner);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        notLiquidating
        returns (uint256 shares)
    {
        require(_canWithdraw(), 'withdrawals blocked');
        
        if (propertyPurchased) {
            uint256 maxWithdrawable = _getMaxWithdrawable(owner);
            require(assets <= maxWithdrawable, 'income only');
            
            // For rent income withdrawals, don't burn shares
            uint256 userShares = balanceOf(owner);
            require(userShares > 0, 'No shares');
            
            // Transfer income directly without burning shares
            IERC20(asset()).transfer(receiver, assets);
            
            // Track distributed income
            totalIncomeDistributed += assets;
            currentPeriodDistributed += assets;
            userPeriodWithdrawn[owner] += assets;
            
            // Return 0 shares (no shares burned)
            return 0;
        }
        
        // For non-rent withdrawals, use standard ERC4626 behavior
        return super.withdraw(assets, receiver, owner);
    }

    function transfer(address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        require(_canTransfer(), 'transfers blocked');
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        require(_canTransfer(), 'transfers blocked');
        return super.transferFrom(from, to, value);
    }

    function initiateLiquidation() external onlyDAO {
        require(!isLiquidating, 'Already liquidating');
        isLiquidating = true;
        _pause();
    }

    function completeLiquidation() external onlyDAO {
        require(isLiquidating, 'Not liquidating');
        isLiquidating = false;
        _unpause();
    }

    function pauseForLiquidation() external onlyDAO {
        _pause();
    }

    function getMaxWithdrawable(address user) external view returns (uint256) {
        return _getMaxWithdrawable(user);
    }

    function getWithdrawalStatus() external view returns (string memory) {
        if (address(dao) == address(0)) return "Allowed";
        
        try dao.getCurrentStage() returns (PropertyDAO.PropertyStage stage) {
            if (stage == PropertyDAO.PropertyStage.Funded || stage == PropertyDAO.PropertyStage.Liquidated) {
                return "Blocked";
            }
            if ((stage == PropertyDAO.PropertyStage.UnderManagement || stage == PropertyDAO.PropertyStage.Liquidating) && propertyPurchased) {
                return "Income-only";
            }
            return "Allowed";
        } catch {
            return "Allowed";
        }
    }

    function _canDeposit() internal view returns (bool) {
        return !isLiquidating && (address(dao) == address(0) || _getStage() == PropertyDAO.PropertyStage.OpenToFund);
    }

    function _canWithdraw() internal view returns (bool) {
        if (isLiquidating) return false;
        if (address(dao) == address(0)) return true;
        
        PropertyDAO.PropertyStage stage = _getStage();
        return stage != PropertyDAO.PropertyStage.Funded && stage != PropertyDAO.PropertyStage.Liquidated;
    }

    function _canTransfer() internal view returns (bool) {
        return !isLiquidating && (address(dao) == address(0) || _getStage() != PropertyDAO.PropertyStage.Liquidating);
    }
    
    function _getStage() internal view returns (PropertyDAO.PropertyStage) {
        try dao.getCurrentStage() returns (PropertyDAO.PropertyStage stage) {
            return stage;
        } catch {
            return PropertyDAO.PropertyStage.OpenToFund; // Default safe stage
        }
    }

    function _getMaxWithdrawable(address user) internal view returns (uint256) {
        if (!_canWithdraw() || balanceOf(user) == 0) return 0;
        
        uint256 userShares = balanceOf(user);
        PropertyDAO.PropertyStage stage = _getStage();
        
        if (stage == PropertyDAO.PropertyStage.Funded || stage == PropertyDAO.PropertyStage.Liquidated) return 0;
        if (stage == PropertyDAO.PropertyStage.OpenToFund) return convertToAssets(userShares);
        
        // UnderManagement or Liquidating stages
        return propertyPurchased ? _getPeriodIncomeShare(user, userShares) : convertToAssets(userShares);
    }
    
    function _getPeriodIncomeShare(address user, uint256 userShares) internal view returns (uint256) {
        if (totalSupply() == 0) return 0;
        uint256 userPeriodShare = (currentPeriodIncome * userShares) / totalSupply();
        uint256 userWithdrawn = userPeriodWithdrawn[user];
        return userPeriodShare > userWithdrawn ? userPeriodShare - userWithdrawn : 0;
    }


    function setStacksCrossChainManager(address _stacksManager) external onlyOwner {
        require(_stacksManager != address(0), 'Invalid manager');
        stacksManager = StacksCrossChainManager(_stacksManager);
        emit StacksCrossChainManagerSet(_stacksManager);
    }

    function mintShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager) && user != address(0) && amount > 0, 'Invalid');
        _mint(user, amount);
        emit SharesMinted(user, amount);
    }

    function burnShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager) && user != address(0) && amount > 0 && balanceOf(user) >= amount, 'Invalid');
        _burn(user, amount);
        emit SharesBurned(user, amount);
    }

}