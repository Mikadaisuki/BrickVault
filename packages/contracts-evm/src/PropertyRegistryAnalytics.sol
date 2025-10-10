// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './PropertyRegistry.sol';

/**
 * @title PropertyRegistryAnalytics
 * @dev Simple status tracking functionality for PropertyRegistry
 * @notice Handles essential status tracking functions separately to reduce main contract size
 */
contract PropertyRegistryAnalytics is PropertyRegistry {
    constructor(address _owner, address _environmentConfig, address _vaultFactory) 
        PropertyRegistry(_owner, _environmentConfig, _vaultFactory) {}

    /**
     * @dev Get all active properties
     * @return activeProperties Array of active property IDs
     */
    function getActiveProperties() external view returns (uint32[] memory activeProperties) {
        uint32 count = 0;
        
        // Count active properties
        for (uint32 i = 1; i < nextPropertyId; i++) {
            if (properties[i].status == PropertyStatus.Active) {
                count++;
            }
        }
        
        // Create array and populate
        activeProperties = new uint32[](count);
        uint32 index = 0;
        
        for (uint32 i = 1; i < nextPropertyId; i++) {
            if (properties[i].status == PropertyStatus.Active) {
                activeProperties[index] = i;
                index++;
            }
        }
        
        return activeProperties;
    }

    /**
     * @dev Get properties by status
     * @param status Property status to filter by
     * @return propertyIds Array of property IDs with the specified status
     */
    function getPropertiesByStatus(PropertyStatus status) external view returns (uint32[] memory propertyIds) {
        uint32 count = 0;
        
        // Count properties with specified status
        for (uint32 i = 1; i < nextPropertyId; i++) {
            if (properties[i].status == status) {
                count++;
            }
        }
        
        // Create array and populate
        propertyIds = new uint32[](count);
        uint32 index = 0;
        
        for (uint32 i = 1; i < nextPropertyId; i++) {
            if (properties[i].status == status) {
                propertyIds[index] = i;
                index++;
            }
        }
        
        return propertyIds;
    }

    /**
     * @dev Get property status summary
     * @return totalProperties Total number of properties
     * @return activeProperties Number of active properties
     * @return inactiveProperties Number of inactive properties
     */
    function getPropertyStatusSummary() external view returns (
        uint256 totalProperties,
        uint256 activeProperties,
        uint256 inactiveProperties
    ) {
        totalProperties = nextPropertyId - 1;
        
        for (uint32 i = 1; i < nextPropertyId; i++) {
            Property memory property = properties[i];
            
            if (property.status == PropertyStatus.Active) {
                activeProperties++;
            } else if (property.status == PropertyStatus.Inactive) {
                inactiveProperties++;
            }
        }
    }
}
