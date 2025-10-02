// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './PropertyVaultGovernance.sol';
import './StacksCrossChainManager.sol';

/**
 * @title PropertyDAO
 * @dev Comprehensive DAO governance for property vaults
 * @notice Handles all property decisions: funding, liquidation, management, etc.
 */
contract PropertyDAO is Ownable, Pausable, ReentrancyGuard {
    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType proposalType,
        string description,
        uint256 deadline,
        bytes data
    );
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, bool success);
    event PropertyFunded(uint256 propertyId, uint256 totalRaised, uint256 targetAmount);
    event PropertyLiquidated(uint256 propertyId, uint256 salePrice, uint256 proceeds);
    event ThresholdUpdated(uint256 propertyId, ThresholdType thresholdType, uint256 newThreshold);
    event StageChanged(PropertyStage newStage);
    // Cross-chain event removed for new business structure

    // Enums
    enum ProposalType {
        PropertyLiquidation,    // Liquidate property
        PropertyPurchase,       // Purchase property with funds (includes withdrawal approval)
        ThresholdUpdate,        // Update action thresholds
        ManagementChange,       // Change property manager
        NAVUpdate,             // Update property valuation
        EmergencyPause,        // Pause all operations
        EmergencyUnpause,      // Resume operations
        PropertyStageChange    // Change property stage
    }

    enum ThresholdType {
        LiquidationThreshold,   // % of shares needed to trigger liquidation
        EmergencyThreshold      // % of shares needed for emergency actions
    }

    enum PropertyStage {
        OpenToFund,            // Property is open for investment
        Funded,                // Property is fully funded and purchased
        UnderManagement,       // Property is under management
        Liquidating,           // Property is being liquidated
        Liquidated             // Property has been liquidated
    }

    enum ProposalStatus {
        Active,
        Executed,
        Rejected,
        Expired
    }

    // Structs
    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        string description;
        uint256 deadline;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
        ProposalStatus status;
        bytes data; // Encoded function call data
    }

    struct Vote {
        bool hasVoted;
        bool support;
        uint256 weight;
    }

    struct PropertyThresholds {
        uint256 liquidationThreshold; // % of shares needed to trigger liquidation (default 20%)
        uint256 emergencyThreshold;   // % of shares needed for emergency actions (default 50%)
    }

    struct PropertyInfo {
        PropertyStage stage;          // Current property stage
        uint256 totalValue;           // Total property value
        uint256 totalInvested;        // Total amount invested by users
        uint256 fundingTarget;        // Target amount to fund (set by platform)
        uint256 fundingDeadline;      // Deadline for funding (set by platform)
        bool isFullyFunded;          // Whether property is fully funded
    }

    // State variables
    PropertyVaultGovernance public immutable propertyVault;
    StacksCrossChainManager public stacksManager;
    uint32 public immutable propertyId;
    uint256 public proposalCount;
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant EXECUTION_DELAY = 1 days;
    uint256 public constant QUORUM_THRESHOLD = 30; // 30% of total shares
    uint256 public constant MAJORITY_THRESHOLD = 51; // 51% of votes

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public votes;
    mapping(address => bool) public authorizedExecutors;
    
    // Property-specific state
    PropertyThresholds public thresholds;
    PropertyInfo public propertyInfo;
    bool public isLiquidating;

    // Modifiers
    modifier onlyShareholder() {
        require(propertyVault.balanceOf(msg.sender) > 0, 'PropertyDAO: not a shareholder');
        _;
    }

    modifier onlyAuthorizedExecutor() {
        require(
            authorizedExecutors[msg.sender] || msg.sender == owner(),
            'PropertyDAO: not authorized executor'
        );
        _;
    }

    modifier notLiquidating() {
        require(!isLiquidating, 'PropertyDAO: property is liquidating');
        _;
    }

    constructor(
        address _propertyVault,
        address _owner
    ) Ownable(_owner) {
        propertyVault = PropertyVaultGovernance(_propertyVault);
        propertyId = propertyVault.propertyId();
        authorizedExecutors[msg.sender] = true;
        
        // Set default thresholds
        thresholds = PropertyThresholds({
            liquidationThreshold: 20, // 20%
            emergencyThreshold: 50    // 50%
        });
        
        // Initialize property info
        propertyInfo = PropertyInfo({
            stage: PropertyStage.OpenToFund,
            totalValue: 0,
            totalInvested: 0,
            fundingTarget: 0,
            fundingDeadline: 0,
            isFullyFunded: false
        });
    }

    /**
     * @dev Set StacksCrossChainManager address
     * @param _stacksManager Address of the StacksCrossChainManager contract
     */
    function setStacksCrossChainManager(address _stacksManager) external onlyOwner {
        require(_stacksManager != address(0), 'PropertyDAO: invalid Stacks manager address');
        stacksManager = StacksCrossChainManager(_stacksManager);
    }

    /**
     * @dev Create a new proposal (shareholders only)
     * @param proposalType Type of proposal
     * @param description Description of the proposal
     * @param data Encoded function call data
     */
    function createProposal(
        ProposalType proposalType,
        string memory description,
        bytes memory data
    ) external onlyShareholder notLiquidating returns (uint256) {
        require(bytes(description).length > 0, 'PropertyDAO: description required');
        
        // Stage-based proposal creation restrictions
        if (propertyInfo.stage == PropertyStage.OpenToFund) {
            require(false, 'PropertyDAO: cannot create proposals in OpenToFund stage');
        } else if (propertyInfo.stage == PropertyStage.Liquidating) {
            require(false, 'PropertyDAO: cannot create proposals in Liquidating stage');
        } else if (propertyInfo.stage == PropertyStage.Liquidated) {
            require(false, 'PropertyDAO: cannot create proposals in Liquidated stage');
        }
        
        // In Funded stage, block all proposal types
        // Only the platform can move to UnderManagement through property purchase process
        if (propertyInfo.stage == PropertyStage.Funded) {
            require(false, 'PropertyDAO: in Funded stage, no proposals allowed - only platform can move to UnderManagement through property purchase');
        }
        
        // In UnderManagement stage, restrict platform-managed proposal types
        if (propertyInfo.stage == PropertyStage.UnderManagement) {
            // PropertyPurchase is only for platform (already purchased property)
            require(proposalType != ProposalType.PropertyPurchase, 'PropertyDAO: PropertyPurchase proposals are platform-managed only');
            
            // NAVUpdate is only for platform (platform manages property and accounting)
            require(proposalType != ProposalType.NAVUpdate, 'PropertyDAO: NAVUpdate proposals are platform-managed only');
            
            // PropertyStageChange can only move to Liquidating (next stage)
            if (proposalType == ProposalType.PropertyStageChange) {
                (uint8 newStage) = abi.decode(data, (uint8));
                require(newStage == 3, 'PropertyDAO: in UnderManagement stage, can only propose move to Liquidating stage');
            }
        }
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            proposalType: proposalType,
            description: description,
            deadline: block.timestamp + VOTING_PERIOD,
            votesFor: 0,
            votesAgainst: 0,
            executed: false,
            status: ProposalStatus.Active,
            data: data
        });

        emit ProposalCreated(proposalId, msg.sender, proposalType, description, block.timestamp + VOTING_PERIOD, data);
        return proposalId;
    }

    /**
     * @dev Create a proposal as platform (only owner)
     * @param proposalType Type of proposal
     * @param description Description of the proposal
     * @param data Encoded function call data
     */
    function createPlatformProposal(
        ProposalType proposalType,
        string memory description,
        bytes memory data
    ) internal notLiquidating returns (uint256) {
        require(bytes(description).length > 0, 'PropertyDAO: description required');
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            proposalType: proposalType,
            description: description,
            deadline: block.timestamp + VOTING_PERIOD,
            data: data,
            status: ProposalStatus.Active,
            votesFor: 0,
            votesAgainst: 0,
            executed: false
        });
        
        emit ProposalCreated(proposalId, msg.sender, proposalType, description, block.timestamp + VOTING_PERIOD, data);
        return proposalId;
    }

    /**
     * @dev Platform proposes to close funding and move to Funded stage
     * @notice This function is deprecated - funding closes automatically when target is reached
     */
    function proposeCloseFunding(string memory /* description */) external view onlyOwner notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.OpenToFund, 'PropertyDAO: not in OpenToFund stage');
        require(propertyInfo.isFullyFunded, 'PropertyDAO: funding target not reached');
        
        // Funding should close automatically when target is reached
        // This function is kept for backward compatibility but should not be used
        revert('PropertyDAO: funding closes automatically when target is reached');
    }

    /**
     * @dev Vote on a proposal
     * @param proposalId ID of the proposal
     * @param support True for yes, false for no
     */
    function vote(uint256 proposalId, bool support) external onlyShareholder {
        // Stage-based voting restrictions
        if (propertyInfo.stage == PropertyStage.OpenToFund) {
            require(false, 'PropertyDAO: cannot vote in OpenToFund stage');
        } else if (propertyInfo.stage == PropertyStage.Liquidating) {
            require(false, 'PropertyDAO: cannot vote in Liquidating stage');
        } else if (propertyInfo.stage == PropertyStage.Liquidated) {
            require(false, 'PropertyDAO: cannot vote in Liquidated stage');
        }
        
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active, 'PropertyDAO: proposal not active');
        require(block.timestamp <= proposal.deadline, 'PropertyDAO: voting period ended');
        require(!votes[proposalId][msg.sender].hasVoted, 'PropertyDAO: already voted');

        uint256 weight = propertyVault.balanceOf(msg.sender);
        require(weight > 0, 'PropertyDAO: no shares to vote with');

        votes[proposalId][msg.sender] = Vote({
            hasVoted: true,
            support: support,
            weight: weight
        });

        if (support) {
            proposal.votesFor += weight;
        } else {
            proposal.votesAgainst += weight;
        }

        emit Voted(proposalId, msg.sender, support, weight);
    }

    /**
     * @dev Handle stage transition to Funded (called by platform)
     * This only changes the stage - sBTC conversion happens after vote passes
     */
    function transitionToFunded() external onlyOwner {
        require(propertyInfo.stage == PropertyStage.OpenToFund, 'PropertyDAO: not in OpenToFund stage');
        require(propertyInfo.isFullyFunded, 'PropertyDAO: property not fully funded');
        
        // Update stage to Funded
        propertyInfo.stage = PropertyStage.Funded;
        
        // No automatic sBTC conversion here - that happens after vote passes
        // Users will vote on property purchase, then platform manually converts sBTC to USD off-chain
        
        emit StageChanged(PropertyStage.Funded);
    }

    /**
     * @dev Handle property purchase initiation after vote passes
     * This coordinates manual sBTC to USD conversion and property purchase
     */
    function initiatePropertyPurchaseWithStacks() external onlyOwner {
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        
        // Get vault funds (EVM USDC)
        uint256 vaultUsdc = propertyVault.totalAssets();
        
        // Get Stacks funds info
        uint256 stacksSbtc = 0;
        uint256 stacksUsdValue = 0;
        if (address(stacksManager) != address(0)) {
            (stacksSbtc, stacksUsdValue, ) = stacksManager.getTotalStacksDeposits(propertyId);
        }
        
        // Notify Stacks manager about property purchase initiation
        // This allows platform to manually convert sBTC to USD off-chain
        if (address(stacksManager) != address(0)) {
            stacksManager.handlePropertyPurchaseInitiation(propertyId, vaultUsdc, stacksSbtc);
        }
        
        // Initiate property purchase in vault (withdraws EVM USDC funds)
        propertyVault.initiatePropertyPurchase(vaultUsdc, msg.sender);
        
        // Note: Platform will manually:
        // 1. Convert sBTC to USD off-chain using the locked sBTC
        // 2. Use both EVM USDC and converted USD to purchase property
        // 3. Call completePropertyPurchase() when property is acquired
    }

    /**
     * @dev Execute a proposal
     * @param proposalId ID of the proposal to execute
     */
    function executeProposal(uint256 proposalId) external onlyAuthorizedExecutor nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active, 'PropertyDAO: proposal not active');
        require(block.timestamp > proposal.deadline, 'PropertyDAO: voting period not ended');
        require(!proposal.executed, 'PropertyDAO: already executed');

        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 totalShares = propertyVault.totalSupply();
        
        require(totalShares > 0, 'PropertyDAO: no shares minted yet');
        require(totalVotes > 0, 'PropertyDAO: no votes cast');
        
        // Check quorum (30% of total shares must vote)
        require(
            totalVotes >= (totalShares * QUORUM_THRESHOLD) / 100,
            'PropertyDAO: quorum not met'
        );

        // Check majority (51% of votes must be in favor)
        require(
            proposal.votesFor > (totalVotes * MAJORITY_THRESHOLD) / 100,
            'PropertyDAO: majority not reached'
        );

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;

        // Execute the proposal based on type
        bool success = _executeProposal(proposal);
        
        emit ProposalExecuted(proposalId, success);
    }

    /**
     * @dev Execute proposal based on type
     * @param proposal The proposal to execute
     */
    function _executeProposal(Proposal memory proposal) internal returns (bool) {
        if (proposal.proposalType == ProposalType.PropertyLiquidation) {
            return _executePropertyLiquidation(proposal.data);
        } else if (proposal.proposalType == ProposalType.PropertyPurchase) {
            return _executePropertyPurchase(proposal.data);
        } else if (proposal.proposalType == ProposalType.ThresholdUpdate) {
            return _executeThresholdUpdate(proposal.data);
        } else if (proposal.proposalType == ProposalType.PropertyStageChange) {
            return _executePropertyStageChange(proposal.data);
        } else if (proposal.proposalType == ProposalType.NAVUpdate) {
            return _executeNAVUpdate(proposal.data);
        } else if (proposal.proposalType == ProposalType.EmergencyPause) {
            return _executeEmergencyPause();
        } else if (proposal.proposalType == ProposalType.EmergencyUnpause) {
            return _executeEmergencyUnpause();
        }
        return false;
    }

    /**
     * @dev Execute property stage change
     * @param data Encoded stage change data (newStage)
     */
    function _executePropertyStageChange(bytes memory data) internal returns (bool) {
        PropertyStage newStage = PropertyStage(abi.decode(data, (uint8)));
        
        // Validate stage transition
        require(_isValidStageTransition(propertyInfo.stage, newStage), 'PropertyDAO: invalid stage transition');
        
        propertyInfo.stage = newStage;
        
        // Handle stage-specific logic
        if (newStage == PropertyStage.Funded) {
            propertyInfo.isFullyFunded = true;
        } else if (newStage == PropertyStage.Liquidating) {
            isLiquidating = true;
            propertyVault.pauseForLiquidation();
        }
        
        return true;
    }

    /**
     * @dev Execute property purchase (includes fund withdrawal approval)
     * @param data Encoded purchase data (purchasePrice, propertyManager)
     */
    function _executePropertyPurchase(bytes memory data) internal returns (bool) {
        (uint256 purchasePrice, address propertyManager) = abi.decode(data, (uint256, address));
        
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        require(propertyInfo.isFullyFunded, 'PropertyDAO: funding target not reached');
        require(purchasePrice > 0, 'PropertyDAO: invalid purchase price');
        require(propertyManager != address(0), 'PropertyDAO: invalid property manager');
        
        // Stage is already Funded, so deposits and withdrawals are already blocked
        // Call vault to initiate purchase
        propertyVault.initiatePropertyPurchase(purchasePrice, propertyManager);
        
        // Immediately withdraw funds for purchase (users voted to approve this)
        propertyVault.withdrawForPurchase(purchasePrice);
        
        emit PropertyFunded(propertyId, propertyInfo.totalInvested, purchasePrice);
        return true;
    }


    /**
     * @dev Execute property liquidation
     * @param data Encoded liquidation data (salePrice, buyer)
     */
    function _executePropertyLiquidation(bytes memory data) internal returns (bool) {
        (uint256 salePrice, address buyer) = abi.decode(data, (uint256, address));
        
        require(!isLiquidating, 'PropertyDAO: already liquidating');
        require(salePrice > 0, 'PropertyDAO: invalid sale price');
        require(buyer != address(0), 'PropertyDAO: invalid buyer');
        
        isLiquidating = true;
        
        // Pause the vault
        propertyVault.pauseForLiquidation();
        
        emit PropertyLiquidated(propertyId, salePrice, salePrice);
        return true;
    }

    /**
     * @dev Execute threshold update
     * @param data Encoded threshold data (thresholdType, newThreshold)
     */
    function _executeThresholdUpdate(bytes memory data) internal returns (bool) {
        (uint8 thresholdTypeRaw, uint256 newThreshold) = abi.decode(data, (uint8, uint256));
        ThresholdType thresholdType = ThresholdType(thresholdTypeRaw);
        
        require(newThreshold > 0 && newThreshold <= 100, 'PropertyDAO: invalid threshold');
        
        if (thresholdType == ThresholdType.LiquidationThreshold) {
            thresholds.liquidationThreshold = newThreshold;
        } else if (thresholdType == ThresholdType.EmergencyThreshold) {
            thresholds.emergencyThreshold = newThreshold;
        }
        
        emit ThresholdUpdated(propertyId, thresholdType, newThreshold);
        return true;
    }

    /**
     * @dev Validate stage transition
     * @param currentStage Current property stage
     * @param newStage New property stage
     */
    function _isValidStageTransition(PropertyStage currentStage, PropertyStage newStage) internal pure returns (bool) {
        if (currentStage == PropertyStage.OpenToFund) {
            return newStage == PropertyStage.Funded || newStage == PropertyStage.Liquidating;
        } else if (currentStage == PropertyStage.Funded) {
            return newStage == PropertyStage.UnderManagement || newStage == PropertyStage.Liquidating;
        } else if (currentStage == PropertyStage.UnderManagement) {
            return newStage == PropertyStage.Liquidating;
        } else if (currentStage == PropertyStage.Liquidating) {
            return newStage == PropertyStage.Liquidated;
        }
        return false; // Liquidated is final stage
    }

    /**
     * @dev Execute NAV update
     * @param data Encoded NAV update data
     */
    function _executeNAVUpdate(bytes memory data) internal returns (bool) {
        int256 delta = abi.decode(data, (int256));
        
        try propertyVault.updateNAV(delta) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Execute emergency pause
     */
    function _executeEmergencyPause() internal returns (bool) {
        try propertyVault.pause() {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Execute emergency unpause
     */
    function _executeEmergencyUnpause() internal returns (bool) {
        try propertyVault.unpause() {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Set property funding target (only callable by platform/owner)
     * @param targetAmount Target amount to fund
     * @param deadline Funding deadline
     */
    function setFundingTarget(uint256 targetAmount, uint256 deadline) external onlyOwner {
        require(propertyInfo.stage == PropertyStage.OpenToFund, 'PropertyDAO: not in OpenToFund stage');
        require(targetAmount > 0, 'PropertyDAO: invalid target amount');
        require(deadline > block.timestamp, 'PropertyDAO: invalid deadline');
        
        propertyInfo.fundingTarget = targetAmount;
        propertyInfo.fundingDeadline = deadline;
    }

    /**
     * @dev Update property value (only callable by platform/owner)
     * @param newValue New property value
     */
    function updatePropertyValue(uint256 newValue) external onlyOwner {
        propertyInfo.totalValue = newValue;
    }

    /**
     * @dev Update total invested amount (only callable by vault or platform)
     * @param newInvested New total invested amount
     */
    function updateTotalInvested(uint256 newInvested) external {
        address currentOwner = owner();
        require(msg.sender == address(propertyVault) || msg.sender == currentOwner, 'PropertyDAO: only vault or owner');
        propertyInfo.totalInvested = newInvested;
        
        // Check if property is fully funded
        if (newInvested >= propertyInfo.fundingTarget && propertyInfo.fundingTarget > 0 && !propertyInfo.isFullyFunded) {
            propertyInfo.isFullyFunded = true;
            
            // Automatically close deposits and withdrawals when funding target is reached
            if (propertyInfo.stage == PropertyStage.OpenToFund) {
                propertyInfo.stage = PropertyStage.Funded;
                
                // Notify Stacks contract about stage change
                if (address(stacksManager) != address(0)) {
                    stacksManager.notifyStacksStageChange(propertyId, uint8(PropertyStage.Funded));
                }
                
                // Automatically create property purchase proposal when funding target is reached
                _createAutoPropertyPurchaseProposal();
            }
        }
    }

    /**
     * @dev Create automatic property purchase proposal when funding target is reached
     */
    function _createAutoPropertyPurchaseProposal() internal {
        // Create a default property purchase proposal
        // The platform can update the details later if needed
        uint256 purchasePrice = propertyInfo.totalInvested; // Use total invested as purchase price
        address propertyManager = owner(); // Use owner as default property manager
        
        // Encode the purchase data
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
        
        // Create proposal for property purchase
        createPlatformProposal(
            ProposalType.PropertyPurchase,
            "Automatic property purchase proposal - funding target reached",
            purchaseData
        );
    }

    /**
     * @dev Check if liquidation threshold is met
     */
    function isLiquidationThresholdMet() external pure returns (bool) {
        // This would need to track shares that voted for liquidation
        // For now, return false as placeholder
        return false;
    }

    /**
     * @dev Get proposal details
     * @param proposalId ID of the proposal
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    /**
     * @dev Get voting power of an address
     * @param voter Address to check
     */
    function getVotingPower(address voter) external view returns (uint256) {
        return propertyVault.balanceOf(voter);
    }

    /**
     * @dev Check if a proposal can be executed
     * @param proposalId ID of the proposal
     */
    function canExecute(uint256 proposalId) external view returns (bool) {
        Proposal memory proposal = proposals[proposalId];
        if (proposal.status != ProposalStatus.Active) return false;
        if (block.timestamp <= proposal.deadline) return false;
        if (proposal.executed) return false;

        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 totalShares = propertyVault.totalSupply();
        
        // Check quorum and majority
        return totalVotes >= (totalShares * QUORUM_THRESHOLD) / 100 &&
               proposal.votesFor > (totalVotes * MAJORITY_THRESHOLD) / 100;
    }

    /**
     * @dev Get current thresholds
     */
    function getThresholds() external view returns (PropertyThresholds memory) {
        return thresholds;
    }

    /**
     * @dev Get property info
     */
    function getPropertyInfo() external view returns (PropertyInfo memory) {
        return propertyInfo;
    }

    /**
     * @dev Get current property stage
     */
    function getCurrentStage() external view returns (PropertyStage) {
        return propertyInfo.stage;
    }

    /**
     * @dev Check if property is fully funded
     */
    function isFullyFunded() external view returns (bool) {
        return propertyInfo.isFullyFunded;
    }

    /**
     * @dev Add authorized executor
     * @param executor Address to authorize
     */
    function addAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = true;
    }

    /**
     * @dev Remove authorized executor
     * @param executor Address to remove authorization
     */
    function removeAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = false;
    }

    /**
     * @dev Create property purchase proposal (shareholders can vote on this)
     * @param purchasePrice The total price to purchase the property
     * @param propertyManager Address that will receive funds for purchase
     * @param description Description of the property purchase proposal
     */
    function proposePropertyPurchase(
        uint256 purchasePrice, 
        address propertyManager, 
        string memory description
    ) external onlyShareholder notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        require(propertyInfo.isFullyFunded, 'PropertyDAO: funding target not reached');
        require(purchasePrice > 0, 'PropertyDAO: invalid purchase price');
        require(propertyManager != address(0), 'PropertyDAO: invalid property manager');
        require(bytes(description).length > 0, 'PropertyDAO: description required');
        
        // Encode the purchase data
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
        
        // Create proposal for property purchase
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            proposalType: ProposalType.PropertyPurchase,
            description: description,
            deadline: block.timestamp + VOTING_PERIOD,
            votesFor: 0,
            votesAgainst: 0,
            executed: false,
            status: ProposalStatus.Active,
            data: purchaseData
        });

        emit ProposalCreated(proposalId, msg.sender, ProposalType.PropertyPurchase, description, block.timestamp + VOTING_PERIOD, purchaseData);
        return proposalId;
    }

    /**
     * @dev Platform can also create property purchase proposal (for convenience)
     * @param purchasePrice The total price to purchase the property
     * @param propertyManager Address that will receive funds for purchase
     * @param description Description of the property purchase proposal
     */
    function createPropertyPurchaseProposal(
        uint256 purchasePrice, 
        address propertyManager, 
        string memory description
    ) external onlyOwner notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        require(propertyInfo.isFullyFunded, 'PropertyDAO: funding target not reached');
        require(purchasePrice > 0, 'PropertyDAO: invalid purchase price');
        require(propertyManager != address(0), 'PropertyDAO: invalid property manager');
        require(bytes(description).length > 0, 'PropertyDAO: description required');
        
        // Encode the purchase data
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
        
        // Create proposal for property purchase
        return createPlatformProposal(
            ProposalType.PropertyPurchase,
            description,
            purchaseData
        );
    }

    /**
     * @dev Complete property purchase (only callable by platform/owner)
     * @param propertyAddress Physical property address/identifier
     */
    function completePropertyPurchase(string memory propertyAddress) external onlyOwner {
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        
        // Call vault to complete purchase
        propertyVault.completePropertyPurchase(propertyAddress);
        
        // Change stage to UnderManagement to allow income withdrawals
        propertyInfo.stage = PropertyStage.UnderManagement;
    }


    /**
     * @dev Update property stage (internal function called by vault)
     * @param newStage New property stage (0=OpenToFund, 1=Funded, 2=UnderManagement, 3=Liquidating, 4=Liquidated)
     */
    function updatePropertyStage(uint8 newStage) external {
        require(msg.sender == address(propertyVault) || msg.sender == owner(), 'PropertyDAO: only vault or owner');
        require(newStage <= 4, 'PropertyDAO: invalid stage');
        
        PropertyStage oldStage = propertyInfo.stage;
        propertyInfo.stage = PropertyStage(newStage);
        
        // Notify cross-chain about stage change
        if (address(stacksManager) != address(0)) {
            stacksManager.notifyStacksStageChange(propertyId, newStage);
        }
        
        emit StageChanged(PropertyStage(newStage));
    }

    // Cross-chain notification function removed for new business structure

    /**
     * @dev Check if property is ready for purchase
     */
    function isReadyForPurchase() external view returns (bool) {
        return propertyInfo.isFullyFunded && 
               propertyInfo.stage == PropertyStage.Funded;
    }

    /**
     * @dev Revert property back to OpenToFund stage (only callable by owner)
     * @notice This allows reopening deposits if funding target needs to be adjusted
     */
    function revertToOpenToFund() external onlyOwner {
        require(propertyInfo.stage == PropertyStage.Funded, 'PropertyDAO: not in Funded stage');
        
        propertyInfo.stage = PropertyStage.OpenToFund;
        propertyInfo.isFullyFunded = false; // Reset funding status
        
        // Notify cross-chain about stage change
        if (address(stacksManager) != address(0)) {
            stacksManager.notifyStacksStageChange(propertyId, uint8(PropertyStage.OpenToFund));
        }
        
        emit StageChanged(PropertyStage.OpenToFund);
    }
}
