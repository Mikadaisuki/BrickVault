// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './OFTUSDC.sol';

/**
 * @title StacksCrossChainManager
 * @dev Manages cross-chain operations between Stacks (sBTC) and EVM (OFTUSDC) for property vaults
 * @notice Handles cross-chain messaging and OFTUSDC liquidity pool for Stacks users
 * @notice Uses a liquidity pool of backed OFTUSDC instead of minting unbacked tokens
 * @notice sBTC is native to Stacks chain, not an ERC20 token on EVM
 * @notice Users deposit sBTC and receive OFTUSDC from pool to freely invest in any property
 */
contract StacksCrossChainManager is Ownable {
    using SafeERC20 for IERC20;

    // Events
    event StacksDepositReceived(address indexed user, uint256 sbtcAmount, uint256 oftusdcAmount, bytes32 indexed stacksTxHash);
    event CrossChainMessageProcessed(bytes32 indexed messageId, uint8 messageType);
    event StacksStageChange(uint32 indexed propertyId, uint8 newStage);
    event StacksAddressRegistered(string indexed stacksAddress, address indexed evmAddress, address indexed registrant);
    event LiquidityPoolFunded(address indexed funder, uint256 amount);
    event LiquidityPoolWithdrawn(address indexed recipient, uint256 amount);
    event StacksWithdrawal(address indexed user, uint256 oftusdcAmount, uint256 sbtcAmount, string stacksAddress);

    // Structs
    struct StacksUserInfo {
        uint256 sbtcDeposited;      // Amount of sBTC deposited by user (on Stacks)
        uint256 oftusdcReceived;    // Amount of OFTUSDC received from pool
        bool hasDeposited;          // Whether user has made a deposit
        uint256 depositTimestamp;   // When the deposit was made
        bytes32 stacksTxHash;       // Stacks transaction hash for the deposit
        string stacksAddress;       // Stacks address of the user
        address evmCustodian;       // EVM address holding the OFTUSDC (custodial)
    }

    struct CrossChainMessage {
        bytes32 messageId;          // Unique message identifier
        uint8 messageType;          // Type of message (1=deposit, 3=stage_ack)
        address evmCustodian;       // EVM address for OFTUSDC custody
        string stacksAddress;       // Stacks address of the user
        uint256 amount;             // Amount (sBTC)
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
    OFTUSDC public immutable oftusdcToken;  // OFTUSDC token contract (EVM side)
    
    // OFTUSDC Liquidity Pool (backed by locked USDC via adapter)
    // This pool is used to give OFTUSDC to Stacks users instead of minting unbacked tokens
    uint256 public liquidityPoolBalance;    // Amount of OFTUSDC available in pool
    
    // Cross-chain messaging
    mapping(bytes32 => CrossChainMessage) public crossChainMessages;
    mapping(bytes32 => bool) public processedMessages; // Prevent replay attacks
    mapping(bytes32 => bool) public usedStacksTxHashes; // Prevent double spending of Stacks transactions
    address public relayer;             // Authorized relayer address
    
    // Price oracle and management
    PriceInfo public currentPriceInfo;
    address public priceOracle;         // Price oracle contract address
    uint256 public constant PRICE_DECIMALS = 8; // sBTC price decimals
    uint256 public constant MAX_PRICE_AGE = 1 hours; // Max price age before considered stale
    uint256 public constant MAX_PRICE_DEVIATION = 500; // 5% max price deviation (500 basis points)
    bool public emergencyPaused;        // Emergency pause for extreme price movements
    
    // Mapping from Stacks address to user info
    mapping(string => StacksUserInfo) public stacksUsers;
    
    // Mapping from Stacks address (string) to EVM address for share custody
    mapping(string => address) public stacksToEvmAddress;
    
    

    // Modifiers

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
        address _oftusdcToken,
        address _priceOracle,
        address _relayer,
        address _owner
    ) Ownable(_owner) {
        require(_oftusdcToken != address(0), 'StacksCrossChainManager: invalid OFTUSDC token');
        require(_priceOracle != address(0), 'StacksCrossChainManager: invalid price oracle');
        require(_relayer != address(0), 'StacksCrossChainManager: invalid relayer');
        
        oftusdcToken = OFTUSDC(_oftusdcToken);
        priceOracle = _priceOracle;
        relayer = _relayer;
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
     * @dev Fund the OFTUSDC liquidity pool
     * @notice Only owner can fund the pool by transferring backed OFTUSDC
     * @param amount Amount of OFTUSDC to add to the pool
     */
    function fundLiquidityPool(uint256 amount) external onlyOwner {
        require(amount > 0, 'StacksCrossChainManager: amount must be positive');
        
        // Transfer OFTUSDC from sender to this contract
        IERC20(address(oftusdcToken)).safeTransferFrom(msg.sender, address(this), amount);
        
        liquidityPoolBalance += amount;
        
        emit LiquidityPoolFunded(msg.sender, amount);
    }
    
    /**
     * @dev Withdraw OFTUSDC from liquidity pool (only owner)
     * @notice Used to rebalance pool or recover funds in emergencies
     * @param amount Amount of OFTUSDC to withdraw
     * @param recipient Address to receive the OFTUSDC
     */
    function withdrawFromLiquidityPool(uint256 amount, address recipient) external onlyOwner {
        require(amount > 0, 'StacksCrossChainManager: amount must be positive');
        require(recipient != address(0), 'StacksCrossChainManager: invalid recipient');
        require(liquidityPoolBalance >= amount, 'StacksCrossChainManager: insufficient pool balance');
        
        liquidityPoolBalance -= amount;
        
        IERC20(address(oftusdcToken)).safeTransfer(recipient, amount);
        
        emit LiquidityPoolWithdrawn(recipient, amount);
    }
    
    /**
     * @dev Get available liquidity pool balance
     * @return balance Current OFTUSDC balance in the pool
     */
    function getPoolBalance() external view returns (uint256 balance) {
        return liquidityPoolBalance;
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
     * @param sbtcAmount Amount of sBTC (8 decimals)
     * @return usdValue USD value (18 decimals for OFTUSDC)
     */
    function calculateUsdValue(uint256 sbtcAmount) public view returns (uint256 usdValue) {
        require(currentPriceInfo.isValid, 'StacksCrossChainManager: price not available');
        require((block.timestamp - currentPriceInfo.lastUpdated) <= MAX_PRICE_AGE, 'StacksCrossChainManager: price too stale');
        
        // sbtcAmount (8 dec) * price (8 dec) * 100 = USD value (18 dec)
        usdValue = (sbtcAmount * currentPriceInfo.sbtcPriceUsd) * 100;
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
     * @param messageType Type of message (1=deposit, 3=stage_ack)
     * @param evmCustodian EVM address to hold OFTUSDC (custodial)
     * @param stacksAddress Stacks address of the user
     * @param amount Amount (sBTC)
     * @param stacksTxHash Stacks transaction hash
     */
    function processCrossChainMessage(
        bytes32 messageId,
        uint8 messageType,
        address evmCustodian,
        string calldata stacksAddress,
        uint256 amount,
        bytes32 stacksTxHash,
        bytes calldata /* proof */
    ) external onlyRelayer notEmergencyPaused {
        require(!processedMessages[messageId], 'StacksCrossChainManager: message already processed');
        require(messageType == 1 || messageType == 3, 'StacksCrossChainManager: invalid message type');
        require(amount > 0, 'StacksCrossChainManager: invalid amount');
        require(evmCustodian != address(0), 'StacksCrossChainManager: invalid EVM custodian');
        require(bytes(stacksAddress).length > 0, 'StacksCrossChainManager: invalid Stacks address');

        // Prevent double spending: check if Stacks transaction hash was already used
        require(!usedStacksTxHashes[stacksTxHash], 'StacksCrossChainManager: Stacks transaction already processed');

        // Note: Registration is validated on Stacks side - we trust the Stacks contract
        // The Stacks brick-vault-gateway contract only allows deposits from registered users
        
        // Update registration mapping if not already set
        if (stacksToEvmAddress[stacksAddress] == address(0)) {
            stacksToEvmAddress[stacksAddress] = evmCustodian;
        }

        // TODO: Implement merkle proof validation for stacksTxHash
        // For now, we trust the relayer (in production, implement proper proof validation)
        
        // Store message
        crossChainMessages[messageId] = CrossChainMessage({
            messageId: messageId,
            messageType: messageType,
            evmCustodian: evmCustodian,
            stacksAddress: stacksAddress,
            amount: amount,
            stacksTxHash: stacksTxHash,
            timestamp: block.timestamp,
            processed: false
        });

        // Process based on message type
        if (messageType == 1) {
            _processDepositMessage(messageId, evmCustodian, stacksAddress, amount, stacksTxHash);
        } else if (messageType == 3) {
            // Message type 3: Stage acknowledgment from Stacks
            // EVM doesn't need to process stage transitions, only acknowledge them
            _processStageAcknowledgment(messageId, amount);
        } else {
            revert('StacksCrossChainManager: invalid message type');
        }

        // Mark message and Stacks transaction as processed to prevent replay/double spending
        processedMessages[messageId] = true;
        usedStacksTxHashes[stacksTxHash] = true;
        emit CrossChainMessageProcessed(messageId, messageType);
    }

    /**
     * @dev Process deposit message from Stacks
     * @param messageId Message ID
     * @param evmCustodian EVM address to hold OFTUSDC (custodial)
     * @param stacksAddress Stacks address of the user
     * @param sbtcAmount Amount of sBTC deposited on Stacks
     * @param stacksTxHash Stacks transaction hash
     */
    function _processDepositMessage(
        bytes32 messageId,
        address evmCustodian,
        string memory stacksAddress,
        uint256 sbtcAmount,
        bytes32 stacksTxHash
    ) internal validPrice {
        // Calculate USD value at current price
        uint256 usdValue = calculateUsdValue(sbtcAmount);
        require(usdValue > 0, 'StacksCrossChainManager: invalid USD value');
        
        // Check pool has sufficient liquidity
        require(liquidityPoolBalance >= usdValue, 'StacksCrossChainManager: insufficient pool liquidity');

        // Update Stacks user info
        StacksUserInfo storage userInfo = stacksUsers[stacksAddress];
        userInfo.sbtcDeposited += sbtcAmount;
        userInfo.oftusdcReceived += usdValue;
        userInfo.hasDeposited = true;
        userInfo.depositTimestamp = block.timestamp;
        userInfo.stacksTxHash = stacksTxHash;
        userInfo.stacksAddress = stacksAddress;
        userInfo.evmCustodian = evmCustodian;

        // Transfer OFTUSDC from pool to EVM custodian address
        liquidityPoolBalance -= usdValue;
        IERC20(address(oftusdcToken)).safeTransfer(evmCustodian, usdValue);

        // Mark message as processed
        crossChainMessages[messageId].processed = true;

        emit StacksDepositReceived(evmCustodian, sbtcAmount, usdValue, stacksTxHash);
    }


    /**
     * @dev Note: Stage transitions are handled automatically by EVM PropertyDAO
     * No need to process stage transition messages from Stacks
     */


    /**
     * @dev Register Stacks address to EVM address mapping for OFTUSDC custody
     * @param stacksAddress Stacks address (e.g., "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60")
     * @param evmAddress EVM address to hold OFTUSDC for this Stacks user
     * @notice Users can self-register since they can only charge platform balance (no withdrawal risk)
     */
    function registerStacksAddress(string calldata stacksAddress, address evmAddress) external {
        require(evmAddress != address(0), 'StacksCrossChainManager: invalid EVM address');
        require(bytes(stacksAddress).length > 0, 'StacksCrossChainManager: invalid Stacks address');
        require(stacksToEvmAddress[stacksAddress] == address(0), 'StacksCrossChainManager: Stacks address already registered');
        
        stacksToEvmAddress[stacksAddress] = evmAddress;
        
        emit StacksAddressRegistered(stacksAddress, evmAddress, msg.sender);
    }




    /**
     * @dev Get Stacks user info
     * @param stacksAddress Stacks address of the user
     * @return sbtcDeposited Amount of sBTC deposited
     * @return oftusdcReceived Amount of OFTUSDC received from pool
     * @return hasDeposited Whether user has deposited
     * @return depositTimestamp When the deposit was made
     * @return stacksTxHash Stacks transaction hash
     * @return evmCustodianAddress EVM custodian address
     */
    function getStacksUserInfo(
        string calldata stacksAddress
    ) external view returns (uint256 sbtcDeposited, uint256 oftusdcReceived, bool hasDeposited, uint256 depositTimestamp, bytes32 stacksTxHash, address evmCustodianAddress) {
        StacksUserInfo storage userInfo = stacksUsers[stacksAddress];
        return (userInfo.sbtcDeposited, userInfo.oftusdcReceived, userInfo.hasDeposited, userInfo.depositTimestamp, userInfo.stacksTxHash, userInfo.evmCustodian);
    }

    /**
     * @dev Get total Stacks deposits across all users
     * @return totalSbtc Total sBTC deposited by all users
     * @return totalOftusdc Total OFTUSDC received from pool by all users
     */
    function getTotalStacksDeposits() external pure returns (uint256 totalSbtc, uint256 totalOftusdc) {
        // Note: This would require iterating through all users, which is gas-intensive
        // In practice, you might want to maintain running totals in state variables
        // For now, returning 0 as this function is not commonly used
        return (0, 0);
    }

    /**
     * @dev Check if a Stacks transaction hash has been used (prevents double spending)
     * @param stacksTxHash Stacks transaction hash to check
     * @return used True if the transaction hash has been used
     */
    function isStacksTxHashUsed(bytes32 stacksTxHash) external view returns (bool used) {
        return usedStacksTxHashes[stacksTxHash];
    }

    /**
     * @dev Check if Stacks address has made deposits
     * @param stacksAddress Stacks address
     * @return isStacksUser True if address has sBTC deposits
     */
    function isStacksUser(string calldata stacksAddress) external view returns (bool) {
        return stacksUsers[stacksAddress].hasDeposited;
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
     */
    function _processStageAcknowledgment(
        bytes32 messageId,
        uint256 /* acknowledgedStage */
    ) internal {
        // Mark message as processed
        crossChainMessages[messageId].processed = true;
        
        // Note: Stage changes are now handled by individual property DAOs
        // This function just acknowledges receipt of the message
    }

    /**
     * @dev Notify Stacks contract about stage change (called by PropertyDAO)
     * @param propertyId Property ID
     * @param newStage New stage (0=OpenToFund, 1=Funded, 2=UnderManagement, 3=Liquidating, 4=Liquidated)
     */
    function notifyStacksStageChange(uint32 propertyId, uint8 newStage) external onlyOwner {
        require(newStage <= 4, 'StacksCrossChainManager: invalid stage');
        
        // Emit event for relayer to pick up and forward to Stacks
        emit StacksStageChange(propertyId, newStage);
    }

}


