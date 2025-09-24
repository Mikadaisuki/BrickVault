/**
 * Vercel Serverless Function: Relayer Status
 * GET /api/status - Get relayer service status and statistics
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
    // Load configuration using the new config system
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

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const relayer = getRelayerService();
    const status = relayer.getStatus();

    return res.status(200).json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting relayer status:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get relayer status',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}
