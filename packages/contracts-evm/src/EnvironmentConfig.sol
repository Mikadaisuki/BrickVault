// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EnvironmentConfig
 * @dev Centralized environment configuration for different deployment environments
 * @notice This contract manages environment-specific settings and can be upgraded
 */
contract EnvironmentConfig {
    // Environment types
    enum EnvironmentType {
        Development,
        Staging,
        Production
    }
    
    // Configuration for each environment
    struct EnvironmentSettings {
        bool strictErrorHandling;    // Whether to revert on external call failures
        bool enableDebugEvents;      // Whether to emit debug events
        uint256 maxGasLimit;         // Maximum gas limit for operations
        bool allowMockContracts;     // Whether to allow mock contract interactions
        string environmentName;      // Human-readable environment name
        bool enableCrossChain;       // Whether cross-chain features are enabled
        address crossChainManager;   // Address of the cross-chain manager contract
    }
    
    // Current environment
    EnvironmentType public currentEnvironment;
    
    // Environment-specific settings
    mapping(EnvironmentType => EnvironmentSettings) public environmentSettings;
    
    // Owner for configuration updates
    address public owner;
    
    // Role-based access control
    mapping(address => bool) public authorizedAdmins;
    mapping(address => uint256) public lastAdminAction;
    uint256 public constant ADMIN_COOLDOWN = 1 hours; // 1 hour cooldown for admin actions
    
    // Emergency controls
    bool public emergencyMode = false;
    uint256 public emergencyActivatedAt;
    
    // Events
    event EnvironmentChanged(EnvironmentType oldEnv, EnvironmentType newEnv);
    event EnvironmentSettingsUpdated(EnvironmentType env, EnvironmentSettings settings);
    event AdminAuthorized(address indexed admin);
    event AdminRevoked(address indexed admin);
    event EmergencyModeActivated(uint256 timestamp);
    event EmergencyModeDeactivated(uint256 timestamp);
    event CrossChainManagerUpdated(address indexed manager, EnvironmentType env);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "EnvironmentConfig: only owner");
        _;
    }
    
    modifier onlyAdmin() {
        require(authorizedAdmins[msg.sender], "EnvironmentConfig: only admin");
        _;
    }
    
    modifier notInEmergency() {
        require(!emergencyMode, "EnvironmentConfig: emergency mode active");
        _;
    }
    
    modifier adminCooldown() {
        require(
            block.timestamp >= lastAdminAction[msg.sender] + ADMIN_COOLDOWN,
            "EnvironmentConfig: admin cooldown active"
        );
        lastAdminAction[msg.sender] = block.timestamp;
        _;
    }
    
    constructor(address _owner) {
        owner = _owner;
        currentEnvironment = EnvironmentType.Development;
        authorizedAdmins[_owner] = true; // Owner is automatically an admin
        
        // Set default settings for each environment
        _setDefaultSettings();
    }
    
    /**
     * @dev Set default settings for each environment
     */
    function _setDefaultSettings() internal {
        // Development environment - permissive
        environmentSettings[EnvironmentType.Development] = EnvironmentSettings({
            strictErrorHandling: false,
            enableDebugEvents: true,
            maxGasLimit: 30000000, // 30M gas
            allowMockContracts: true,
            environmentName: "Development",
            enableCrossChain: false,
            crossChainManager: address(0)
        });
        
        // Staging environment - semi-strict
        environmentSettings[EnvironmentType.Staging] = EnvironmentSettings({
            strictErrorHandling: true,
            enableDebugEvents: true,
            maxGasLimit: 20000000, // 20M gas
            allowMockContracts: false,
            environmentName: "Staging",
            enableCrossChain: false,
            crossChainManager: address(0)
        });
        
        // Production environment - strict
        environmentSettings[EnvironmentType.Production] = EnvironmentSettings({
            strictErrorHandling: true,
            enableDebugEvents: false,
            maxGasLimit: 15000000, // 15M gas
            allowMockContracts: false,
            environmentName: "Production",
            enableCrossChain: false,
            crossChainManager: address(0)
        });
    }
    
    /**
     * @dev Get current environment settings
     */
    function getCurrentSettings() external view returns (EnvironmentSettings memory) {
        return environmentSettings[currentEnvironment];
    }
    
    /**
     * @dev Check if strict error handling is enabled
     */
    function isStrictErrorHandling() external view returns (bool) {
        return environmentSettings[currentEnvironment].strictErrorHandling;
    }
    
    /**
     * @dev Check if debug events are enabled
     */
    function isDebugEventsEnabled() external view returns (bool) {
        return environmentSettings[currentEnvironment].enableDebugEvents;
    }
    
    /**
     * @dev Check if mock contracts are allowed
     */
    function isMockContractsAllowed() external view returns (bool) {
        return environmentSettings[currentEnvironment].allowMockContracts;
    }
    
    /**
     * @dev Get maximum gas limit for current environment
     */
    function getMaxGasLimit() external view returns (uint256) {
        return environmentSettings[currentEnvironment].maxGasLimit;
    }
    
    /**
     * @dev Change environment (only admin, with cooldown)
     */
    function setEnvironment(EnvironmentType _newEnvironment) external onlyAdmin adminCooldown notInEmergency {
        EnvironmentType oldEnv = currentEnvironment;
        currentEnvironment = _newEnvironment;
        emit EnvironmentChanged(oldEnv, _newEnvironment);
    }
    
    /**
     * @dev Update environment settings (only owner)
     */
    function updateEnvironmentSettings(
        EnvironmentType _env,
        EnvironmentSettings memory _settings
    ) external onlyOwner {
        // Validate environment settings
        require(_settings.maxGasLimit > 0, 'EnvironmentConfig: max gas limit must be positive');
        require(_settings.maxGasLimit <= 30000000, 'EnvironmentConfig: max gas limit too high'); // 30M max
        require(bytes(_settings.environmentName).length > 0, 'EnvironmentConfig: environment name required');
        require(bytes(_settings.environmentName).length <= 50, 'EnvironmentConfig: environment name too long');
        
        environmentSettings[_env] = _settings;
        emit EnvironmentSettingsUpdated(_env, _settings);
    }
    
    /**
     * @dev Authorize admin (only owner)
     */
    function authorizeAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "EnvironmentConfig: invalid admin address");
        authorizedAdmins[_admin] = true;
        emit AdminAuthorized(_admin);
    }

    /**
     * @dev Revoke admin (only owner)
     */
    function revokeAdmin(address _admin) external onlyOwner {
        require(_admin != owner, "EnvironmentConfig: cannot revoke owner");
        authorizedAdmins[_admin] = false;
        emit AdminRevoked(_admin);
    }

    /**
     * @dev Activate emergency mode (only owner)
     */
    function activateEmergencyMode() external onlyOwner {
        require(!emergencyMode, "EnvironmentConfig: emergency mode already active");
        emergencyMode = true;
        emergencyActivatedAt = block.timestamp;
        emit EmergencyModeActivated(block.timestamp);
    }

    /**
     * @dev Deactivate emergency mode (only owner)
     */
    function deactivateEmergencyMode() external onlyOwner {
        require(emergencyMode, "EnvironmentConfig: emergency mode not active");
        emergencyMode = false;
        emit EmergencyModeDeactivated(block.timestamp);
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "EnvironmentConfig: invalid new owner");
        require(!emergencyMode, "EnvironmentConfig: cannot transfer during emergency");
        
        // Revoke old owner admin rights
        authorizedAdmins[owner] = false;
        
        // Set new owner
        owner = _newOwner;
        
        // Grant new owner admin rights
        authorizedAdmins[_newOwner] = true;
    }

    /**
     * @dev Check if cross-chain features are enabled for current environment
     * @return enabled Whether cross-chain features are enabled
     */
    function isCrossChainEnabled() external view returns (bool enabled) {
        return environmentSettings[currentEnvironment].enableCrossChain;
    }

    /**
     * @dev Get cross-chain manager address for current environment
     * @return manager Address of the cross-chain manager contract
     */
    function getCrossChainManager() external view returns (address manager) {
        return environmentSettings[currentEnvironment].crossChainManager;
    }

    /**
     * @dev Update cross-chain manager for a specific environment
     * @param env Environment to update
     * @param manager Address of the cross-chain manager contract
     */
    function updateCrossChainManager(EnvironmentType env, address manager) external onlyOwner {
        require(manager != address(0), 'EnvironmentConfig: invalid manager address');
        
        environmentSettings[env].crossChainManager = manager;
        environmentSettings[env].enableCrossChain = true;
        
        emit CrossChainManagerUpdated(manager, env);
    }
}
