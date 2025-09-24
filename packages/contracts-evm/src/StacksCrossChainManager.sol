// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './PropertyVaultGovernance.sol';
import './PropertyDAO.sol';

/**
 * @title StacksCrossChainManager
 * @dev Manages cross-chain operations between Stacks (sBTC) and EVM (USDC) for property vaults
 * @notice Handles cross-chain messaging, share minting, and stage-based operations
 * @notice sBTC is native to Stacks chain, not an ERC20 token on EVM
 */
contract StacksCrossChainManager is Ownable {
    using SafeERC20 for IERC20;

    // Events
    event StacksDepositReceived(address indexed user, uint32 indexed propertyId, uint256 sbtcAmount, uint256 shares, bytes32 indexed stacksTxHash);
    event StacksWithdrawalRequested(address indexed user, uint32 indexed propertyId, uint256 shares, bytes32 indexed messageId);
    event CrossChainMessageProcessed(bytes32 indexed messageId, uint8 messageType, uint32 indexed propertyId);
    event PropertyPurchaseInitiated(uint32 indexed propertyId, uint256 totalUsdc, uint256 totalSbtc);
    event FundsConverted(uint32 indexed propertyId, uint256 sbtcAmount, uint256 usdcAmount);
    event StacksStageChange(uint32 indexed propertyId, uint8 newStage);

    // Structs
    struct StacksUserInfo {
        uint256 sbtcDeposited;      // Amount of sBTC deposited by user (on Stacks)
        uint256 usdValueAtDeposit;  // USD value of sBTC at time of deposit (6 decimals)
        uint256 sharesMinted;       // Shares minted for this user (based on USD value)
        bool hasDeposited;          // Whether user has made a deposit
        uint256 depositTimestamp;   // When the deposit was made
        bytes32 stacksTxHash;       // Stacks transaction hash for the deposit
        string stacksAddress;       // Stacks address of the user
        address evmCustodian;       // EVM address holding the shares (custodial)
    }

    struct PropertyStacksInfo {
        uint256 totalSbtcLocked;    // Total sBTC locked for this property (on Stacks)
        uint256 totalUsdValueLocked; // Total USD value locked (at deposit time)
        uint256 totalSharesMinted;  // Total shares minted for Stacks users
        mapping(address => StacksUserInfo) users; // User-specific info
    }

    struct CrossChainMessage {
        bytes32 messageId;          // Unique message identifier
        uint8 messageType;          // Type of message (1=deposit, 2=withdrawal)
        uint32 propertyId;          // Property ID
        address evmCustodian;       // EVM address for share custody
        string stacksAddress;       // Stacks address of the user
        uint256 amount;             // Amount (sBTC or shares)
        bytes32 stacksTxHash;       // Stacks transaction hash
        uint256 timestamp;          // Message timestamp
        bool processed;             // Whether message has been processed
    }

    struct PriceInfo {
        uint256 sbtcPriceUsd;       // sBTC price in USD (8 decimals)
        uint256 lastUpdated;        // Last price update timestamp
        bool isValid;               // Whether price is valid
    }

    // State variables
    IERC20 public immutable usdcToken;  // USDC token contract (EVM side)
    address public immutable treasury;  // Treasury address for fund conversion
    
    // Cross-chain messaging
    mapping(bytes32 => CrossChainMessage) public crossChainMessages;
    mapping(bytes32 => bool) public processedMessages; // Prevent replay attacks
    address public relayer;             // Authorized relayer address
    
    // Price oracle and management
    PriceInfo public currentPriceInfo;
    address public priceOracle;         // Price oracle contract address
    uint256 public constant PRICE_DECIMALS = 8; // sBTC price decimals
    uint256 public constant MAX_PRICE_AGE = 1 hours; // Max price age before considered stale
    uint256 public constant MAX_PRICE_DEVIATION = 500; // 5% max price deviation (500 basis points)
    bool public emergencyPaused;        // Emergency pause for extreme price movements
    
    // Mapping from propertyId to Stacks info
    mapping(uint32 => PropertyStacksInfo) public propertyStacksInfo;
    
    // Mapping from propertyId to vault address
    mapping(uint32 => address) public propertyToVault;
    
    // Mapping from Stacks address (string) to EVM address for share custody
    mapping(string => address) public stacksToEvmAddress;
    
    // Authorized vaults and DAOs
    mapping(address => bool) public authorizedVaults;
    mapping(address => bool) public authorizedDAOs;
    
    // Stage change tracking for acknowledgment
    mapping(uint32 => uint8) public pendingStageChanges; // propertyId => stage
    mapping(uint32 => uint256) public stageChangeTimestamps; // propertyId => timestamp

    // Modifiers
    modifier onlyAuthorizedVault() {
        require(authorizedVaults[msg.sender], 'StacksCrossChainManager: only authorized vault');
        _;
    }

    modifier onlyAuthorizedDAO() {
        require(authorizedDAOs[msg.sender], 'StacksCrossChainManager: only authorized DAO');
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, 'StacksCrossChainManager: only relayer');
        _;
    }

    modifier notEmergencyPaused() {
        require(!emergencyPaused, 'StacksCrossChainManager: emergency paused');
        _;
    }

    modifier validPrice() {
        require(currentPriceInfo.isValid, 'StacksCrossChainManager: price not available');
        require((block.timestamp - currentPriceInfo.lastUpdated) <= MAX_PRICE_AGE, 'StacksCrossChainManager: price too stale');
        _;
    }

    constructor(
        address _usdcToken,
        address _treasury,
        address _priceOracle,
        address _relayer,
        address _owner
    ) Ownable(_owner) {
        require(_usdcToken != address(0), 'StacksCrossChainManager: invalid USDC token');
        require(_treasury != address(0), 'StacksCrossChainManager: invalid treasury');
        require(_priceOracle != address(0), 'StacksCrossChainManager: invalid price oracle');
        require(_relayer != address(0), 'StacksCrossChainManager: invalid relayer');
        
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
        priceOracle = _priceOracle;
        relayer = _relayer;
    }

    /**
     * @dev Authorize a vault contract
     * @param vault Address of the vault contract
     */
    function authorizeVault(address vault) external onlyOwner {
        require(vault != address(0), 'StacksCrossChainManager: invalid vault address');
        authorizedVaults[vault] = true;
    }

    /**
     * @dev Authorize a DAO contract
     * @param dao Address of the DAO contract
     */
    function authorizeDAO(address dao) external onlyOwner {
        require(dao != address(0), 'StacksCrossChainManager: invalid DAO address');
        authorizedDAOs[dao] = true;
    }

    /**
     * @dev Set relayer address
     * @param _relayer New relayer address
     */
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), 'StacksCrossChainManager: invalid relayer address');
        relayer = _relayer;
    }

    /**
     * @dev Update price oracle address
     * @param _priceOracle New price oracle address
     */
    function setPriceOracle(address _priceOracle) external onlyOwner {
        require(_priceOracle != address(0), 'StacksCrossChainManager: invalid price oracle');
        priceOracle = _priceOracle;
    }

    /**
     * @dev Update sBTC price from oracle
     * @param newPrice New sBTC price in USD (8 decimals)
     */
    function updateSbtcPrice(uint256 newPrice) external {
        require(msg.sender == priceOracle || msg.sender == owner(), 'StacksCrossChainManager: only oracle or owner');
        require(newPrice > 0, 'StacksCrossChainManager: invalid price');
        
        // Check for extreme price deviation
        if (currentPriceInfo.isValid) {
            uint256 priceChange = newPrice > currentPriceInfo.sbtcPriceUsd 
                ? newPrice - currentPriceInfo.sbtcPriceUsd
                : currentPriceInfo.sbtcPriceUsd - newPrice;
            
            uint256 priceChangePercent = (priceChange * 10000) / currentPriceInfo.sbtcPriceUsd; // basis points
            
            if (priceChangePercent > MAX_PRICE_DEVIATION) {
                emergencyPaused = true;
                revert('StacksCrossChainManager: extreme price movement detected - emergency paused');
            }
        }
        
        currentPriceInfo = PriceInfo({
            sbtcPriceUsd: newPrice,
            lastUpdated: block.timestamp,
            isValid: true
        });
    }

    /**
     * @dev Get current sBTC price
     * @return price Current sBTC price in USD (8 decimals)
     * @return isValid Whether price is valid and not stale
     */
    function getSbtcPrice() external view returns (uint256 price, bool isValid) {
        price = currentPriceInfo.sbtcPriceUsd;
        isValid = currentPriceInfo.isValid && 
                 (block.timestamp - currentPriceInfo.lastUpdated) <= MAX_PRICE_AGE;
    }

    /**
     * @dev Calculate USD value of sBTC amount
     * @param sbtcAmount Amount of sBTC
     * @return usdValue USD value (6 decimals for USDC)
     */
    function calculateUsdValue(uint256 sbtcAmount) public view returns (uint256 usdValue) {
        require(currentPriceInfo.isValid, 'StacksCrossChainManager: price not available');
        require((block.timestamp - currentPriceInfo.lastUpdated) <= MAX_PRICE_AGE, 'StacksCrossChainManager: price too stale');
        
        // sBTC amount * price (8 decimals) / 10^8 = USD value (8 decimals)
        // Convert to USDC decimals (6 decimals): divide by 10^2
        usdValue = (sbtcAmount * currentPriceInfo.sbtcPriceUsd) / (10 ** (PRICE_DECIMALS - 6));
    }

    /**
     * @dev Emergency pause/unpause
     * @param paused Whether to pause or unpause
     */
    function setEmergencyPaused(bool paused) external onlyOwner {
        emergencyPaused = paused;
    }

    /**
     * @dev Process cross-chain message from Stacks (called by relayer)
     * @param messageId Unique message identifier
     * @param messageType Type of message (1=deposit, 2=withdrawal)
     * @param propertyId Property ID
     * @param evmCustodian EVM address to hold shares (custodial)
     * @param stacksAddress Stacks address of the user
     * @param amount Amount (sBTC or shares)
     * @param stacksTxHash Stacks transaction hash
     * @param proof Merkle proof for message validation
     */
    function processCrossChainMessage(
        bytes32 messageId,
        uint8 messageType,
        uint32 propertyId,
        address evmCustodian,
        string calldata stacksAddress,
        uint256 amount,
        bytes32 stacksTxHash,
        bytes calldata proof
    ) external onlyRelayer notEmergencyPaused {
        require(!processedMessages[messageId], 'StacksCrossChainManager: message already processed');
        require(messageType >= 1 && messageType <= 3, 'StacksCrossChainManager: invalid message type');
        require(amount > 0, 'StacksCrossChainManager: invalid amount');
        require(evmCustodian != address(0), 'StacksCrossChainManager: invalid EVM custodian');
        require(bytes(stacksAddress).length > 0, 'StacksCrossChainManager: invalid Stacks address');

        // Verify Stacks address is registered
        require(stacksToEvmAddress[stacksAddress] == evmCustodian, 'StacksCrossChainManager: Stacks address not registered or custodian mismatch');

        // TODO: Implement merkle proof validation for stacksTxHash
        // For now, we trust the relayer (in production, implement proper proof validation)
        
        // Store message
        crossChainMessages[messageId] = CrossChainMessage({
            messageId: messageId,
            messageType: messageType,
            propertyId: propertyId,
            evmCustodian: evmCustodian,
            stacksAddress: stacksAddress,
            amount: amount,
            stacksTxHash: stacksTxHash,
            timestamp: block.timestamp,
            processed: false
        });

        // Process based on message type
        if (messageType == 1) {
            _processDepositMessage(messageId, propertyId, evmCustodian, stacksAddress, amount, stacksTxHash);
        } else if (messageType == 2) {
            _processWithdrawalMessage(messageId, propertyId, evmCustodian, stacksAddress, amount);
        } else if (messageType == 3) {
            // Message type 3: Stage acknowledgment from Stacks
            // EVM doesn't need to process stage transitions, only acknowledge them
            _processStageAcknowledgment(messageId, propertyId, amount);
        } else {
            revert('StacksCrossChainManager: invalid message type');
        }

        processedMessages[messageId] = true;
        emit CrossChainMessageProcessed(messageId, messageType, propertyId);
    }

    /**
     * @dev Process deposit message from Stacks
     * @param messageId Message ID
     * @param propertyId Property ID
     * @param evmCustodian EVM address to hold shares (custodial)
     * @param stacksAddress Stacks address of the user
     * @param sbtcAmount Amount of sBTC deposited on Stacks
     * @param stacksTxHash Stacks transaction hash
     */
    function _processDepositMessage(
        bytes32 messageId,
        uint32 propertyId,
        address evmCustodian,
        string memory stacksAddress,
        uint256 sbtcAmount,
        bytes32 stacksTxHash
    ) internal validPrice {
        // Get vault and DAO for this property
        address vaultAddress = _getVaultForProperty(propertyId);
        require(vaultAddress != address(0), 'StacksCrossChainManager: vault not found');
        
        PropertyVaultGovernance vault = PropertyVaultGovernance(vaultAddress);
        PropertyDAO dao = PropertyDAO(vault.dao());
        
        // Only allow in OpenToFund stage
        PropertyDAO.PropertyStage currentStage = dao.getCurrentStage();
        require(currentStage == PropertyDAO.PropertyStage.OpenToFund, 'StacksCrossChainManager: not in OpenToFund stage');

        // Calculate USD value at current price
        uint256 usdValue = calculateUsdValue(sbtcAmount);
        require(usdValue > 0, 'StacksCrossChainManager: invalid USD value');

        // Calculate shares based on USD value (same as USDC deposits)
        uint256 shares = vault.convertToShares(usdValue);
        require(shares > 0, 'StacksCrossChainManager: invalid shares calculation');

        // Update Stacks info
        PropertyStacksInfo storage stacksInfo = propertyStacksInfo[propertyId];
        stacksInfo.totalSbtcLocked += sbtcAmount;
        stacksInfo.totalUsdValueLocked += usdValue;
        stacksInfo.totalSharesMinted += shares;

        StacksUserInfo storage userInfo = stacksInfo.users[evmCustodian];
        userInfo.sbtcDeposited += sbtcAmount;
        userInfo.usdValueAtDeposit += usdValue;
        userInfo.sharesMinted += shares;
        userInfo.hasDeposited = true;
        userInfo.depositTimestamp = block.timestamp;
        userInfo.stacksTxHash = stacksTxHash;
        userInfo.stacksAddress = stacksAddress;
        userInfo.evmCustodian = evmCustodian;

        // Mint shares to EVM custodian address (not the Stacks user directly)
        vault.mintShares(evmCustodian, shares);

        // Mark message as processed
        crossChainMessages[messageId].processed = true;

        emit StacksDepositReceived(evmCustodian, propertyId, sbtcAmount, shares, stacksTxHash);
    }

    /**
     * @dev Process withdrawal message from Stacks
     * @param messageId Message ID
     * @param propertyId Property ID
     * @param evmCustodian EVM address holding shares (custodial)
     * @param stacksAddress Stacks address of the user
     * @param shares Amount of shares to burn
     */
    function _processWithdrawalMessage(
        bytes32 messageId,
        uint32 propertyId,
        address evmCustodian,
        string memory stacksAddress,
        uint256 shares
    ) internal {
        // Get vault and DAO for this property
        address vaultAddress = _getVaultForProperty(propertyId);
        require(vaultAddress != address(0), 'StacksCrossChainManager: vault not found');
        
        PropertyVaultGovernance vault = PropertyVaultGovernance(vaultAddress);
        PropertyDAO dao = PropertyDAO(vault.dao());
        
        // Only allow in OpenToFund stage
        PropertyDAO.PropertyStage currentStage = dao.getCurrentStage();
        require(currentStage == PropertyDAO.PropertyStage.OpenToFund, 'StacksCrossChainManager: not in OpenToFund stage');

        PropertyStacksInfo storage stacksInfo = propertyStacksInfo[propertyId];
        StacksUserInfo storage userInfo = stacksInfo.users[evmCustodian];
        
        require(userInfo.sharesMinted >= shares, 'StacksCrossChainManager: insufficient shares');
        require(userInfo.sbtcDeposited > 0, 'StacksCrossChainManager: no sBTC deposited');
        require(keccak256(bytes(userInfo.stacksAddress)) == keccak256(bytes(stacksAddress)), 'StacksCrossChainManager: Stacks address mismatch');

        // USD Value Lock: Return original sBTC amount (not current value)
        // Calculate sBTC amount to return (proportional to shares)
        uint256 sbtcToReturn = (userInfo.sbtcDeposited * shares) / userInfo.sharesMinted;
        uint256 usdValueToReturn = (userInfo.usdValueAtDeposit * shares) / userInfo.sharesMinted;

        // Update Stacks info
        userInfo.sharesMinted -= shares;
        userInfo.sbtcDeposited -= sbtcToReturn;
        userInfo.usdValueAtDeposit -= usdValueToReturn;
        stacksInfo.totalSharesMinted -= shares;
        stacksInfo.totalSbtcLocked -= sbtcToReturn;
        stacksInfo.totalUsdValueLocked -= usdValueToReturn;

        // Burn shares from EVM custodian address
        vault.burnShares(evmCustodian, shares);

        // Mark message as processed
        crossChainMessages[messageId].processed = true;

        // Note: sBTC is returned on Stacks side, not EVM side
        // This function just burns shares and updates records
        emit StacksWithdrawalRequested(evmCustodian, propertyId, shares, messageId);
    }

    /**
     * @dev Note: Stage transitions are handled automatically by EVM PropertyDAO
     * No need to process stage transition messages from Stacks
     */

    /**
     * @dev Register a property with its vault address
     * @param propertyId Property ID
     * @param vaultAddress Vault address for the property
     */
    function registerProperty(uint32 propertyId, address vaultAddress) external onlyOwner {
        require(vaultAddress != address(0), 'StacksCrossChainManager: invalid vault address');
        require(propertyToVault[propertyId] == address(0), 'StacksCrossChainManager: property already registered');
        
        propertyToVault[propertyId] = vaultAddress;
    }

    /**
     * @dev Register Stacks address to EVM address mapping for share custody
     * @param stacksAddress Stacks address (e.g., "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60")
     * @param evmAddress EVM address to hold shares for this Stacks user
     */
    function registerStacksAddress(string calldata stacksAddress, address evmAddress) external onlyOwner {
        require(evmAddress != address(0), 'StacksCrossChainManager: invalid EVM address');
        require(bytes(stacksAddress).length > 0, 'StacksCrossChainManager: invalid Stacks address');
        require(stacksToEvmAddress[stacksAddress] == address(0), 'StacksCrossChainManager: Stacks address already registered');
        
        stacksToEvmAddress[stacksAddress] = evmAddress;
    }

    /**
     * @dev Get vault address for a property (helper function)
     * @param propertyId Property ID
     * @return vaultAddress Vault address for the property
     */
    function _getVaultForProperty(uint32 propertyId) internal view returns (address vaultAddress) {
        return propertyToVault[propertyId];
    }


    /**
     * @dev Handle property purchase initiation
     * @param propertyId Property ID
     * @param totalUsdc Total USDC from vault
     * @param totalSbtc Total sBTC locked (to be converted manually off-chain)
     */
    function handlePropertyPurchaseInitiation(
        uint32 propertyId,
        uint256 totalUsdc,
        uint256 totalSbtc
    ) external onlyAuthorizedDAO {
        PropertyStacksInfo storage stacksInfo = propertyStacksInfo[propertyId];
        
        // Verify we have the expected sBTC amount
        require(stacksInfo.totalSbtcLocked == totalSbtc, 'StacksCrossChainManager: sBTC amount mismatch');
        require(totalSbtc > 0, 'StacksCrossChainManager: no sBTC to convert');

        // This function just notifies that property purchase is initiated
        // Platform will manually convert sBTC to USD off-chain
        // No automatic conversion happens here

        emit PropertyPurchaseInitiated(propertyId, totalUsdc, totalSbtc);
    }

    /**
     * @dev Manual sBTC to USD conversion (called by platform after vote passes)
     * @param propertyId Property ID
     * @param usdAmount Amount of USD received from sBTC conversion
     */
    function completeSbtcConversion(uint32 propertyId, uint256 usdAmount) external onlyAuthorizedDAO {
        PropertyStacksInfo storage stacksInfo = propertyStacksInfo[propertyId];
        require(stacksInfo.totalSbtcLocked > 0, 'StacksCrossChainManager: no sBTC locked');
        
        // Note: sBTC is on Stacks chain, not EVM
        // This function just records the conversion amount
        // The actual sBTC to USD conversion happens off-chain on Stacks
        uint256 sbtcAmount = stacksInfo.totalSbtcLocked;
        
        // Emit conversion event with actual USD amount received
        emit FundsConverted(propertyId, sbtcAmount, usdAmount);
    }

    /**
     * @dev Get Stacks user info for a property
     * @param evmCustodian EVM custodian address
     * @param propertyId Property ID
     * @return sbtcDeposited Amount of sBTC deposited
     * @return usdValueAtDeposit USD value at time of deposit
     * @return sharesMinted Amount of shares minted
     * @return hasDeposited Whether user has deposited
     * @return depositTimestamp When the deposit was made
     * @return stacksTxHash Stacks transaction hash
     * @return stacksAddress Stacks address of the user
     * @return evmCustodianAddress EVM custodian address
     */
    function getStacksUserInfo(
        address evmCustodian,
        uint32 propertyId
    ) external view returns (uint256 sbtcDeposited, uint256 usdValueAtDeposit, uint256 sharesMinted, bool hasDeposited, uint256 depositTimestamp, bytes32 stacksTxHash, string memory stacksAddress, address evmCustodianAddress) {
        StacksUserInfo storage userInfo = propertyStacksInfo[propertyId].users[evmCustodian];
        return (userInfo.sbtcDeposited, userInfo.usdValueAtDeposit, userInfo.sharesMinted, userInfo.hasDeposited, userInfo.depositTimestamp, userInfo.stacksTxHash, userInfo.stacksAddress, userInfo.evmCustodian);
    }

    /**
     * @dev Get total Stacks deposits for a property
     * @param propertyId Property ID
     * @return totalSbtc Total sBTC locked
     * @return totalUsdValue Total USD value locked
     * @return totalShares Total shares minted for Stacks users
     */
    function getTotalStacksDeposits(
        uint32 propertyId
    ) external view returns (uint256 totalSbtc, uint256 totalUsdValue, uint256 totalShares) {
        PropertyStacksInfo storage stacksInfo = propertyStacksInfo[propertyId];
        return (stacksInfo.totalSbtcLocked, stacksInfo.totalUsdValueLocked, stacksInfo.totalSharesMinted);
    }

    /**
     * @dev Check if EVM custodian is holding shares for a Stacks user
     * @param evmCustodian EVM custodian address
     * @param propertyId Property ID
     * @return isStacksUser True if custodian has sBTC deposits
     */
    function isStacksUser(address evmCustodian, uint32 propertyId) external view returns (bool) {
        return propertyStacksInfo[propertyId].users[evmCustodian].hasDeposited;
    }

    /**
     * @dev Get EVM custodian address for a Stacks address
     * @param stacksAddress Stacks address
     * @return evmCustodian EVM custodian address
     */
    function getEvmCustodian(string calldata stacksAddress) external view returns (address evmCustodian) {
        return stacksToEvmAddress[stacksAddress];
    }

    /**
     * @dev Emergency function to recover stuck tokens (only owner)
     * @param token Token address
     * @param amount Amount to recover
     */
    function emergencyRecover(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @dev Get cross-chain message details
     * @param messageId Message ID
     * @return message Cross-chain message struct
     */
    function getCrossChainMessage(bytes32 messageId) external view returns (CrossChainMessage memory message) {
        return crossChainMessages[messageId];
    }

    /**
     * @dev Check if message has been processed
     * @param messageId Message ID
     * @return processed Whether message has been processed
     */
    function isMessageProcessed(bytes32 messageId) external view returns (bool processed) {
        return processedMessages[messageId];
    }

    /**
     * @dev Process stage acknowledgment from Stacks
     * @param messageId Message ID
     * @param propertyId Property ID
     * @param acknowledgedStage Stage that Stacks acknowledged
     */
    function _processStageAcknowledgment(
        bytes32 messageId,
        uint32 propertyId,
        uint256 acknowledgedStage
    ) internal {
        // Verify this is the expected stage
        require(pendingStageChanges[propertyId] == uint8(acknowledgedStage), 'StacksCrossChainManager: stage mismatch');
        
        // Clear pending stage change
        delete pendingStageChanges[propertyId];
        delete stageChangeTimestamps[propertyId];
        
        // Mark message as processed
        crossChainMessages[messageId].processed = true;
        
        emit StacksStageChange(propertyId, uint8(acknowledgedStage)); // Re-emit for tracking
    }

    /**
     * @dev Notify Stacks contract about stage change (called by PropertyDAO)
     * @param propertyId Property ID
     * @param newStage New stage (0=OpenToFund, 1=Funded, 2=UnderManagement, 3=Liquidating, 4=Liquidated)
     */
    function notifyStacksStageChange(uint32 propertyId, uint8 newStage) external onlyAuthorizedDAO {
        require(newStage <= 4, 'StacksCrossChainManager: invalid stage');
        
        // Track pending stage change for acknowledgment
        pendingStageChanges[propertyId] = newStage;
        stageChangeTimestamps[propertyId] = block.timestamp;
        
        // Emit event for relayer to pick up and forward to Stacks
        emit StacksStageChange(propertyId, newStage);
    }

    /**
     * @dev Check if stage change is pending acknowledgment
     * @param propertyId Property ID
     * @return isPending Whether stage change is pending
     * @return pendingStage The pending stage
     * @return timestamp When the stage change was initiated
     */
    function getPendingStageChange(uint32 propertyId) external view returns (bool isPending, uint8 pendingStage, uint256 timestamp) {
        isPending = stageChangeTimestamps[propertyId] != 0;
        pendingStage = pendingStageChanges[propertyId];
        timestamp = stageChangeTimestamps[propertyId];
    }

    /**
     * @dev Retry stage change notification (if acknowledgment not received)
     * @param propertyId Property ID
     */
    function retryStageChangeNotification(uint32 propertyId) external onlyOwner {
        require(stageChangeTimestamps[propertyId] != 0, 'StacksCrossChainManager: no pending stage change');
        require(block.timestamp - stageChangeTimestamps[propertyId] > 5 minutes, 'StacksCrossChainManager: retry too soon');
        
        uint8 pendingStage = pendingStageChanges[propertyId];
        
        // Re-emit event for relayer to retry
        emit StacksStageChange(propertyId, pendingStage);
        
        // Update timestamp
        stageChangeTimestamps[propertyId] = block.timestamp;
    }
}
