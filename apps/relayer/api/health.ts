/**
 * Vercel Serverless Function: Health Check
 * GET /api/health - Get relayer health status
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    const healthCheck = relayer.getHealthCheck();

    // Return appropriate HTTP status based on health
    const httpStatus = healthCheck.status === 'healthy' ? 200 : 503;

    return res.status(httpStatus).json({
      success: healthCheck.status === 'healthy',
      data: healthCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting health check:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get health check',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}
