/**
 * Stacks Event Monitor
 * Monitors Stacks blockchain for cross-chain events using @stacks/network and @stacks/transactions
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

    console.log(`📡 Processing Stacks event: ${event.event}`);

    try {
      const stacksEvent = this.parseStacksEvent(event);
      
      if (stacksEvent) {
        await this.forwardToEVM(stacksEvent);
      }
    } catch (error) {
      console.error('❌ Error processing Stacks event:', error);
    }
  }

  /**
   * Check if event is from our contract
   */
  private isOurContractEvent(event: StacksContractEvent): boolean {
    const contractAddress = this.config.stacks.contractAddress;
    return event.event.includes('deposit:event-emitted') ||
           event.event.includes('withdrawal:event-emitted') ||
           event.event.includes('stage:acknowledgment-sent');
  }

  /**
   * Parse Stacks event into our format
   */
  private parseStacksEvent(event: StacksContractEvent): StacksEvent | null {
    try {
      let eventType: StacksEvent['eventType'];
      let user = 'unknown';
      let propertyId = 0;
      let amount = '0';

      if (event.event.includes('deposit:event-emitted')) {
        eventType = 'deposit';
        // Extract data from event
        propertyId = parseInt(event.data.property_id || '0');
        amount = event.data.amount || '0';
      } else if (event.event.includes('withdrawal:event-emitted')) {
        eventType = 'withdrawal';
        propertyId = parseInt(event.data.property_id || '0');
        amount = event.data.amount || '0';
      } else if (event.event.includes('stage:acknowledgment-sent')) {
        eventType = 'stage-acknowledgment';
        propertyId = parseInt(event.data.property_id || '0');
        amount = event.data.stage || '0';
      } else {
        return null;
      }

      return {
        id: `${event.tx_id}-${event.block_height}`,
        eventType,
        user,
        propertyId,
        amount,
        stacksTxHash: event.tx_id,
        timestamp: Date.now(),
        processed: false,
        blockHeight: event.block_height
      };
    } catch (error) {
      console.error('❌ Error parsing Stacks event:', error);
      return null;
    }
  }

  /**
   * Forward Stacks event to EVM
   */
  private async forwardToEVM(stacksEvent: StacksEvent): Promise<void> {
    // This will be implemented in the message processor
    console.log(`🔄 Forwarding Stacks event to EVM: ${stacksEvent.id}`);
  }

  /**
   * Call Stacks contract function (for stage updates)
   */
  async updateStacksStage(propertyId: number, stage: number, proof: string): Promise<string> {
    try {
      const txOptions = {
        contractAddress: this.config.stacks.contractAddress.split('.')[0],
        contractName: this.config.stacks.contractAddress.split('.')[1],
        functionName: 'relayer-update-stage',
        functionArgs: [
          Cl.uint(propertyId),
          Cl.uint(stage),
          Cl.uint(proof)
        ],
        senderKey: this.config.stacks.privateKey,
        network: this.network,
      };

      const transaction = await makeContractCall(txOptions);
      const response = await broadcastTransaction({ transaction });
      
      console.log(`✅ Stacks stage update transaction: ${response.txid}`);
      return response.txid;
    } catch (error) {
      console.error('❌ Error updating Stacks stage:', error);
      throw error;
    }
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
  getStatus(): { isMonitoring: boolean; lastProcessedBlock: number } {
    return {
      isMonitoring: this.isMonitoring,
      lastProcessedBlock: this.lastProcessedBlock
    };
  }
}
