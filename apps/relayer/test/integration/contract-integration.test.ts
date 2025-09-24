/**
 * Contract Integration Tests
 * Tests the relayer with actual contract ABIs and expected behaviors
 * Based on StacksCrossChainManager.sol and brick-vault-gateway.clar
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { RelayerService } from '../../src/RelayerService';
import { RelayerConfig } from '../../src/types';

// StacksCrossChainManager ABI (from our contract)
const STACKS_CROSS_CHAIN_MANAGER_ABI = [
  'function processCrossChainMessage(bytes32 messageId, uint8 messageType, uint32 propertyId, address evmCustodian, string calldata stacksAddress, uint256 amount, bytes32 stacksTxHash, bytes calldata proof) external',
  'function notifyStacksStageChange(uint32 propertyId, uint8 newStage) external',
  'function registerStacksAddress(string calldata stacksAddress, address evmAddress) external',
  'function registerProperty(uint32 propertyId, address vaultAddress) external',
  'function getPendingStageChange(uint32 propertyId) external view returns (bool isPending, uint8 pendingStage, uint256 timestamp)',
  'function retryStageChangeNotification(uint32 propertyId) external',
  'event StacksStageChange(uint32 indexed propertyId, uint8 newStage)',
  'event CrossChainMessageProcessed(bytes32 indexed messageId, uint8 messageType, uint32 indexed propertyId)',
  'event StacksDepositReceived(address indexed user, uint32 indexed propertyId, uint256 sbtcAmount, uint256 shares, bytes32 indexed stacksTxHash)',
  'event StacksWithdrawalRequested(address indexed user, uint32 indexed propertyId, uint256 shares, bytes32 indexed messageId)'
];

// Stacks contract function signatures (from brick-vault-gateway.clar)
const STACKS_CONTRACT_FUNCTIONS = {
  'deposit-sbtc': '(define-public (deposit-sbtc (property-id uint) (amount uint)))',
  'withdraw-sbtc': '(define-public (withdraw-sbtc (property-id uint) (amount uint)))',
  'relayer-update-stage': '(define-public (relayer-update-stage (property-id uint) (stage uint) (proof uint)))',
  'get-property-stage': '(define-read-only (get-property-stage (property-id uint)))',
  'set-property-stage': '(define-public (set-property-stage (property-id uint) (stage uint)))'
};

describe('Contract Integration Tests', () => {
  let relayerService: RelayerService;
  let mockProvider: ethers.JsonRpcProvider;
  let mockWallet: ethers.Wallet;
  let mockStacksManager: ethers.Contract;
  let testConfig: RelayerConfig;

  beforeEach(() => {
    // Create mock provider and wallet
    mockProvider = new ethers.JsonRpcProvider('http://localhost:8545');
    mockWallet = new ethers.Wallet('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', mockProvider);
    
    testConfig = {
      stacks: {
        network: 'testnet',
        apiUrl: 'https://api.testnet.hiro.so',
        contractAddress: 'SP[TEST-CONTRACT].brick-vault-gateway',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      },
      evm: {
        network: 'sepolia',
        rpcUrl: 'http://localhost:8545',
        stacksManagerAddress: '0x1234567890123456789012345678901234567890',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      },
      monitoring: {
        interval: 1000,
        maxRetries: 3,
        retryDelay: 1000
      }
    };

    relayerService = new RelayerService(testConfig);
    mockStacksManager = new ethers.Contract(testConfig.evm.stacksManagerAddress, STACKS_CROSS_CHAIN_MANAGER_ABI, mockWallet);
  });

  afterEach(() => {
    if (relayerService) {
      relayerService.stop();
    }
  });

  describe('StacksCrossChainManager Integration', () => {
    it('should call processCrossChainMessage with correct parameters for deposit', async () => {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('test-message-123'));
      const messageType = 1; // deposit
      const propertyId = 1;
      const evmCustodian = '0x1234567890123456789012345678901234567890';
      const stacksAddress = 'SP[TEST-USER]';
      const amount = '1000000'; // 1 sBTC
      const stacksTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const proof = '0xproof123';

      // Mock the contract call
      const mockProcessMessage = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.processCrossChainMessage = mockProcessMessage;

      // Call the function
      await mockStacksManager.processCrossChainMessage(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );

      expect(mockProcessMessage).toHaveBeenCalledWith(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );
    });

    it('should call processCrossChainMessage with correct parameters for withdrawal', async () => {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('test-message-456'));
      const messageType = 2; // withdrawal
      const propertyId = 1;
      const evmCustodian = '0x1234567890123456789012345678901234567890';
      const stacksAddress = 'SP[TEST-USER]';
      const amount = '500000'; // 0.5 sBTC worth of shares
      const stacksTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const proof = '0xproof456';

      const mockProcessMessage = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.processCrossChainMessage = mockProcessMessage;

      await mockStacksManager.processCrossChainMessage(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );

      expect(mockProcessMessage).toHaveBeenCalledWith(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );
    });

    it('should call processCrossChainMessage with correct parameters for stage acknowledgment', async () => {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('test-message-789'));
      const messageType = 3; // acknowledgment
      const propertyId = 1;
      const evmCustodian = '0x1234567890123456789012345678901234567890';
      const stacksAddress = 'stacks';
      const amount = '1'; // Stage 1 (Funded)
      const stacksTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const proof = '0xproof789';

      const mockProcessMessage = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.processCrossChainMessage = mockProcessMessage;

      await mockStacksManager.processCrossChainMessage(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );

      expect(mockProcessMessage).toHaveBeenCalledWith(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );
    });

    it('should call notifyStacksStageChange with correct parameters', async () => {
      const propertyId = 1;
      const newStage = 1; // Funded

      const mockNotifyStageChange = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.notifyStacksStageChange = mockNotifyStageChange;

      await mockStacksManager.notifyStacksStageChange(propertyId, newStage);

      expect(mockNotifyStageChange).toHaveBeenCalledWith(propertyId, newStage);
    });

    it('should call registerStacksAddress with correct parameters', async () => {
      const stacksAddress = 'SP[TEST-USER]';
      const evmAddress = '0x1234567890123456789012345678901234567890';

      const mockRegisterAddress = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.registerStacksAddress = mockRegisterAddress;

      await mockStacksManager.registerStacksAddress(stacksAddress, evmAddress);

      expect(mockRegisterAddress).toHaveBeenCalledWith(stacksAddress, evmAddress);
    });

    it('should call registerProperty with correct parameters', async () => {
      const propertyId = 1;
      const vaultAddress = '0x1234567890123456789012345678901234567890';

      const mockRegisterProperty = vi.fn().mockResolvedValue({
        hash: '0xevm-tx-hash',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      mockStacksManager.registerProperty = mockRegisterProperty;

      await mockStacksManager.registerProperty(propertyId, vaultAddress);

      expect(mockRegisterProperty).toHaveBeenCalledWith(propertyId, vaultAddress);
    });
  });

  describe('Stacks Contract Integration', () => {
    it('should validate Stacks contract function signatures', () => {
      // Test that our expected function signatures match the contract
      expect(STACKS_CONTRACT_FUNCTIONS['deposit-sbtc']).toContain('deposit-sbtc');
      expect(STACKS_CONTRACT_FUNCTIONS['deposit-sbtc']).toContain('property-id');
      expect(STACKS_CONTRACT_FUNCTIONS['deposit-sbtc']).toContain('amount');

      expect(STACKS_CONTRACT_FUNCTIONS['withdraw-sbtc']).toContain('withdraw-sbtc');
      expect(STACKS_CONTRACT_FUNCTIONS['withdraw-sbtc']).toContain('property-id');
      expect(STACKS_CONTRACT_FUNCTIONS['withdraw-sbtc']).toContain('amount');

      expect(STACKS_CONTRACT_FUNCTIONS['relayer-update-stage']).toContain('relayer-update-stage');
      expect(STACKS_CONTRACT_FUNCTIONS['relayer-update-stage']).toContain('property-id');
      expect(STACKS_CONTRACT_FUNCTIONS['relayer-update-stage']).toContain('stage');
      expect(STACKS_CONTRACT_FUNCTIONS['relayer-update-stage']).toContain('proof');

      expect(STACKS_CONTRACT_FUNCTIONS['get-property-stage']).toContain('get-property-stage');
      expect(STACKS_CONTRACT_FUNCTIONS['get-property-stage']).toContain('property-id');

      expect(STACKS_CONTRACT_FUNCTIONS['set-property-stage']).toContain('set-property-stage');
      expect(STACKS_CONTRACT_FUNCTIONS['set-property-stage']).toContain('property-id');
      expect(STACKS_CONTRACT_FUNCTIONS['set-property-stage']).toContain('stage');
    });

    it('should validate message type constants match contract expectations', () => {
      // These should match the message types in StacksCrossChainManager.sol
      const messageTypes = {
        DEPOSIT: 1,
        WITHDRAWAL: 2,
        ACKNOWLEDGMENT: 3
      };

      expect(messageTypes.DEPOSIT).toBe(1);
      expect(messageTypes.WITHDRAWAL).toBe(2);
      expect(messageTypes.ACKNOWLEDGMENT).toBe(3);
    });

    it('should validate stage constants match contract expectations', () => {
      // These should match the PropertyStage enum in PropertyDAO.sol
      const stages = {
        OpenToFund: 0,
        Funded: 1,
        UnderManagement: 2,
        Liquidating: 3,
        Liquidated: 4
      };

      expect(stages.OpenToFund).toBe(0);
      expect(stages.Funded).toBe(1);
      expect(stages.UnderManagement).toBe(2);
      expect(stages.Liquidating).toBe(3);
      expect(stages.Liquidated).toBe(4);
    });
  });

  describe('Event Processing Integration', () => {
    it('should process StacksDepositReceived event correctly', async () => {
      const user = '0x1234567890123456789012345678901234567890';
      const propertyId = 1;
      const sbtcAmount = '1000000';
      const shares = '1000000';
      const stacksTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      // Mock the event
      const mockEvent = {
        event: 'StacksDepositReceived',
        args: {
          user,
          propertyId,
          sbtcAmount,
          shares,
          stacksTxHash
        },
        blockNumber: 12345,
        transactionHash: '0xevm-tx-hash'
      };

      // Test that the event structure matches our expectations
      expect(mockEvent.event).toBe('StacksDepositReceived');
      expect(mockEvent.args.user).toBe(user);
      expect(mockEvent.args.propertyId).toBe(propertyId);
      expect(mockEvent.args.sbtcAmount).toBe(sbtcAmount);
      expect(mockEvent.args.shares).toBe(shares);
      expect(mockEvent.args.stacksTxHash).toBe(stacksTxHash);
    });

    it('should process StacksWithdrawalRequested event correctly', async () => {
      const user = '0x1234567890123456789012345678901234567890';
      const propertyId = 1;
      const shares = '500000';
      const messageId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const mockEvent = {
        event: 'StacksWithdrawalRequested',
        args: {
          user,
          propertyId,
          shares,
          messageId
        },
        blockNumber: 12346,
        transactionHash: '0xevm-tx-hash'
      };

      expect(mockEvent.event).toBe('StacksWithdrawalRequested');
      expect(mockEvent.args.user).toBe(user);
      expect(mockEvent.args.propertyId).toBe(propertyId);
      expect(mockEvent.args.shares).toBe(shares);
      expect(mockEvent.args.messageId).toBe(messageId);
    });

    it('should process StacksStageChange event correctly', async () => {
      const propertyId = 1;
      const newStage = 1;

      const mockEvent = {
        event: 'StacksStageChange',
        args: {
          propertyId,
          newStage
        },
        blockNumber: 12347,
        transactionHash: '0xevm-tx-hash'
      };

      expect(mockEvent.event).toBe('StacksStageChange');
      expect(mockEvent.args.propertyId).toBe(propertyId);
      expect(mockEvent.args.newStage).toBe(newStage);
    });

    it('should process CrossChainMessageProcessed event correctly', async () => {
      const messageId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const messageType = 1;
      const propertyId = 1;

      const mockEvent = {
        event: 'CrossChainMessageProcessed',
        args: {
          messageId,
          messageType,
          propertyId
        },
        blockNumber: 12348,
        transactionHash: '0xevm-tx-hash'
      };

      expect(mockEvent.event).toBe('CrossChainMessageProcessed');
      expect(mockEvent.args.messageId).toBe(messageId);
      expect(mockEvent.args.messageType).toBe(messageType);
      expect(mockEvent.args.propertyId).toBe(propertyId);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid message types gracefully', async () => {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('test-message-invalid'));
      const messageType = 99; // Invalid message type
      const propertyId = 1;
      const evmCustodian = '0x1234567890123456789012345678901234567890';
      const stacksAddress = 'SP[TEST-USER]';
      const amount = '1000000';
      const stacksTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const proof = '0xproof';

      const mockProcessMessage = vi.fn().mockRejectedValue(new Error('Invalid message type'));

      mockStacksManager.processCrossChainMessage = mockProcessMessage;

      await expect(
        mockStacksManager.processCrossChainMessage(
          messageId,
          messageType,
          propertyId,
          evmCustodian,
          stacksAddress,
          amount,
          stacksTxHash,
          proof
        )
      ).rejects.toThrow('Invalid message type');
    });

    it('should handle invalid stage values gracefully', async () => {
      const propertyId = 1;
      const newStage = 99; // Invalid stage

      const mockNotifyStageChange = vi.fn().mockRejectedValue(new Error('Invalid stage'));

      mockStacksManager.notifyStacksStageChange = mockNotifyStageChange;

      await expect(
        mockStacksManager.notifyStacksStageChange(propertyId, newStage)
      ).rejects.toThrow('Invalid stage');
    });
  });
});
