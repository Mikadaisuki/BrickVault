/**
 * Cross-Chain Message Processor
 * Coordinates message processing between Stacks and EVM chains
 */

import { ethers } from 'ethers';
import { StacksMonitor } from './StacksMonitor';
import { EVMMonitor } from './EVMMonitor';
import { RelayerConfig } from '../config/index.js';
import { 
  StacksEvent, 
  CrossChainMessage, 
  MessageProcessingResult,
  ProcessedMessage 
} from '../types';

export class MessageProcessor {
  private stacksMonitor: StacksMonitor;
  private evmMonitor: EVMMonitor;
  private config: RelayerConfig;
  private processedMessages: Map<string, ProcessedMessage> = new Map();
  private pendingMessages: Set<string> = new Set();

  constructor(config: RelayerConfig) {
    this.config = config;
    this.stacksMonitor = new StacksMonitor(config);
    this.evmMonitor = new EVMMonitor(config);
  }

  /**
   * Start the message processor
   */
  async start(): Promise<void> {
    console.log('🚀 Starting cross-chain message processor...');

    // Start both monitors
    await this.stacksMonitor.startMonitoring();
    await this.evmMonitor.startMonitoring();

    // Set up event forwarding
    this.setupEventForwarding();

    console.log('✅ Message processor started successfully');
  }

  /**
   * Stop the message processor
   */
  async stop(): Promise<void> {
    console.log('⏹️ Stopping cross-chain message processor...');

    this.stacksMonitor.stopMonitoring();
    this.evmMonitor.stopMonitoring();

    console.log('✅ Message processor stopped');
  }

  /**
   * Set up event forwarding between chains
   */
  private setupEventForwarding(): void {
    // This would be implemented with proper event listeners
    // For now, we'll handle this in the processing methods
  }

