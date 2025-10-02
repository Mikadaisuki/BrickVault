import { ethers } from 'hardhat';

async function main() {
  console.log('🧪 Testing automatic proposal creation...');
  
  // Get the deployed PropertyDAO address from the deployment
  const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
  const propertyDAO = PropertyDAO.attach('0x19cEcCd6942ad38562Ee10bAfd44776ceB67e923');
  
  console.log('📊 Current property info:');
  const propertyInfo = await propertyDAO.propertyInfo();
  console.log('- Stage:', Number(propertyInfo.stage));
  console.log('- Total Invested:', ethers.formatUnits(propertyInfo.totalInvested, 18));
  console.log('- Funding Target:', ethers.formatUnits(propertyInfo.fundingTarget, 18));
  console.log('- Is Fully Funded:', propertyInfo.isFullyFunded);
  
  console.log('\n📋 Current proposal count:', Number(await propertyDAO.proposalCount()));
  
  // Simulate reaching the funding target
  console.log('\n🎯 Simulating funding target reached...');
  const fundingTarget = await propertyDAO.propertyInfo().then(info => info.fundingTarget);
  await propertyDAO.updateTotalInvested(fundingTarget);
  
  console.log('✅ Updated total invested to funding target');
  
  // Check if proposal was created
  console.log('\n📋 New proposal count:', Number(await propertyDAO.proposalCount()));
  
  if (Number(await propertyDAO.proposalCount()) > 0) {
    console.log('\n🎉 Automatic proposal created!');
    const proposal = await propertyDAO.proposals(1);
    console.log('- Proposal ID:', Number(proposal.id));
    console.log('- Proposer:', proposal.proposer);
    console.log('- Type:', Number(proposal.proposalType));
    console.log('- Description:', proposal.description);
    console.log('- Status:', Number(proposal.status));
    console.log('- Deadline:', new Date(Number(proposal.deadline) * 1000).toISOString());
  } else {
    console.log('❌ No proposal was created');
  }
  
  // Check updated property info
  console.log('\n📊 Updated property info:');
  const updatedPropertyInfo = await propertyDAO.propertyInfo();
  console.log('- Stage:', Number(updatedPropertyInfo.stage));
  console.log('- Total Invested:', ethers.formatUnits(updatedPropertyInfo.totalInvested, 18));
  console.log('- Is Fully Funded:', updatedPropertyInfo.isFullyFunded);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
