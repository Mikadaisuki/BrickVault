// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title PropertyRegistryRateLimit
 * @dev Rate limiting functionality for property creation
 * @notice Handles rate limiting logic separately to reduce main contract size
 */
contract PropertyRegistryRateLimit is Ownable {
    // Events
    event RateLimitExceeded(address indexed user, uint256 operationCount);

    // Rate limiting constants
    uint256 public constant PROPERTY_CREATION_COOLDOWN = 1 minutes;
    uint256 public constant MAX_PROPERTIES_PER_DAY = 20;
    uint256 public constant PROPERTY_CREATION_WINDOW = 1 days;

    // Rate limiting data structure
    struct RateLimitData {
        mapping(address => uint256) lastPropertyCreation;
        mapping(address => uint256) propertyCreationCount;
    }

    // State variables
    RateLimitData private rateLimitData;

    constructor(address _owner) Ownable(_owner) {}

    /**
     * @dev Check property creation rate limit
     * @param user User address
     */
    function checkPropertyCreationRateLimit(address user) external {
        uint256 currentTime = block.timestamp;
        
        // Reset creation count if outside the window
        if (currentTime >= rateLimitData.lastPropertyCreation[user] + PROPERTY_CREATION_WINDOW) {
            rateLimitData.propertyCreationCount[user] = 0;
        }
        
        // Check rate limits
        require(
            rateLimitData.propertyCreationCount[user] < MAX_PROPERTIES_PER_DAY,
            'PropertyRegistryRateLimit: property creation rate limit exceeded (20 per day max)'
        );
        require(
            currentTime >= rateLimitData.lastPropertyCreation[user] + PROPERTY_CREATION_COOLDOWN,
            'PropertyRegistryRateLimit: property creation too frequent (1 minute cooldown)'
        );
        
        // Update tracking
        rateLimitData.lastPropertyCreation[user] = currentTime;
        rateLimitData.propertyCreationCount[user]++;
    }

    /**
     * @dev Get property creation rate limit status
     * @param user User address
     * @return canCreate Whether user can create property
     * @return remainingCount Remaining properties user can create
     * @return timeUntilReset Time until rate limit resets
     */
    function getPropertyCreationStatus(address user) external view returns (
        bool canCreate,
        uint256 remainingCount,
        uint256 timeUntilReset
    ) {
        uint256 currentTime = block.timestamp;
        uint256 lastCreation = rateLimitData.lastPropertyCreation[user];
        uint256 count = rateLimitData.propertyCreationCount[user];
        
        // Reset count if outside the window
        if (currentTime >= lastCreation + PROPERTY_CREATION_WINDOW) {
            count = 0;
        }
        
        // Check if user can create
        bool withinCooldown = currentTime >= lastCreation + PROPERTY_CREATION_COOLDOWN;
        bool withinDailyLimit = count < MAX_PROPERTIES_PER_DAY;
        
        canCreate = withinCooldown && withinDailyLimit;
        remainingCount = MAX_PROPERTIES_PER_DAY - count;
        
        // Calculate time until reset
        if (currentTime >= lastCreation + PROPERTY_CREATION_WINDOW) {
            timeUntilReset = 0; // Already reset
        } else {
            timeUntilReset = (lastCreation + PROPERTY_CREATION_WINDOW) - currentTime;
        }
    }

    /**
     * @dev Reset rate limit for a user (only owner)
     * @param user User address
     */
    function resetRateLimit(address user) external onlyOwner {
        rateLimitData.lastPropertyCreation[user] = 0;
        rateLimitData.propertyCreationCount[user] = 0;
    }

    /**
     * @dev Get rate limit data for a user
     * @param user User address
     * @return lastCreation Last creation timestamp
     * @return count Current creation count
     */
    function getRateLimitData(address user) external view returns (uint256 lastCreation, uint256 count) {
        return (rateLimitData.lastPropertyCreation[user], rateLimitData.propertyCreationCount[user]);
    }
}
