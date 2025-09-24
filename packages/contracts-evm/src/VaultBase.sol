// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/**
 * @title VaultBase
 * @dev Base ERC-4626 vault with conservative rounding and safety features
 * @notice This vault implements ERC-4626 with additional safety measures for real estate investments
 */
contract VaultBase is ERC4626, Ownable, Pausable, ReentrancyGuard {
    // Events
    event Harvest(uint256 amount, uint256 newTotalAssets);
    event NAVUpdated(int256 delta, uint256 newTotalAssets);
    event CapUpdated(uint256 newCap);
    // Fee events removed for demo

    // State variables
    uint256 public depositCap;
    uint256 public lastHarvestTime;
    // Fee-related variables removed for demo

    // Modifiers

    modifier onlyWhenCapNotExceeded(uint256 amount) {
        uint256 currentAssets = totalAssets();
        require(currentAssets <= type(uint256).max - amount, 'VaultBase: overflow in deposit cap calculation');
        require(currentAssets + amount <= depositCap, 'VaultBase: deposit cap exceeded');
        _;
    }

    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _depositCap
    ) ERC4626(IERC20Metadata(_asset)) ERC20(_name, _symbol) Ownable(_owner) {
        depositCap = _depositCap;
    }

    /**
     * @dev Deposit assets and mint shares
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        onlyWhenCapNotExceeded(assets)
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    /**
     * @dev Mint shares for assets
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     */
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        assets = previewMint(shares);
        uint256 currentAssets = totalAssets();
        require(currentAssets <= type(uint256).max - assets, 'VaultBase: overflow in deposit cap calculation');
        require(currentAssets + assets <= depositCap, 'VaultBase: deposit cap exceeded');
        return super.mint(shares, receiver);
    }

    /**
     * @dev Redeem shares for assets
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets redeemed
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @dev Withdraw assets by burning shares
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @dev Harvest function to add yield/income to the vault
     * @param amount Amount of underlying asset to add to the vault
     * @notice This is a demo function for hackathon purposes
     */
    function harvest(uint256 amount) external onlyOwner {
        require(amount > 0, 'VaultBase: amount must be positive');
        
        // Transfer assets from caller to vault
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        
        // High water mark tracking removed for demo
        
        lastHarvestTime = block.timestamp;
        
        emit Harvest(amount, totalAssets());
    }

    /**
     * @dev Update NAV (Net Asset Value) by adjusting underlying assets
     * @param delta Positive or negative amount to adjust NAV
     * @notice This simulates property appreciation/depreciation
     */
    function updateNAV(int256 delta) external virtual onlyOwner {
        if (delta > 0) {
            // Appreciation - mint new assets
            IERC20(asset()).transferFrom(msg.sender, address(this), uint256(delta));
        } else if (delta < 0) {
            // Depreciation - burn assets (transfer out)
            uint256 burnAmount = uint256(-delta);
            require(burnAmount <= totalAssets(), 'VaultBase: insufficient assets for NAV reduction');
            IERC20(asset()).transfer(msg.sender, burnAmount);
        }
        
        emit NAVUpdated(delta, totalAssets());
    }

    /**
     * @dev Set deposit cap
     * @param newCap New deposit cap
     */
    function setDepositCap(uint256 newCap) external onlyOwner {
        _setDepositCap(newCap);
    }

    function _setDepositCap(uint256 newCap) internal {
        depositCap = newCap;
        emit CapUpdated(newCap);
    }

    // Fee-related functions removed for demo

    /**
     * @dev Pause deposits and redemptions
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause deposits and redemptions
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Override convertToShares to use conservative rounding (favor vault on deposits)
     */
    function convertToShares(uint256 assets) public view override returns (uint256 shares) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }

    /**
     * @dev Override convertToAssets to use conservative rounding (favor user on redemptions)
     */
    function convertToAssets(uint256 shares) public view override returns (uint256 assets) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    /**
     * @dev Get current assets per share (1e18 precision)
     */
    function getAssetsPerShare() external view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? 1e18 : (totalAssets() * 1e18) / supply;
    }

    /**
     * @dev Get vault utilization (totalAssets / depositCap)
     */
    function getUtilization() external view returns (uint256) {
        return depositCap == 0 ? 0 : (totalAssets() * 10000) / depositCap;
    }
}
