// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MockRegistry is Ownable, Pausable {
    // Simplified structure for demo

    struct Property {
        address vault;
        uint256 depositCap;
        uint256 totalDeposited;
        uint8 status;
        uint256 createdAt;
    }

    mapping(uint256 => Property) public properties;
    uint256 public nextPropertyId = 1;
    uint256[] public activeProperties;

    event PropertyCreated(
        uint256 indexed propertyId,
        string name,
        string city,
        uint256 depositCap,
        address vault
    );

    event PropertyStatusUpdated(uint256 indexed propertyId, uint8 newStatus);
    event PropertyCapUpdated(uint256 indexed propertyId, uint256 newCap);
    // Simplified events for demo

    constructor(address _owner) Ownable(_owner) {}

    function createProperty(
        string memory name,
        uint256 depositCap,
        address /* underlyingAsset */
    ) external onlyOwner returns (uint256 propertyId) {
        propertyId = nextPropertyId++;
        
        // Create a mock vault address
        address mockVault = address(uint160(propertyId + 1000));
        
        properties[propertyId] = Property({
            vault: mockVault,
            depositCap: depositCap,
            totalDeposited: 0,
            status: 1, // Active
            createdAt: block.timestamp
        });

        activeProperties.push(propertyId);

        emit PropertyCreated(propertyId, name, "Mock City", depositCap, mockVault);
    }

    function updatePropertyStatus(uint256 _propertyId, uint8 _status) external onlyOwner {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        properties[_propertyId].status = _status;
        emit PropertyStatusUpdated(_propertyId, _status);
    }

    function updatePropertyCap(uint256 _propertyId, uint256 _newCap) external onlyOwner {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        properties[_propertyId].depositCap = _newCap;
        emit PropertyCapUpdated(_propertyId, _newCap);
    }

    // updatePropertyFees function removed for demo

    function updatePropertyVault(uint256 _propertyId, address _vault) external onlyOwner {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_vault != address(0), "MockRegistry: invalid vault address");
        properties[_propertyId].vault = _vault;
    }

    function recordDeposit(uint32 _propertyId, uint256 _amount, address /* _depositor */) external {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_amount > 0, "MockRegistry: amount must be positive");
        require(msg.sender == owner() || msg.sender == properties[_propertyId].vault, "MockRegistry: unauthorized");
        properties[_propertyId].totalDeposited += _amount;
    }

    function recordRedemption(uint32 _propertyId, uint256 _amount, address /* _redeemer */) external {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_amount > 0, "MockRegistry: amount must be positive");
        require(msg.sender == owner() || msg.sender == properties[_propertyId].vault, "MockRegistry: unauthorized");
        require(properties[_propertyId].totalDeposited >= _amount, "MockRegistry: insufficient deposits");
        properties[_propertyId].totalDeposited -= _amount;
    }

    function recordWithdrawal(uint32 _propertyId, uint256 _amount, address /* _withdrawer */) external {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_amount > 0, "MockRegistry: amount must be positive");
        require(msg.sender == owner() || msg.sender == properties[_propertyId].vault, "MockRegistry: unauthorized");
        require(properties[_propertyId].totalDeposited >= _amount, "MockRegistry: insufficient deposits");
        properties[_propertyId].totalDeposited -= _amount;
    }

    function getProperty(uint256 _propertyId) external view returns (Property memory) {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        return properties[_propertyId];
    }

    function getActiveProperties() external view returns (uint256[] memory) {
        return activeProperties;
    }

    function getPropertyCount() external view returns (uint256) {
        return nextPropertyId - 1;
    }

    function isPropertyActive(uint256 _propertyId) external view returns (bool) {
        if (_propertyId >= nextPropertyId) return false;
        Property memory prop = properties[_propertyId];
        return prop.status == 1; // Status 1 = Active
    }

    function getVaultAddress(uint256 _propertyId) external view returns (address) {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        return properties[_propertyId].vault;
    }

    // Cross-chain tracking
    mapping(uint32 => uint256) public crossChainDeposits;
    mapping(uint32 => uint256) public crossChainRedemptions;

    function recordCrossChainDeposit(uint32 _propertyId, uint256 _amount, address /* _depositor */) external {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_amount > 0, "MockRegistry: amount must be positive");
        require(msg.sender == owner() || msg.sender == properties[_propertyId].vault, "MockRegistry: unauthorized");
        crossChainDeposits[_propertyId] += _amount;
        properties[_propertyId].totalDeposited += _amount;
    }

    function recordCrossChainRedemption(uint32 _propertyId, uint256 _amount, address /* _redeemer */) external {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        require(_amount > 0, "MockRegistry: amount must be positive");
        require(msg.sender == owner() || msg.sender == properties[_propertyId].vault, "MockRegistry: unauthorized");
        require(properties[_propertyId].totalDeposited >= _amount, "MockRegistry: insufficient deposits");
        crossChainRedemptions[_propertyId] += _amount;
        properties[_propertyId].totalDeposited -= _amount;
    }

    function getCrossChainStats(uint32 _propertyId) external view returns (uint256 deposits, uint256 redemptions) {
        require(_propertyId < nextPropertyId, "PropertyRegistry: property not found");
        return (crossChainDeposits[_propertyId], crossChainRedemptions[_propertyId]);
    }
}