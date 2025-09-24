/**
 * Main Relayer Service
 * Orchestrates cross-chain message processing between Stacks and EVM
 */

import { MessageProcessor } from './services/MessageProcessor';
import { RelayerConfig } from './config/index.js';
import { RelayerStats } from './types';

export class RelayerService {
  private messageProcessor: MessageProcessor;
  private config: RelayerConfig;
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor(config: RelayerConfig) {
    this.config = config;
    this.messageProcessor = new MessageProcessor(config);
  }

  /**
   * Start the relayer service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Relayer service is already running');
      return;
    }

    console.log('🚀 Starting BrickVault Cross-Chain Relayer...');
    console.log(`📊 Configuration:`);
    console.log(`   Stacks Network: ${this.config.stacks.network}`);
    console.log(`   Stacks API: ${this.config.stacks.apiUrl}`);
    console.log(`   EVM Network: ${this.config.evm.network}`);
    console.log(`   EVM RPC: ${this.config.evm.rpcUrl}`);
    console.log(`   Monitoring Interval: ${this.config.monitoring.interval}ms`);

    try {
      await this.messageProcessor.start();
      this.isRunning = true;
      this.startTime = Date.now();
      
      console.log('✅ Relayer service started successfully');
      console.log('🔄 Monitoring cross-chain events...');
    } catch (error) {
      console.error('❌ Failed to start relayer service:', error);
      throw error;
    }
  }

  /**
   * Stop the relayer service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Relayer service is not running');
      return;
    }

    console.log('⏹️ Stopping BrickVault Cross-Chain Relayer...');

    try {
      await this.messageProcessor.stop();
      this.isRunning = false;
      
      console.log('✅ Relayer service stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping relayer service:', error);
      throw error;
    }
  }

  /**
   * Get relayer status
   */
  getStatus(): {
    isRunning: boolean;
    uptime: number;
    stats: RelayerStats;
    monitoring: {
      stacks: { isMonitoring: boolean; lastProcessedBlock: number };
      evm: { isMonitoring: boolean; lastProcessedBlock: number };
    };
  } {
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;
    const stats = this.getStats();
    const monitoring = this.messageProcessor.getMonitoringStatus();

    return {
      isRunning: this.isRunning,
      uptime,
      stats,
      monitoring
    };
  }

  /**
   * Get relayer statistics
   */
  getStats(): RelayerStats {
    const processorStats = this.messageProcessor.getStats();
    const monitoringStatus = this.messageProcessor.getMonitoringStatus();

    return {
      totalMessages: processorStats.totalMessages,
      successfulMessages: processorStats.successfulMessages,
      failedMessages: processorStats.failedMessages,
      pendingMessages: processorStats.pendingMessages,
      lastProcessedBlock: {
        stacks: monitoringStatus.stacks.lastProcessedBlock,
        evm: monitoringStatus.evm.lastProcessedBlock
      }
    };
  }

  /**
   * Get health check status
   */
  getHealthCheck(): {
    status: 'healthy' | 'unhealthy';
    timestamp: number;
    details: {
      relayer: boolean;
      stacks: boolean;
      evm: boolean;
    };
  } {
    const monitoringStatus = this.messageProcessor.getMonitoringStatus();
    
    const stacksHealthy = monitoringStatus.stacks.isMonitoring;
    const evmHealthy = monitoringStatus.evm.isMonitoring;
    const relayerHealthy = this.isRunning;

    const overallHealthy = relayerHealthy && stacksHealthy && evmHealthy;

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      details: {
        relayer: relayerHealthy,
        stacks: stacksHealthy,
        evm: evmHealthy
      }
    };
  }

  /**
   * Process a specific Stacks event (for manual processing)
   */
  async processStacksEvent(event: any): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Relayer service is not running');
    }

    // This would be called by the API endpoints for manual event processing
    console.log('🔄 Manual processing of Stacks event:', event);
    
    // Implementation would depend on the specific event type
    // For now, we'll just log it
    return { success: true, message: 'Event logged for processing' };
  }

  /**
   * Process a specific EVM event (for manual processing)
   */
  async processEVMEvent(event: any): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Relayer service is not running');
    }

    // This would be called by the API endpoints for manual event processing
    console.log('🔄 Manual processing of EVM event:', event);
    
    // Implementation would depend on the specific event type
    // For now, we'll just log it
    return { success: true, message: 'Event logged for processing' };
  }

  /**
   * Get processed messages
   */
  getProcessedMessages(): any[] {
    return this.messageProcessor.getAllProcessedMessages();
  }

  /**
   * Get processed message by ID
   */
  getProcessedMessage(messageId: string): any {
    return this.messageProcessor.getProcessedMessage(messageId);
  }

  /**
   * Restart the relayer service
   */
  async restart(): Promise<void> {
    console.log('🔄 Restarting relayer service...');
    
    if (this.isRunning) {
      await this.stop();
    }
    
    await this.start();
    
    console.log('✅ Relayer service restarted successfully');
  }

  /**
   * Get configuration (without sensitive data)
   */
  getConfig() {
    return {
      environment: this.config.environment,
      stacks: {
        network: this.config.stacks.network,
        apiUrl: this.config.stacks.apiUrl,
        contractAddress: this.config.stacks.contractAddress,
        feeRate: this.config.stacks.feeRate,
        maxRetries: this.config.stacks.maxRetries
      },
      evm: {
        network: this.config.evm.network,
        rpcUrl: this.config.evm.rpcUrl,
        stacksManagerAddress: this.config.evm.stacksManagerAddress,
        gasLimit: this.config.evm.gasLimit,
        maxRetries: this.config.evm.maxRetries
      },
      monitoring: this.config.monitoring,
      logging: this.config.logging
    };
  }
}
