// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/**
 * @title PropertyToken
 * @dev ERC20 token representing ownership of a specific property
 * @notice This token is minted to the PropertyVault after property purchase and represents the property's value
 * @notice NAV updates are handled by minting/burning PropertyTokens within the vault
 */
contract PropertyToken is ERC20, Ownable, ReentrancyGuard {
    // Events
    event PropertyTokenInitialized(uint256 propertyId, string propertyName, uint256 initialSupply);
    event NAVUpdated(uint256 propertyId, int256 delta, uint256 newTotalSupply);
    event PropertyTokenMinted(address to, uint256 amount, string reason);
    event PropertyTokenBurned(address from, uint256 amount, string reason);

    // State variables
    uint32 public immutable propertyId;
    string public propertyName;
    string public propertyAddress;
    uint256 public totalNAVChanges;
    uint256 public lastNAVUpdate;
    
    // Access control
    mapping(address => bool) public authorizedMinters;
    mapping(address => bool) public authorizedBurners;
    
    // Constants
    uint256 public constant INITIAL_SUPPLY = 1e18; // 1 token with 18 decimals
    uint256 public constant MAX_SUPPLY = 1e30; // Maximum supply cap for safety

    // Modifiers
    modifier onlyAuthorizedMinter() {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            'PropertyToken: not authorized minter'
        );
        _;
    }

    modifier onlyAuthorizedBurner() {
        require(
            authorizedBurners[msg.sender] || msg.sender == owner(),
            'PropertyToken: not authorized burner'
        );
        _;
    }

    constructor(
        uint32 _propertyId,
        string memory _propertyName,
        string memory _propertyAddress,
        address _owner
    ) ERC20("PropertyToken", "PROP") Ownable(_owner) {
        require(_propertyId > 0, 'PropertyToken: invalid property ID');
        require(bytes(_propertyName).length > 0, 'PropertyToken: property name required');
        require(bytes(_propertyAddress).length > 0, 'PropertyToken: property address required');
        
        propertyId = _propertyId;
        propertyName = _propertyName;
        propertyAddress = _propertyAddress;
        
        // Mint initial supply to the contract owner (PropertyVault)
        _mint(_owner, INITIAL_SUPPLY);
        
        emit PropertyTokenInitialized(_propertyId, _propertyName, INITIAL_SUPPLY);
    }

    /**
     * @dev Mint PropertyTokens (only authorized minters)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param reason Reason for minting (for event logging)
     */
    function mint(address to, uint256 amount, string memory reason) 
        external 
        onlyAuthorizedMinter 
        nonReentrant 
    {
        require(to != address(0), 'PropertyToken: mint to zero address');
        require(amount > 0, 'PropertyToken: amount must be positive');
        require(totalSupply() + amount <= MAX_SUPPLY, 'PropertyToken: would exceed max supply');
        
        _mint(to, amount);
        
        emit PropertyTokenMinted(to, amount, reason);
    }

    /**
     * @dev Burn PropertyTokens (only authorized burners)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     * @param reason Reason for burning (for event logging)
     */
    function burn(address from, uint256 amount, string memory reason) 
        external 
        onlyAuthorizedBurner 
        nonReentrant 
    {
        require(from != address(0), 'PropertyToken: burn from zero address');
        require(amount > 0, 'PropertyToken: amount must be positive');
        require(balanceOf(from) >= amount, 'PropertyToken: insufficient balance');
        
        _burn(from, amount);
        
        emit PropertyTokenBurned(from, amount, reason);
    }

    /**
     * @dev Update NAV by minting or burning tokens
     * @param delta Positive or negative amount to adjust NAV
     * @param reason Reason for NAV update
     */
    function updateNAV(int256 delta, string memory reason) 
        external 
        onlyAuthorizedMinter 
        nonReentrant 
    {
        if (delta > 0) {
            // Appreciation - mint new tokens
            uint256 mintAmount = uint256(delta);
            require(totalSupply() + mintAmount <= MAX_SUPPLY, 'PropertyToken: would exceed max supply');
            
            _mint(msg.sender, mintAmount);
            totalNAVChanges += mintAmount;
            
            emit PropertyTokenMinted(msg.sender, mintAmount, reason);
        } else if (delta < 0) {
            // Depreciation - burn tokens
            uint256 burnAmount = uint256(-delta);
            require(balanceOf(msg.sender) >= burnAmount, 'PropertyToken: insufficient balance to burn');
            
            _burn(msg.sender, burnAmount);
            totalNAVChanges += burnAmount;
            
            emit PropertyTokenBurned(msg.sender, burnAmount, reason);
        }
        
        lastNAVUpdate = block.timestamp;
        emit NAVUpdated(propertyId, delta, totalSupply());
    }

    /**
     * @dev Add authorized minter
     * @param minter Address to authorize for minting
     */
    function addAuthorizedMinter(address minter) external onlyOwner {
        require(minter != address(0), 'PropertyToken: invalid minter address');
        authorizedMinters[minter] = true;
    }

    /**
     * @dev Remove authorized minter
     * @param minter Address to remove authorization from
     */
    function removeAuthorizedMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = false;
    }

    /**
     * @dev Add authorized burner
     * @param burner Address to authorize for burning
     */
    function addAuthorizedBurner(address burner) external onlyOwner {
        require(burner != address(0), 'PropertyToken: invalid burner address');
        authorizedBurners[burner] = true;
    }

    /**
     * @dev Remove authorized burner
     * @param burner Address to remove authorization from
     */
    function removeAuthorizedBurner(address burner) external onlyOwner {
        authorizedBurners[burner] = false;
    }

    /**
     * @dev Get property information
     * @return _propertyId Property ID
     * @return _propertyName Property name
     * @return _propertyAddress Property address
     * @return _totalSupply Current total supply
     * @return _totalNAVChanges Total NAV changes since inception
     * @return _lastNAVUpdate Timestamp of last NAV update
     */
    function getPropertyInfo() external view returns (
        uint32 _propertyId,
        string memory _propertyName,
        string memory _propertyAddress,
        uint256 _totalSupply,
        uint256 _totalNAVChanges,
        uint256 _lastNAVUpdate
    ) {
        return (
            propertyId,
            propertyName,
            propertyAddress,
            totalSupply(),
            totalNAVChanges,
            lastNAVUpdate
        );
    }

    /**
     * @dev Get NAV change percentage since inception
     * @return navChangePercentage NAV change as percentage (in basis points)
     */
    function getNAVChangePercentage() external view returns (int256 navChangePercentage) {
        if (totalSupply() == 0) {
            return 0;
        }
        
        // Calculate percentage change from initial supply
        int256 currentSupply = int256(totalSupply());
        int256 initialSupply = int256(INITIAL_SUPPLY);
        
        if (currentSupply > initialSupply) {
            // Appreciation
            int256 appreciation = currentSupply - initialSupply;
            navChangePercentage = (appreciation * 10000) / initialSupply;
        } else if (currentSupply < initialSupply) {
            // Depreciation
            int256 depreciation = initialSupply - currentSupply;
            navChangePercentage = -((depreciation * 10000) / initialSupply);
        } else {
            // No change
            navChangePercentage = 0;
        }
    }

    /**
     * @dev Check if address is authorized to mint
     * @param account Address to check
     * @return isAuthorized True if authorized to mint
     */
    function isAuthorizedMinter(address account) external view returns (bool isAuthorized) {
        return authorizedMinters[account] || account == owner();
    }

    /**
     * @dev Check if address is authorized to burn
     * @param account Address to check
     * @return isAuthorized True if authorized to burn
     */
    function isAuthorizedBurner(address account) external view returns (bool isAuthorized) {
        return authorizedBurners[account] || account == owner();
    }

    /**
     * @dev Override decimals to return 18 (standard)
     * @return Number of decimals
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
