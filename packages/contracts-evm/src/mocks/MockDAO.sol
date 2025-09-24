// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockDAO is Ownable {
    enum PropertyStage {
        OpenToFund,
        Funded,
        UnderManagement,
        Liquidating,
        Liquidated
    }

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

    struct PropertyInfo {
        PropertyStage stage;          // Current property stage
        uint256 totalValue;           // Total property value
        uint256 totalInvested;        // Total amount invested by users
        uint256 fundingTarget;        // Target amount to fund (set by platform)
        uint256 fundingDeadline;      // Deadline for funding (set by platform)
        bool isFullyFunded;          // Whether property is fully funded
    }

    struct PropertyThresholds {
        uint256 liquidationThreshold; // % of shares needed to trigger liquidation (default 20%)
        uint256 emergencyThreshold;   // % of shares needed for emergency actions (default 50%)
    }

    struct Proposal {
        ProposalType proposalType;
        string description;
        bytes data;
        uint256 startTime;
        uint256 endTime;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
        mapping(address => bool) voted;
    }

    PropertyInfo public propertyInfo;
    PropertyThresholds public thresholds;
    PropertyStage public currentStage = PropertyStage.OpenToFund;
    
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public shareholderBalances;
    mapping(address => bool) public isShareholder;

    event FundingTargetSet(uint256 target, uint256 deadline);
    event TotalInvestedUpdated(uint256 amount);
    event PropertyStageChanged(PropertyStage newStage);
    event ProposalCreated(uint256 indexed proposalId, string description);
    event VoteCast(uint256 indexed proposalId, address voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId);
    event ThresholdUpdated(uint8 thresholdType, uint256 newValue);

    constructor(address _owner) Ownable(_owner) {
        thresholds.liquidationThreshold = 20; // 20%
        thresholds.emergencyThreshold = 50;   // 50%
    }

    function setFundingTarget(uint256 _target, uint256 _deadline) external onlyOwner {
        propertyInfo.fundingTarget = _target;
        propertyInfo.fundingDeadline = _deadline;
        emit FundingTargetSet(_target, _deadline);
    }

    function updateTotalInvested(uint256 _amount) external {
        // Only allow owner to update (removed self-call vulnerability)
        require(msg.sender == owner(), "MockDAO: only owner");
        propertyInfo.totalInvested = _amount;
        propertyInfo.isFullyFunded = _amount >= propertyInfo.fundingTarget;
        emit TotalInvestedUpdated(_amount);
    }

    function updatePropertyStage(uint8 _newStage) external {
        require(_newStage <= uint8(PropertyStage.Liquidated), "Invalid stage");
        require(msg.sender == owner(), "MockDAO: only owner");
        _updatePropertyStage(_newStage);
    }

    function _updatePropertyStage(uint8 _newStage) internal {
        currentStage = PropertyStage(_newStage);
        propertyInfo.stage = PropertyStage(_newStage);
        emit PropertyStageChanged(PropertyStage(_newStage));
    }

    function updatePropertyValue(uint256 _value) external onlyOwner {
        // Mock implementation - in real DAO this would update property valuation
    }

    function getCurrentStage() external view returns (PropertyStage) {
        return currentStage;
    }

    function getPropertyInfo() external view returns (PropertyInfo memory) {
        return propertyInfo;
    }

    function getThresholds() external view returns (PropertyThresholds memory) {
        return thresholds;
    }

    function isLiquidating() external view returns (bool) {
        return currentStage == PropertyStage.Liquidating;
    }

    function proposeCloseFunding(string memory _description) external onlyOwner returns (uint256) {
        require(propertyInfo.isFullyFunded, "PropertyDAO: funding target not reached");
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.proposalType = ProposalType.PropertyStageChange;
        proposal.description = _description;
        proposal.data = abi.encode(uint8(PropertyStage.Funded));
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + 7 days;
        
        emit ProposalCreated(proposalId, _description);
        return proposalId;
    }

    function createProposal(
        ProposalType _proposalType,
        string memory _description,
        bytes memory _data
    ) external returns (uint256) {
        require(isShareholder[msg.sender], "PropertyDAO: not a shareholder");
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.proposalType = _proposalType;
        proposal.description = _description;
        proposal.data = _data;
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + 7 days;
        
        emit ProposalCreated(proposalId, _description);
        return proposalId;
    }

    function vote(uint256 _proposalId, bool _support) external {
        require(isShareholder[msg.sender], "PropertyDAO: not a shareholder");
        require(_proposalId <= proposalCount, "PropertyDAO: proposal not found");
        
        Proposal storage proposal = proposals[_proposalId];
        require(!proposal.voted[msg.sender], "PropertyDAO: already voted");
        require(block.timestamp <= proposal.endTime, "PropertyDAO: voting ended");
        
        proposal.voted[msg.sender] = true;
        if (_support) {
            proposal.yesVotes += shareholderBalances[msg.sender];
        } else {
            proposal.noVotes += shareholderBalances[msg.sender];
        }
        
        emit VoteCast(_proposalId, msg.sender, _support);
    }

    function executeProposal(uint256 _proposalId) external {
        require(_proposalId <= proposalCount, "PropertyDAO: proposal not found");
        require(!proposals[_proposalId].executed, "PropertyDAO: already executed");
        require(block.timestamp > proposals[_proposalId].endTime, "PropertyDAO: voting not ended");
        
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.yesVotes > proposal.noVotes, "PropertyDAO: proposal not passed");
        
        proposal.executed = true;
        
        // Mock execution based on proposal type
        if (proposal.proposalType == ProposalType.PropertyStageChange) {
            uint8 newStage = abi.decode(proposal.data, (uint8));
            _updatePropertyStage(newStage);
        }
        
        emit ProposalExecuted(_proposalId);
    }

    function updateThreshold(uint8 _thresholdType, uint256 _newValue) external onlyOwner {
        if (_thresholdType == 0) {
            thresholds.liquidationThreshold = _newValue;
        } else if (_thresholdType == 1) {
            thresholds.emergencyThreshold = _newValue;
        }
        emit ThresholdUpdated(_thresholdType, _newValue);
    }

    // Helper functions for testing
    function addShareholder(address _shareholder, uint256 _balance) external onlyOwner {
        isShareholder[_shareholder] = true;
        shareholderBalances[_shareholder] = _balance;
    }

    function removeShareholder(address _shareholder) external onlyOwner {
        isShareholder[_shareholder] = false;
        shareholderBalances[_shareholder] = 0;
    }

    function getProposal(uint256 _proposalId) external view returns (
        ProposalType proposalType,
        string memory description,
        bytes memory data,
        uint256 startTime,
        uint256 endTime,
        uint256 yesVotes,
        uint256 noVotes,
        bool executed
    ) {
        require(_proposalId <= proposalCount, "PropertyDAO: proposal not found");
        Proposal storage proposal = proposals[_proposalId];
        return (
            proposal.proposalType,
            proposal.description,
            proposal.data,
            proposal.startTime,
            proposal.endTime,
            proposal.yesVotes,
            proposal.noVotes,
            proposal.executed
        );
    }
}