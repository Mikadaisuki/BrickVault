const fs = require('fs');
const path = require('path');

// Contract names to extract ABIs for
const contracts = [
  'PropertyRegistry',
  'PropertyRegistryAnalytics', 
  'PropertyRegistryGovernance',
  'PropertyRegistryRateLimit',
  'PropertyVault',
  'PropertyDAO',
  'PropertyToken',
  'OFTUSDC',
  'ShareOFT',
  'ShareOFTAdapter',
  'VaultBase',
  'VaultComposerSync',
  'StacksCrossChainManager',
  'EnvironmentConfig',
  'MockLayerZeroEndpointV2'
];

// Path to the contracts artifacts
const artifactsPath = path.join(__dirname, '../../contracts-evm/artifacts/src');

// Create abis directory
const abisDir = path.join(__dirname, '../abis');
if (!fs.existsSync(abisDir)) {
  fs.mkdirSync(abisDir, { recursive: true });
}

console.log('🔍 Extracting ABIs from compiled contracts...');

contracts.forEach(contractName => {
  const contractPath = path.join(artifactsPath, `${contractName}.sol`);
  const abiPath = path.join(contractPath, `${contractName}.json`);
  
  if (fs.existsSync(abiPath)) {
    try {
      const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      const abi = artifact.abi;
      
      // Save ABI to separate file
      const outputPath = path.join(abisDir, `${contractName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
      
      console.log(`✅ Extracted ABI for ${contractName}`);
    } catch (error) {
      console.log(`❌ Failed to extract ABI for ${contractName}:`, error.message);
    }
  } else {
    console.log(`⚠️  Contract artifact not found: ${contractName}`);
  }
});

console.log('🎉 ABI extraction complete!');
