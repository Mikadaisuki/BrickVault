// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './PropertyDAO.sol';

/**
 * @title PropertyDAOFactory
 * @dev Factory contract for deploying PropertyDAO instances
 */
contract PropertyDAOFactory {
    event PropertyDAOCreated(address indexed dao, address indexed vault, address indexed owner);
    
    /**
     * @dev Deploy a new PropertyDAO instance
     * @param vaultAddress The address of the PropertyVaultGovernance
     * @param owner The owner of the PropertyDAO
     * @return daoAddress The address of the deployed PropertyDAO
     */
    function createPropertyDAO(
        address vaultAddress,
        address owner
    ) external returns (address daoAddress) {
        PropertyDAO dao = new PropertyDAO(vaultAddress, owner);
        daoAddress = address(dao);
        
        emit PropertyDAOCreated(daoAddress, vaultAddress, owner);
        
        return daoAddress;
    }
}
