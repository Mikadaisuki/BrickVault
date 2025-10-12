// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './PropertyVaultGovernance.sol';

contract PropertyDAO is Ownable, Pausable, ReentrancyGuard {
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

    enum ProposalType {
        PropertyLiquidation,
        PropertyPurchase,
        ThresholdUpdate,
        ManagementChange,
        NAVUpdate,
        EmergencyPause,
        EmergencyUnpause,
        PropertyStageChange
    }

    enum ThresholdType {
        LiquidationThreshold,
        EmergencyThreshold
    }

    enum PropertyStage {
        OpenToFund,
        Funded,
        UnderManagement,
        Liquidating,
        Liquidated
    }

    enum ProposalStatus {
        Active,
        Executed,
        Rejected,
        Expired
    }

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
        bytes data;
    }

    struct Vote {
        bool hasVoted;
        bool support;
        uint256 weight;
    }

    struct PropertyThresholds {
        uint256 liquidationThreshold;
        uint256 emergencyThreshold;
    }

    struct PropertyInfo {
        PropertyStage stage;
        uint256 totalValue;
        uint256 totalInvested;
        uint256 fundingTarget;
        uint256 fundingDeadline;
        bool isFullyFunded;
    }

    PropertyVaultGovernance public immutable propertyVault;
    uint32 public immutable propertyId;
    uint256 public proposalCount;
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant EXECUTION_DELAY = 1 days;
    uint256 public constant QUORUM_THRESHOLD = 30;
    uint256 public constant MAJORITY_THRESHOLD = 51;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public votes;
    mapping(address => bool) public authorizedExecutors;
    
    PropertyThresholds public thresholds;
    PropertyInfo public propertyInfo;
    bool public isLiquidating;

    modifier onlyShareholder() {
        require(propertyVault.balanceOf(msg.sender) > 0);
        _;
    }

    modifier onlyAuthorizedExecutor() {
        require(authorizedExecutors[msg.sender] || msg.sender == owner());
        _;
    }

    modifier notLiquidating() {
        require(!isLiquidating);
        _;
    }

    constructor(
        address _propertyVault,
        address _owner
    ) Ownable(_owner) {
        propertyVault = PropertyVaultGovernance(_propertyVault);
        propertyId = propertyVault.propertyId();
        authorizedExecutors[msg.sender] = true;
        
        thresholds = PropertyThresholds({
            liquidationThreshold: 20,
            emergencyThreshold: 50
        });
        
        propertyInfo = PropertyInfo({
            stage: PropertyStage.OpenToFund,
            totalValue: 0,
            totalInvested: 0,
            fundingTarget: 0,
            fundingDeadline: 0,
            isFullyFunded: false
        });
    }


    function createProposal(
        ProposalType proposalType,
        string memory description,
        bytes memory data
    ) external onlyShareholder notLiquidating returns (uint256) {
        require(bytes(description).length > 0);
        
        if (propertyInfo.stage == PropertyStage.OpenToFund) {
            require(false);
        } else if (propertyInfo.stage == PropertyStage.Liquidating) {
            require(false);
        } else if (propertyInfo.stage == PropertyStage.Liquidated) {
            require(false);
        }
        
        if (propertyInfo.stage == PropertyStage.Funded) {
            require(false);
        }
        
        if (propertyInfo.stage == PropertyStage.UnderManagement) {
            require(proposalType != ProposalType.PropertyPurchase);
            require(proposalType != ProposalType.NAVUpdate);
            
            if (proposalType == ProposalType.PropertyStageChange) {
                (uint8 newStage) = abi.decode(data, (uint8));
                require(newStage == 3);
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

    function createPlatformProposal(
        ProposalType proposalType,
        string memory description,
        bytes memory data
    ) internal notLiquidating returns (uint256) {
        require(bytes(description).length > 0);
        
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

    function proposeCloseFunding(string memory) external view onlyOwner notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.OpenToFund);
        require(propertyInfo.isFullyFunded);
        revert();
    }

    function vote(uint256 proposalId, bool support) external onlyShareholder {
        if (propertyInfo.stage == PropertyStage.OpenToFund) {
            require(false);
        } else if (propertyInfo.stage == PropertyStage.Liquidating) {
            require(false);
        } else if (propertyInfo.stage == PropertyStage.Liquidated) {
            require(false);
        }
        
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active);
        require(block.timestamp <= proposal.deadline);
        require(!votes[proposalId][msg.sender].hasVoted);

        uint256 weight = propertyVault.balanceOf(msg.sender);
        require(weight > 0);

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

    function transitionToFunded() external onlyOwner {
        require(propertyInfo.stage == PropertyStage.OpenToFund);
        require(propertyInfo.isFullyFunded);
        propertyInfo.stage = PropertyStage.Funded;
        emit StageChanged(PropertyStage.Funded);
    }

    function executeProposal(uint256 proposalId) external onlyAuthorizedExecutor nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active);
        require(block.timestamp > proposal.deadline);
        require(!proposal.executed);

        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 totalShares = propertyVault.totalSupply();
        
        require(totalShares > 0);
        require(totalVotes > 0);
        require(totalVotes >= (totalShares * QUORUM_THRESHOLD) / 100);
        require(proposal.votesFor > (totalVotes * MAJORITY_THRESHOLD) / 100);

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;
        bool success = _executeProposal(proposal);
        emit ProposalExecuted(proposalId, success);
    }

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

    function _executePropertyStageChange(bytes memory data) internal returns (bool) {
        PropertyStage newStage = PropertyStage(abi.decode(data, (uint8)));
        require(_isValidStageTransition(propertyInfo.stage, newStage));
        propertyInfo.stage = newStage;
        
        if (newStage == PropertyStage.Funded) {
            propertyInfo.isFullyFunded = true;
        } else if (newStage == PropertyStage.Liquidating) {
            isLiquidating = true;
            propertyVault.initiateLiquidation();
        } else if (newStage == PropertyStage.Liquidated) {
            try propertyVault.completeLiquidation() {} catch {
                try propertyVault.unpause() {} catch {}
            }
        }
        return true;
    }

    function _executePropertyPurchase(bytes memory data) internal returns (bool) {
        (uint256 purchasePrice, address propertyManager) = abi.decode(data, (uint256, address));
        require(propertyInfo.stage == PropertyStage.Funded);
        require(propertyInfo.isFullyFunded);
        require(purchasePrice > 0);
        require(propertyManager != address(0));
        propertyVault.initiatePropertyPurchase(purchasePrice, propertyManager);
        propertyVault.withdrawForPurchase(purchasePrice);
        emit PropertyFunded(propertyId, propertyInfo.totalInvested, purchasePrice);
        return true;
    }

    function _executePropertyLiquidation(bytes memory data) internal returns (bool) {
        uint256 salePrice = abi.decode(data, (uint256));
        require(!isLiquidating);
        require(salePrice > 0);
        isLiquidating = true;
        propertyInfo.stage = PropertyStage.Liquidating;
        propertyVault.initiateLiquidation();
        emit PropertyLiquidated(propertyId, salePrice, salePrice);
        return true;
    }

    function _executeThresholdUpdate(bytes memory data) internal returns (bool) {
        (uint8 thresholdTypeRaw, uint256 newThreshold) = abi.decode(data, (uint8, uint256));
        ThresholdType thresholdType = ThresholdType(thresholdTypeRaw);
        require(newThreshold > 0 && newThreshold <= 100);
        
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

    function setFundingTarget(uint256 targetAmount, uint256 deadline) external onlyOwner {
        require(propertyInfo.stage == PropertyStage.OpenToFund);
        require(targetAmount > 0);
        require(deadline > block.timestamp);
        propertyInfo.fundingTarget = targetAmount;
        propertyInfo.fundingDeadline = deadline;
    }

    function updatePropertyValue(uint256 newValue) external onlyOwner {
        propertyInfo.totalValue = newValue;
    }

    function updateTotalInvested(uint256 newInvested) external {
        address currentOwner = owner();
        require(msg.sender == address(propertyVault) || msg.sender == currentOwner);
        propertyInfo.totalInvested = newInvested;
        
        if (newInvested >= propertyInfo.fundingTarget && propertyInfo.fundingTarget > 0 && !propertyInfo.isFullyFunded) {
            propertyInfo.isFullyFunded = true;
            if (propertyInfo.stage == PropertyStage.OpenToFund) {
                propertyInfo.stage = PropertyStage.Funded;
                _createAutoPropertyPurchaseProposal();
            }
        }
    }

    function _createAutoPropertyPurchaseProposal() internal {
        uint256 purchasePrice = propertyInfo.totalInvested;
        address propertyManager = owner();
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
        createPlatformProposal(
            ProposalType.PropertyPurchase,
            "Automatic property purchase proposal - funding target reached",
            purchaseData
        );
    }

    function isLiquidationThresholdMet() external pure returns (bool) {
        return false;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getVotingPower(address voter) external view returns (uint256) {
        return propertyVault.balanceOf(voter);
    }

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

    function getThresholds() external view returns (PropertyThresholds memory) {
        return thresholds;
    }

    function getPropertyInfo() external view returns (PropertyInfo memory) {
        return propertyInfo;
    }

    function getCurrentStage() external view returns (PropertyStage) {
        return propertyInfo.stage;
    }

    function isFullyFunded() external view returns (bool) {
        return propertyInfo.isFullyFunded;
    }

    function addAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = true;
    }

    function removeAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = false;
    }

    function proposePropertyPurchase(
        uint256 purchasePrice, 
        address propertyManager, 
        string memory description
    ) external onlyShareholder notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.Funded);
        require(propertyInfo.isFullyFunded);
        require(purchasePrice > 0);
        require(propertyManager != address(0));
        require(bytes(description).length > 0);
        
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
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

    function createPropertyPurchaseProposal(
        uint256 purchasePrice, 
        address propertyManager, 
        string memory description
    ) external onlyOwner notLiquidating returns (uint256) {
        require(propertyInfo.stage == PropertyStage.Funded);
        require(propertyInfo.isFullyFunded);
        require(purchasePrice > 0);
        require(propertyManager != address(0));
        require(bytes(description).length > 0);
        
        bytes memory purchaseData = abi.encode(purchasePrice, propertyManager);
        return createPlatformProposal(
            ProposalType.PropertyPurchase,
            description,
            purchaseData
        );
    }

    function completePropertyPurchase(string memory propertyAddress) external onlyOwner {
        require(propertyInfo.stage == PropertyStage.Funded);
        propertyVault.completePropertyPurchase(propertyAddress);
        propertyInfo.stage = PropertyStage.UnderManagement;
    }

    function updatePropertyStage(uint8 newStage) external {
        require(msg.sender == address(propertyVault) || msg.sender == owner());
        require(newStage <= 4);
        propertyInfo.stage = PropertyStage(newStage);
        
        if (PropertyStage(newStage) == PropertyStage.Liquidated) {
            try propertyVault.completeLiquidation() {} catch {
                try propertyVault.unpause() {} catch {}
            }
        }
        emit StageChanged(PropertyStage(newStage));
    }

    function isReadyForPurchase() external view returns (bool) {
        return propertyInfo.isFullyFunded && 
               propertyInfo.stage == PropertyStage.Funded;
    }

    function revertToOpenToFund() external onlyOwner {
        require(propertyInfo.stage == PropertyStage.Funded);
        propertyInfo.stage = PropertyStage.OpenToFund;
        propertyInfo.isFullyFunded = false;
        emit StageChanged(PropertyStage.OpenToFund);
    }

}
