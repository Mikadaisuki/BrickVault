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
        }
        
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

    function _canDeposit() internal view returns (bool) {
        if (isLiquidating) return false;
        
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                return currentStage == PropertyDAO.PropertyStage.OpenToFund;
            } catch {
                return true;
            }
        }
        return true;
    }

    function _canWithdraw() internal view returns (bool) {
        if (isLiquidating) return false;
        
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.OpenToFund) return true;
                if (currentStage == PropertyDAO.PropertyStage.Funded) return false;
                if (currentStage == PropertyDAO.PropertyStage.UnderManagement) return true;
                if (currentStage == PropertyDAO.PropertyStage.Liquidating) return true;
                if (currentStage == PropertyDAO.PropertyStage.Liquidated) return false;
            } catch {
                return true;
            }
        }
        return true;
    }

    function _canTransfer() internal view returns (bool) {
        if (isLiquidating) return false;
        
        if (address(dao) != address(0)) {
            try dao.getCurrentStage() returns (PropertyDAO.PropertyStage currentStage) {
                if (currentStage == PropertyDAO.PropertyStage.Liquidating) return false;
            } catch {
                return true;
            }
        }
        return true;
    }

    function _getMaxWithdrawable(address user) internal view returns (uint256) {
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
                if (currentStage == PropertyDAO.PropertyStage.OpenToFund) return convertToAssets(userShares);
                if (currentStage == PropertyDAO.PropertyStage.Funded) return 0;
                if (currentStage == PropertyDAO.PropertyStage.UnderManagement) {
                    if (propertyPurchased) {
                        require(totalSupply() > 0, "No shares");
                        return (totalIncomeHarvested * userShares) / totalSupply();
                    }
                    return convertToAssets(userShares);
                }
                if (currentStage == PropertyDAO.PropertyStage.Liquidating) {
                    if (propertyPurchased) {
                        require(totalSupply() > 0, "No shares");
                        return (totalIncomeHarvested * userShares) / totalSupply();
                    }
                    return convertToAssets(userShares);
                }
                if (currentStage == PropertyDAO.PropertyStage.Liquidated) return 0;
            } catch {
                return convertToAssets(userShares);
            }
        }
        
        if (!propertyPurchased) return convertToAssets(userShares);
        
        require(totalSupply() > 0, "No shares");
        return (totalIncomeHarvested * userShares) / totalSupply();
    }

    function setStacksCrossChainManager(address _stacksManager) external onlyOwner {
        require(_stacksManager != address(0), 'Invalid manager');
        stacksManager = StacksCrossChainManager(_stacksManager);
        emit StacksCrossChainManagerSet(_stacksManager);
    }

    function mintShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager), 'Only Stacks manager');
        require(user != address(0) && amount > 0, 'Invalid params');
        _mint(user, amount);
        emit SharesMinted(user, amount);
    }

    function burnShares(address user, uint256 amount) external {
        require(msg.sender == address(stacksManager), 'Only Stacks manager');
        require(user != address(0) && amount > 0, 'Invalid params');
        require(balanceOf(user) >= amount, 'Insufficient shares');
        _burn(user, amount);
        emit SharesBurned(user, amount);
    }

    function isStacksUser(address user) external view returns (bool, uint256 sbtcDeposit, uint256 shares) {
        if (address(stacksManager) != address(0)) {
            (sbtcDeposit, , shares, , , , , ) = stacksManager.getStacksUserInfo(user, propertyId);
            return (sbtcDeposit > 0, sbtcDeposit, shares);
        }
        return (false, 0, 0);
    }

    function getTotalStacksDeposits() external view returns (uint256 totalSbtc, uint256 totalUsdValue, uint256 totalShares) {
        if (address(stacksManager) != address(0)) {
            (totalSbtc, totalUsdValue, totalShares) = stacksManager.getTotalStacksDeposits(propertyId);
        }
    }
}