  /**
   * Process Stacks deposit event
   */
  async processStacksDeposit(stacksEvent: StacksEvent): Promise<MessageProcessingResult> {
    try {
      const messageId = this.generateMessageId(stacksEvent);
      
      if (this.processedMessages.has(messageId)) {
        return {
          success: false,
          messageId,
          error: 'Message already processed'
        };
      }

      // Get EVM custodian for this Stacks address
      const evmCustodian = await this.getEvmCustodian(stacksEvent.user);
      if (!evmCustodian) {
        return {
          success: false,
          messageId,
          error: 'EVM custodian not found'
        };
      }

      // Generate proof (in production, this would be a merkle proof)
      const proof = this.generateProof(stacksEvent);

      // Create cross-chain message
      const message: CrossChainMessage = {
        messageId,
        messageType: 1, // deposit
        propertyId: stacksEvent.propertyId,
        evmCustodian,
        stacksAddress: stacksEvent.user,
        amount: stacksEvent.amount,
        stacksTxHash: stacksEvent.stacksTxHash,
        proof,
        timestamp: Date.now(),
        processed: false
      };

      // Process on EVM
      const result = await this.evmMonitor.processCrossChainMessage(
        message.messageId,
        message.messageType,
        message.propertyId,
        message.evmCustodian,
        message.stacksAddress,
        message.amount,
        message.stacksTxHash,
        message.proof
      );

      // Mark as processed
      this.markMessageProcessed(messageId, true);

      return {
        success: true,
        messageId,
        transactionHash: result
      };

    } catch (error) {
      const messageId = this.generateMessageId(stacksEvent);
      this.markMessageProcessed(messageId, false, error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        messageId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process Stacks withdrawal event
   */
  async processStacksWithdrawal(stacksEvent: StacksEvent): Promise<MessageProcessingResult> {
    try {
      const messageId = this.generateMessageId(stacksEvent);
      
      if (this.processedMessages.has(messageId)) {
        return {
          success: false,
          messageId,
          error: 'Message already processed'
        };
      }

      // Get EVM custodian for this Stacks address
      const evmCustodian = await this.getEvmCustodian(stacksEvent.user);
      if (!evmCustodian) {
        return {
          success: false,
          messageId,
          error: 'EVM custodian not found'
        };
      }

      // Generate proof
      const proof = this.generateProof(stacksEvent);

      // Create cross-chain message
      const message: CrossChainMessage = {
        messageId,
        messageType: 2, // withdrawal
        propertyId: stacksEvent.propertyId,
        evmCustodian,
        stacksAddress: stacksEvent.user,
        amount: stacksEvent.amount,
        stacksTxHash: stacksEvent.stacksTxHash,
        proof,
        timestamp: Date.now(),
        processed: false
      };

      // Process on EVM
      const result = await this.evmMonitor.processCrossChainMessage(
        message.messageId,
        message.messageType,
        message.propertyId,
        message.evmCustodian,
        message.stacksAddress,
        message.amount,
        message.stacksTxHash,
        message.proof
      );

      // Mark as processed
      this.markMessageProcessed(messageId, true);

      return {
        success: true,
        messageId,
        transactionHash: result
      };

    } catch (error) {
      const messageId = this.generateMessageId(stacksEvent);
      this.markMessageProcessed(messageId, false, error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        messageId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process Stacks stage acknowledgment
   */
  async processStacksStageAcknowledgment(stacksEvent: StacksEvent): Promise<MessageProcessingResult> {
    try {
      const messageId = this.generateMessageId(stacksEvent);
      
      if (this.processedMessages.has(messageId)) {
        return {
          success: false,
          messageId,
          error: 'Message already processed'
        };
      }

      // Generate proof
      const proof = this.generateProof(stacksEvent);

      // Create cross-chain message
      const message: CrossChainMessage = {
        messageId,
        messageType: 3, // acknowledgment
        propertyId: stacksEvent.propertyId,
        evmCustodian: 'platform', // Acknowledgment goes to platform
        stacksAddress: 'stacks', // From Stacks
        amount: stacksEvent.amount, // Stage number
        stacksTxHash: stacksEvent.stacksTxHash,
        proof,
        timestamp: Date.now(),
        processed: false
      };

      // Process on EVM
      const result = await this.evmMonitor.processCrossChainMessage(
        message.messageId,
        message.messageType,
        message.propertyId,
        message.evmCustodian,
        message.stacksAddress,
        message.amount,
        message.stacksTxHash,
        message.proof
      );

      // Mark as processed
      this.markMessageProcessed(messageId, true);

      return {
        success: true,
        messageId,
        transactionHash: result
      };

    } catch (error) {
      const messageId = this.generateMessageId(stacksEvent);
      this.markMessageProcessed(messageId, false, error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        messageId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process EVM stage change event
   */
  async processEVMStageChange(propertyId: number, newStage: number, txHash: string): Promise<string> {
    try {
      console.log(`🔄 Processing EVM stage change: Property ${propertyId}, Stage ${newStage}`);

      // Generate proof (in production, this would be a merkle proof from EVM)
      const proof = ethers.keccak256(ethers.toUtf8Bytes(`proof-${propertyId}-${newStage}-${txHash}`));

      // Update Stacks contract
      const stacksTxHash = await this.stacksMonitor.updateStacksStage(
        propertyId,
        newStage,
        proof
      );

      console.log(`✅ Stacks stage updated: ${stacksTxHash}`);
      return stacksTxHash;

    } catch (error) {
      console.error('❌ Error processing EVM stage change:', error);
      throw error;
    }
  }

  /**
   * Get EVM custodian for Stacks address
   */
  private async getEvmCustodian(stacksAddress: string): Promise<string | null> {
    try {
      // In a real implementation, this would query the Stacks contract
      // or maintain a mapping of registered addresses
      
      // For demo purposes, we'll use a simple mapping
      const custodianMapping: Record<string, string> = {
        'SP[DEMO-ADDRESS-1]': '0x[DEMO-EVM-ADDRESS-1]',
        'SP[DEMO-ADDRESS-2]': '0x[DEMO-EVM-ADDRESS-2]',
        // Add more mappings as needed
      };

      return custodianMapping[stacksAddress] || null;
    } catch (error) {
      console.error('❌ Error getting EVM custodian:', error);
      return null;
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(stacksEvent: StacksEvent): string {
    return ethers.keccak256(
      ethers.toUtf8Bytes(`${stacksEvent.id}-${stacksEvent.timestamp}`)
    );
  }

  /**
   * Generate proof for cross-chain message
   */
  private generateProof(stacksEvent: StacksEvent): string {
    // In production, this would be a proper merkle proof
    return ethers.keccak256(
      ethers.toUtf8Bytes(`proof-${stacksEvent.id}-${stacksEvent.stacksTxHash}`)
    );
  }

  /**
   * Mark message as processed
   */
  private markMessageProcessed(messageId: string, success: boolean, error?: string): void {
    const processedMessage: ProcessedMessage = {
      messageId,
      success,
      error,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.processedMessages.set(messageId, processedMessage);
    this.pendingMessages.delete(messageId);

    if (success) {
      console.log(`✅ Message processed successfully: ${messageId}`);
    } else {
      console.error(`❌ Message processing failed: ${messageId}, Error: ${error}`);
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    totalMessages: number;
    successfulMessages: number;
    failedMessages: number;
    pendingMessages: number;
  } {
    const totalMessages = this.processedMessages.size;
    const successfulMessages = Array.from(this.processedMessages.values())
      .filter(msg => msg.success).length;
    const failedMessages = totalMessages - successfulMessages;
    const pendingMessages = this.pendingMessages.size;

    return {
      totalMessages,
      successfulMessages,
      failedMessages,
      pendingMessages
    };
  }

  /**
   * Get processed message by ID
   */
  getProcessedMessage(messageId: string): ProcessedMessage | undefined {
    return this.processedMessages.get(messageId);
  }

  /**
   * Get all processed messages
   */
  getAllProcessedMessages(): ProcessedMessage[] {
    return Array.from(this.processedMessages.values());
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): {
    stacks: { isMonitoring: boolean; lastProcessedBlock: number };
    evm: { isMonitoring: boolean; lastProcessedBlock: number };
  } {
    return {
      stacks: this.stacksMonitor.getStatus(),
      evm: this.evmMonitor.getStatus()
    };
  }
}
