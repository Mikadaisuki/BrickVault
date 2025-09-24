/**
 * Vercel Serverless Function: Start Relayer
 * POST /api/start - Start the relayer service
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { RelayerService } from '../src/RelayerService';
import { getConfig } from '../src/config/index.js';

// Global relayer service instance
let relayerService: RelayerService | null = null;

/**
 * Initialize relayer service with configuration
 */
function getRelayerService(): RelayerService {
  if (!relayerService) {
    const config = getConfig();
    relayerService = new RelayerService(config);
  }
  return relayerService;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const relayer = getRelayerService();
    
    // Check if already running
    const currentStatus = relayer.getStatus();
    if (currentStatus.isRunning) {
      return res.status(200).json({
        success: true,
        message: 'Relayer service is already running',
        data: currentStatus,
        timestamp: new Date().toISOString()
      });
    }

    // Start the relayer
    await relayer.start();
    
    const newStatus = relayer.getStatus();

    return res.status(200).json({
      success: true,
      message: 'Relayer service started successfully',
      data: newStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error starting relayer service:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to start relayer service',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}
