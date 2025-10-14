/**
 * Cross-Chain Message Processor
 * 
 * Purpose: Coordinate between Stacks event detection and EVM transaction sending
 * 
 * Flow:
 * 1. Start StacksMonitor to poll for deposit events
 * 2. When deposit event is detected, forward to EVMMonitor
 * 3. EVMMonitor signs and sends transaction to EVM contract
 * 4. Track success/failure for monitoring
 */

import { StacksMonitor } from './StacksMonitor.js';
import { EVMMonitor } from './EVMMonitor.js';
import { RelayerConfig } from '../config/index.js';
import { LogService } from './LogService.js';
import { 
  StacksEvent, 
  ProcessedMessage 
} from '../types';

export class MessageProcessor {
  private stacksMonitor: StacksMonitor;
  private evmMonitor: EVMMonitor;
  private config: RelayerConfig;
  private logService: LogService;
  private processedMessages: Map<string, ProcessedMessage> = new Map();
  private successCount: number = 0;
  private failureCount: number = 0;

  constructor(config: RelayerConfig, logService: LogService) {
    this.config = config;
    this.logService = logService;
    this.stacksMonitor = new StacksMonitor(config, logService);
    this.evmMonitor = new EVMMonitor(config, logService);
    
    // Set up callback for Stacks events
    this.stacksMonitor.setEventCallback(this.handleStacksEvent.bind(this));
    
    // Set up callback for EVM message confirmations
    this.evmMonitor.setMessageConfirmationCallback(this.handleMessageConfirmation.bind(this));
  }

  /**
   * Start the message processor
   */
  async start(): Promise<void> {
    this.logService.info('message-processor', '🚀 Starting cross-chain relayer...', {
      stacksContract: this.config.stacks.contractAddress,
      evmContract: this.config.evm.stacksManagerAddress
    });

    console.log('🚀 Starting cross-chain relayer...');
    console.log('📍 Stacks Contract:', this.config.stacks.contractAddress);
    console.log('📍 EVM Contract:', this.config.evm.stacksManagerAddress);

    // Start Stacks monitor (EVM monitor is passive, only sends transactions)
    await this.stacksMonitor.startMonitoring();
    await this.evmMonitor.startMonitoring();

    this.logService.info('message-processor', '✅ Relayer started successfully - watching for events');
    console.log('✅ Relayer started successfully');
    console.log('👀 Watching for Stacks deposit events...');
  }

  /**
   * Stop the message processor
   */
  async stop(): Promise<void> {
    console.log('⏹️ Stopping cross-chain relayer...');

    this.stacksMonitor.stopMonitoring();
    this.evmMonitor.stopMonitoring();

    console.log('✅ Relayer stopped');
  }

  /**
   * Handle Stacks deposit event
   * This is called by StacksMonitor when a deposit is detected
   */
  private async handleStacksEvent(stacksEvent: StacksEvent): Promise<void> {
    const messageId = this.generateMessageId(stacksEvent);
    
    try {
      this.logService.info('stacks-event', '🔔 New Stacks deposit detected', {
        eventId: stacksEvent.id,
        user: stacksEvent.user,
        amount: stacksEvent.amount,
        evmCustodian: stacksEvent.evmCustodian,
        stacksTxHash: stacksEvent.stacksTxHash
      });

      console.log(`\n🔔 New Stacks deposit detected!`);
      console.log(`   Event ID: ${stacksEvent.id}`);
      console.log(`   User: ${stacksEvent.user}`);
      console.log(`   Amount: ${stacksEvent.amount}`);
      console.log(`   EVM Custodian: ${stacksEvent.evmCustodian}`);
      console.log(`   Stacks TX: ${stacksEvent.stacksTxHash}`);

      // Check if already processed
      if (this.processedMessages.has(messageId)) {
        this.logService.warn('stacks-event', 'Message already processed', { messageId });
        console.log(`⚠️ Message already processed: ${messageId}`);
        return;
      }

      // Forward to EVM
      this.logService.info('stacks-event', '🔄 Forwarding to EVM...');
      console.log(`\n🔄 Forwarding to EVM...`);
      const evmTxHash = await this.evmMonitor.processStacksDeposit(stacksEvent);

      // Mark as successful
      this.markMessageProcessed(messageId, true, evmTxHash);
      this.successCount++;

      this.logService.info('stacks-event', '✅ Successfully processed deposit', {
        evmTxHash,
        totalSuccessful: this.successCount,
        totalFailed: this.failureCount
      });

      console.log(`\n✅ Successfully processed deposit!`);
      console.log(`   EVM TX: ${evmTxHash}`);
      console.log(`   Total processed: ${this.successCount} successful, ${this.failureCount} failed\n`);

    } catch (error) {
      this.markMessageProcessed(messageId, false, undefined, error instanceof Error ? error.message : String(error));
      this.failureCount++;

      this.logService.error('stacks-event', '❌ Failed to process deposit', {
        error: error instanceof Error ? error.message : String(error),
        totalSuccessful: this.successCount,
        totalFailed: this.failureCount
      });

      console.error(`\n❌ Failed to process deposit!`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`   Total processed: ${this.successCount} successful, ${this.failureCount} failed\n`);
    }
  }

  /**
   * Handle EVM message confirmation
   * Called when EVM contract emits CrossChainMessageProcessed event
   */
  private handleMessageConfirmation(messageId: string, messageType: number): void {
    console.log(`\n📬 EVM Message Confirmation Received`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Message Type: ${messageType === 1 ? 'Deposit' : messageType === 2 ? 'Withdrawal' : 'Acknowledgment'}`);
    
    const processedMessage = this.processedMessages.get(messageId);
    if (processedMessage) {
      console.log(`   ✅ Message confirmed as processed on EVM blockchain`);
    } else {
      console.log(`   ℹ️  Message ID not tracked locally (might be from previous session)`);
    }
    console.log('');
  }

  /**
   * Generate unique message ID for tracking
   */
  private generateMessageId(stacksEvent: StacksEvent): string {
    return `${stacksEvent.stacksTxHash}-${stacksEvent.timestamp}`;
  }

  /**
   * Mark message as processed
   */
  private markMessageProcessed(
    messageId: string, 
    success: boolean, 
    evmTxHash?: string,
    error?: string
  ): void {
    const processedMessage: ProcessedMessage = {
      messageId,
      success,
      error,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.processedMessages.set(messageId, processedMessage);
  }


  /**
   * Get processing statistics
   */
  getStats(): {
    totalMessages: number;
    successfulMessages: number;
    failedMessages: number;
    pendingMessages: number;
    confirmedMessages?: number;
  } {
    const confirmationStats = this.evmMonitor.getConfirmationStats();
    
    return {
      totalMessages: this.successCount + this.failureCount,
      successfulMessages: this.successCount,
      failedMessages: this.failureCount,
      pendingMessages: 0,
      confirmedMessages: confirmationStats.totalConfirmed
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
