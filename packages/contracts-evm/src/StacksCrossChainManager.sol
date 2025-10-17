// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './OFTUSDC.sol';

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

    struct StacksUserInfo {
        uint256 sbtcDeposited;
        uint256 oftusdcReceived;
        bool hasDeposited;
        uint256 depositTimestamp;
        bytes32 stacksTxHash;
        string stacksAddress;
        address evmCustodian;
    }

    struct CrossChainMessage {
        bytes32 messageId;
        uint8 messageType;
        address evmCustodian;
        string stacksAddress;
        uint256 amount;
        bytes32 stacksTxHash;
        uint256 timestamp;
        bool processed;
    }

    struct PriceInfo {
        uint256 sbtcPriceUsd;
        uint256 lastUpdated;
        bool isValid;
    }

    OFTUSDC public immutable oftusdcToken;
    uint256 public liquidityPoolBalance;
    mapping(bytes32 => CrossChainMessage) public crossChainMessages;
    mapping(bytes32 => bool) public processedMessages;
    mapping(bytes32 => bool) public usedStacksTxHashes;
    address public relayer;
    PriceInfo public currentPriceInfo;
    address public priceOracle;
    uint256 public constant PRICE_DECIMALS = 8;
    uint256 public constant MAX_PRICE_DEVIATION = 500;
    bool public emergencyPaused;
    mapping(string => StacksUserInfo) public stacksUsers;
    mapping(string => address) public stacksToEvmAddress;
    
    

    // Modifiers

    modifier onlyRelayer() {
        require(msg.sender == relayer);
        _;
    }

    modifier notEmergencyPaused() {
        require(!emergencyPaused);
        _;
    }

    modifier validPrice() {
        require(currentPriceInfo.isValid);
        _;
    }

    constructor(
        address _oftusdcToken,
        address _priceOracle,
        address _relayer,
        address _owner
    ) Ownable(_owner) {
        require(_oftusdcToken != address(0));
        require(_priceOracle != address(0));
        require(_relayer != address(0));
        
        oftusdcToken = OFTUSDC(_oftusdcToken);
        priceOracle = _priceOracle;
        relayer = _relayer;
    }


    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0));
        relayer = _relayer;
    }
    
    function fundLiquidityPool(uint256 amount) external onlyOwner {
        require(amount > 0);
        IERC20(address(oftusdcToken)).safeTransferFrom(msg.sender, address(this), amount);
        liquidityPoolBalance += amount;
        emit LiquidityPoolFunded(msg.sender, amount);
    }
    
    function withdrawFromLiquidityPool(uint256 amount, address recipient) external onlyOwner {
        require(amount > 0);
        require(recipient != address(0));
        require(liquidityPoolBalance >= amount);
        liquidityPoolBalance -= amount;
        IERC20(address(oftusdcToken)).safeTransfer(recipient, amount);
        emit LiquidityPoolWithdrawn(recipient, amount);
    }
    
    function getPoolBalance() external view returns (uint256 balance) {
        return liquidityPoolBalance;
    }

    function setPriceOracle(address _priceOracle) external onlyOwner {
        require(_priceOracle != address(0));
        priceOracle = _priceOracle;
    }

    function updateSbtcPrice(uint256 newPrice) external {
        require(msg.sender == priceOracle || msg.sender == owner());
        require(newPrice > 0);
        
        if (currentPriceInfo.isValid) {
            uint256 priceChange = newPrice > currentPriceInfo.sbtcPriceUsd 
                ? newPrice - currentPriceInfo.sbtcPriceUsd
                : currentPriceInfo.sbtcPriceUsd - newPrice;
            
            uint256 priceChangePercent = (priceChange * 10000) / currentPriceInfo.sbtcPriceUsd;
            
            if (priceChangePercent > MAX_PRICE_DEVIATION) {
                emergencyPaused = true;
                revert();
            }
        }
        
        currentPriceInfo = PriceInfo({
            sbtcPriceUsd: newPrice,
            lastUpdated: block.timestamp,
            isValid: true
        });
    }

    function getSbtcPrice() external view returns (uint256 price, bool isValid) {
        price = currentPriceInfo.sbtcPriceUsd;
        isValid = currentPriceInfo.isValid;
    }

    function calculateUsdValue(uint256 sbtcAmount) public view returns (uint256 usdValue) {
        require(currentPriceInfo.isValid);
        usdValue = (sbtcAmount * currentPriceInfo.sbtcPriceUsd) * 100;
    }

    function setEmergencyPaused(bool paused) external onlyOwner {
        emergencyPaused = paused;
    }

    function processCrossChainMessage(
        bytes32 messageId,
        uint8 messageType,
        address evmCustodian,
        string calldata stacksAddress,
        uint256 amount,
        bytes32 stacksTxHash,
        bytes calldata
    ) external onlyRelayer notEmergencyPaused {
        require(!processedMessages[messageId]);
        require(messageType == 1 || messageType == 3);
        require(amount > 0);
        require(evmCustodian != address(0));
        require(bytes(stacksAddress).length > 0);
        require(!usedStacksTxHashes[stacksTxHash]);
        
        if (stacksToEvmAddress[stacksAddress] == address(0)) {
            stacksToEvmAddress[stacksAddress] = evmCustodian;
        }
        
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

        if (messageType == 1) {
            _processDepositMessage(messageId, evmCustodian, stacksAddress, amount, stacksTxHash);
        } else if (messageType == 3) {
            _processStageAcknowledgment(messageId, amount);
        } else {
            revert();
        }

        processedMessages[messageId] = true;
        usedStacksTxHashes[stacksTxHash] = true;
        emit CrossChainMessageProcessed(messageId, messageType);
    }

    function _processDepositMessage(
        bytes32 messageId,
        address evmCustodian,
        string memory stacksAddress,
        uint256 sbtcAmount,
        bytes32 stacksTxHash
    ) internal validPrice {
        uint256 usdValue = calculateUsdValue(sbtcAmount);
        require(usdValue > 0);
        require(liquidityPoolBalance >= usdValue);

        StacksUserInfo storage userInfo = stacksUsers[stacksAddress];
        userInfo.sbtcDeposited += sbtcAmount;
        userInfo.oftusdcReceived += usdValue;
        userInfo.hasDeposited = true;
        userInfo.depositTimestamp = block.timestamp;
        userInfo.stacksTxHash = stacksTxHash;
        userInfo.stacksAddress = stacksAddress;
        userInfo.evmCustodian = evmCustodian;

        liquidityPoolBalance -= usdValue;
        IERC20(address(oftusdcToken)).safeTransfer(evmCustodian, usdValue);
        crossChainMessages[messageId].processed = true;

        emit StacksDepositReceived(evmCustodian, sbtcAmount, usdValue, stacksTxHash);
    }

    function registerStacksAddress(string calldata stacksAddress, address evmAddress) external {
        require(evmAddress != address(0));
        require(bytes(stacksAddress).length > 0);
        require(stacksToEvmAddress[stacksAddress] == address(0));
        stacksToEvmAddress[stacksAddress] = evmAddress;
        emit StacksAddressRegistered(stacksAddress, evmAddress, msg.sender);
    }




    function getStacksUserInfo(
        string calldata stacksAddress
    ) external view returns (uint256 sbtcDeposited, uint256 oftusdcReceived, bool hasDeposited, uint256 depositTimestamp, bytes32 stacksTxHash, address evmCustodianAddress) {
        StacksUserInfo storage userInfo = stacksUsers[stacksAddress];
        return (userInfo.sbtcDeposited, userInfo.oftusdcReceived, userInfo.hasDeposited, userInfo.depositTimestamp, userInfo.stacksTxHash, userInfo.evmCustodian);
    }

    function getTotalStacksDeposits() external pure returns (uint256 totalSbtc, uint256 totalOftusdc) {
        return (0, 0);
    }

    function isStacksTxHashUsed(bytes32 stacksTxHash) external view returns (bool used) {
        return usedStacksTxHashes[stacksTxHash];
    }

    function isStacksUser(string calldata stacksAddress) external view returns (bool) {
        return stacksUsers[stacksAddress].hasDeposited;
    }

    function getEvmCustodian(string calldata stacksAddress) external view returns (address evmCustodian) {
        return stacksToEvmAddress[stacksAddress];
    }

    function emergencyRecover(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    function getCrossChainMessage(bytes32 messageId) external view returns (CrossChainMessage memory message) {
        return crossChainMessages[messageId];
    }

    function isMessageProcessed(bytes32 messageId) external view returns (bool processed) {
        return processedMessages[messageId];
    }

    function _processStageAcknowledgment(
        bytes32 messageId,
        uint256
    ) internal {
        crossChainMessages[messageId].processed = true;
    }

    function notifyStacksStageChange(uint32 propertyId, uint8 newStage) external onlyOwner {
        require(newStage <= 4);
        emit StacksStageChange(propertyId, newStage);
    }

}


