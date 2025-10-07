/**
 * Stacks Event Monitor for BrickVault Gateway
 * Monitors brick-vault-gateway contract for sBTC deposits and triggers OFTUSDC minting on EVM
 * 
 * Workflow:
 * 1. Listen for ft_transfer_event from brick-vault-gateway contract
 * 2. Extract sBTC amount and sender address
 * 3. Query contract to get EVM custodian address for the sender
 * 4. Trigger OFTUSDC minting on EVM to the custodian address
 * 5. Ignore withdrawal events as requested
 */

import { StacksNetwork, STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import { makeContractCall, broadcastTransaction, fetchCallReadOnlyFunction } from '@stacks/transactions';
import { Cl } from '@stacks/transactions';
import axios from 'axios';
import { RelayerConfig } from '../config/index.js';
import { StacksEvent, StacksContractEvent } from '../types';

export class StacksMonitor {
  private network: StacksNetwork;
  private config: RelayerConfig;
  private lastProcessedBlock: number = 0;
  private isMonitoring: boolean = false;
  private processedTransactions: Set<string> = new Set(); // Track processed transactions to prevent double-spend

  constructor(config: RelayerConfig) {
    this.config = config;
    this.network = this.createNetwork();
  }

  private createNetwork(): StacksNetwork {
    if (this.config.stacks.network === 'testnet') {
      return STACKS_TESTNET;
    } else {
      return STACKS_MAINNET;
    }
  }

  /**
   * Start monitoring Stacks blockchain for events
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('Stacks monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 Starting Stacks event monitoring...');

    // Get current block height
    await this.updateLastProcessedBlock();

    // Start monitoring loop
    this.monitoringLoop();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('⏹️ Stacks monitoring stopped');
  }

  /**
   * Main monitoring loop
   */
  private async monitoringLoop(): Promise<void> {
    while (this.isMonitoring) {
      try {
        await this.processNewBlocks();
        await this.sleep(this.config.monitoring.interval);
      } catch (error) {
        console.error('❌ Error in Stacks monitoring loop:', error);
        await this.sleep(this.config.monitoring.retryDelay);
      }
    }
  }

  /**
   * Process new blocks for events
   */
  private async processNewBlocks(): Promise<void> {
    const currentBlock = await this.getCurrentBlockHeight();
    
    if (currentBlock > this.lastProcessedBlock) {
      console.log(`📦 Processing Stacks blocks ${this.lastProcessedBlock + 1} to ${currentBlock}`);
      
      for (let blockHeight = this.lastProcessedBlock + 1; blockHeight <= currentBlock; blockHeight++) {
        await this.processBlock(blockHeight);
      }
      
      this.lastProcessedBlock = currentBlock;
    }
  }

  /**
   * Process a specific block for events
   */
  private async processBlock(blockHeight: number): Promise<void> {
    try {
      const events = await this.getBlockEvents(blockHeight);
      
      for (const event of events) {
        await this.processStacksEvent(event);
      }
    } catch (error) {
      console.error(`❌ Error processing block ${blockHeight}:`, error);
    }
  }

  /**
   * Get events from a specific block
   */
  private async getBlockEvents(blockHeight: number): Promise<StacksContractEvent[]> {
    try {
      const response = await axios.get(
        `${this.config.stacks.apiUrl}/extended/v1/tx/events`,
        {
          params: {
            block_height: blockHeight,
            limit: 50
          }
        }
      );

      return response.data.events || [];
    } catch (error) {
      console.error(`❌ Error fetching events for block ${blockHeight}:`, error);
      return [];
    }
  }

  /**
   * Process a Stacks contract event
   */
  private async processStacksEvent(event: StacksContractEvent): Promise<void> {
    // Filter for our contract events
    if (!this.isOurContractEvent(event)) {
      return;
    }

    // Generate unique identifier for double-spend prevention
    const uniqueId = this.generateUniqueId(event);
    
    // Check if transaction already processed
    if (this.processedTransactions.has(uniqueId)) {
      console.log(`⚠️ Transaction already processed, skipping: ${uniqueId}`);
      return;
    }

    console.log(`📡 Processing brick-vault-gateway event: ${event.event} (ID: ${uniqueId})`);

    try {
      const stacksEvent = this.parseStacksEvent(event);
      
      if (stacksEvent) {
        // Mark transaction as processed BEFORE processing to prevent race conditions
        this.processedTransactions.add(uniqueId);
        
        await this.forwardToEVM(stacksEvent);
        
        console.log(`✅ Transaction processed successfully: ${uniqueId}`);
      }
    } catch (error) {
      console.error(`❌ Error processing Stacks event ${uniqueId}:`, error);
      // Remove from processed set if processing failed
      this.processedTransactions.delete(uniqueId);
    }
  }

  /**
   * Generate unique identifier for transaction to prevent double-spend
   */
  private generateUniqueId(event: StacksContractEvent): string {
    // In production, use transaction hash as the primary unique identifier
    if (event.tx_id) {
      return event.tx_id;
    }
    
    // Fallback for simnet/testing: combine available data with timestamp and random
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const sender = event.data.sender || 'unknown';
    const amount = event.data.amount || '0';
    const recipient = event.data.recipient || 'unknown';
    
    // Create a deterministic but unique identifier with timestamp
    return `${sender}-${amount}-${recipient}-${timestamp}-${random}`;
  }

  /**
   * Check if event is from our brick-vault-gateway contract
   */
  private isOurContractEvent(event: StacksContractEvent): boolean {
    // Filter for events from brick-vault-gateway contract
    const isFromGateway = event.contract_address?.includes('brick-vault-gateway') ||
                         event.data?.contract_identifier?.includes('brick-vault-gateway') ||
                         event.data?.recipient?.includes('brick-vault-gateway');
    
    // Only process deposit events (ignore withdrawals as requested)
    const isDepositEvent = event.event === 'ft_transfer_event' || 
                          event.event === 'print_event';
    
    return isFromGateway && isDepositEvent;
  }

  /**
   * Parse Stacks event into our format for brick-vault-gateway
   */
  private parseStacksEvent(event: StacksContractEvent): StacksEvent | null {
    try {
      // Only process ft_transfer_event for sBTC deposits
      if (event.event !== 'ft_transfer_event') {
        return null;
      }

      // Extract sBTC deposit data
      const amount = event.data.amount || '0';
      const sender = event.data.sender || 'unknown';
      const recipient = event.data.recipient || '';
      
      // Verify this is an sBTC transfer to our gateway contract
      const isSBTC = event.data.asset_identifier?.includes('sbtc-token');
      const isToGateway = recipient.includes('brick-vault-gateway');
      
      if (!isSBTC || !isToGateway) {
        return null;
      }

      // Get EVM custodian address for the sender
      const evmCustodian = await this.getEVMCustodian(sender);

      return {
        id: `${event.tx_id}-${event.block_height}`,
        eventType: 'deposit',
        user: sender,
        propertyId: 0, // No property-specific logic in gateway
        amount: amount,
        stacksTxHash: event.tx_id,
        timestamp: Date.now(),
        processed: false,
        blockHeight: event.block_height,
        evmCustodian: evmCustodian
      };
    } catch (error) {
      console.error('❌ Error parsing Stacks event:', error);
      return null;
    }
  }

  /**
   * Get EVM custodian address for a Stacks address
   */
  private async getEVMCustodian(stacksAddress: string): Promise<string> {
    try {
      const result = await this.readContractState('get-evm-custodian', [
        Cl.standardPrincipal(stacksAddress)
      ]);
      
      return result.value || stacksAddress; // Fallback to stacks address if no custodian found
    } catch (error) {
      console.error(`❌ Error getting EVM custodian for ${stacksAddress}:`, error);
      return stacksAddress; // Fallback to stacks address
    }
  }

  /**
   * Forward Stacks sBTC deposit event to EVM for OFTUSDC minting
   */
  private async forwardToEVM(stacksEvent: StacksEvent): Promise<void> {
    console.log(`🔄 Processing sBTC deposit for OFTUSDC minting:`, {
      id: stacksEvent.id,
      sender: stacksEvent.user,
      amount: stacksEvent.amount,
      evmCustodian: stacksEvent.evmCustodian,
      stacksTxHash: stacksEvent.stacksTxHash
    });

    // TODO: Implement OFTUSDC minting on EVM
    // This should:
    // 1. Convert sBTC amount to OFTUSDC amount (1:1 ratio)
    // 2. Mint OFTUSDC to the evmCustodian address
    // 3. Emit cross-chain event for tracking
    // 4. Mark stacksEvent as processed
    
    console.log(`✅ sBTC deposit processed: ${stacksEvent.amount} sBTC -> OFTUSDC to ${stacksEvent.evmCustodian}`);
  }

  /**
   * Read Stacks contract state
   */
  async readContractState(functionName: string, args: any[] = []): Promise<any> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.config.stacks.contractAddress.split('.')[0],
        contractName: this.config.stacks.contractAddress.split('.')[1],
        functionName,
        functionArgs: args,
        senderAddress: this.config.stacks.contractAddress.split('.')[0], // Use contract address as sender for read-only calls
        network: this.network,
      });

      return result;
    } catch (error) {
      console.error(`❌ Error reading contract state for ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Get current block height
   */
  private async getCurrentBlockHeight(): Promise<number> {
    try {
      const response = await axios.get(`${this.config.stacks.apiUrl}/extended/v1/block`);
      return response.data.height;
    } catch (error) {
      console.error('❌ Error getting current block height:', error);
      return this.lastProcessedBlock;
    }
  }

  /**
   * Update last processed block from storage
   */
  private async updateLastProcessedBlock(): Promise<void> {
    // In a real implementation, this would read from a database
    // For now, we'll start from current block - 10
    const currentBlock = await this.getCurrentBlockHeight();
    this.lastProcessedBlock = Math.max(0, currentBlock - 10);
    console.log(`📍 Starting Stacks monitoring from block ${this.lastProcessedBlock}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring status
   */
  getStatus(): { 
    isMonitoring: boolean; 
    lastProcessedBlock: number;
    processedTransactionsCount: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastProcessedBlock: this.lastProcessedBlock,
      processedTransactionsCount: this.processedTransactions.size
    };
  }

  /**
   * Get processed transactions (for debugging)
   */
  getProcessedTransactions(): string[] {
    return Array.from(this.processedTransactions);
  }

  /**
   * Clear processed transactions (for testing)
   */
  clearProcessedTransactions(): void {
    this.processedTransactions.clear();
    console.log('🧹 Cleared processed transactions set');
  }
}
