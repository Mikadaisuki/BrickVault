import { ethers } from 'hardhat';

export class LayerZeroTestHelper {
  static async deployMockEndpoint() {
    // For testing purposes, we'll create a mock endpoint
    // In a real scenario, you'd use the LayerZero TestHelper
    const MockEndpoint = await ethers.getContractFactory('MockLayerZeroEndpoint');
    return await MockEndpoint.deploy();
  }

  static async getTestEndpointId(): Promise<number> {
    // Return a test endpoint ID
    return 1;
  }

  static async getTestOptions(): Promise<string> {
    // Return empty options for testing
    return '0x';
  }
}
