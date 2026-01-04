const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Deploying BloodColdChainV2 contract...\n");

    // Get deployer account
    const [deployer, bloodBank, transporter, hospital] = await hre.ethers.getSigners();
    
    console.log("📋 Deployment Account:", deployer.address);
    console.log("💰 Account Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy the contract
    const BloodColdChain = await hre.ethers.getContractFactory("BloodColdChainV2");
    const bloodColdChain = await BloodColdChain.deploy();
    await bloodColdChain.waitForDeployment();

    const contractAddress = await bloodColdChain.getAddress();
    console.log("✅ BloodColdChainV2 deployed to:", contractAddress);
    console.log("");

    // Register participants for demo
    console.log("👥 Registering demo participants...\n");

    // Register Blood Bank (Kizilay)
    await bloodColdChain.addParticipant(
        bloodBank.address,
        "Kizilay Blood Bank",
        0 // Role.BLOOD_BANK
    );
    console.log("🏥 Blood Bank (Kizilay):", bloodBank.address);

    // Register Transporter (DHL)
    await bloodColdChain.addParticipant(
        transporter.address,
        "DHL Logistics",
        1 // Role.TRANSPORTER
    );
    console.log("🚚 Transporter (DHL):", transporter.address);

    // Register Hospital
    await bloodColdChain.addParticipant(
        hospital.address,
        "City Hospital",
        2 // Role.HOSPITAL
    );
    console.log("🏨 Hospital:", hospital.address);

    console.log("\n" + "=".repeat(60));
    console.log("📝 DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Contract Address:", contractAddress);
    console.log("Admin Address:", deployer.address);
    console.log("Network:", hre.network.name);
    console.log("=".repeat(60));
    
    // Auto-save to .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    // Read existing .env if exists
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add addresses
    const envUpdates = {
        'CONTRACT_ADDRESS': contractAddress,
        'ADMIN_ADDRESS': deployer.address,
        'BLOOD_BANK_ADDRESS': bloodBank.address,
        'TRANSPORTER_ADDRESS': transporter.address,
        'HOSPITAL_ADDRESS': hospital.address
    };
    
    for (const [key, value] of Object.entries(envUpdates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            envContent += `\n${key}=${value}`;
        }
    }
    
    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log("\n✅ Addresses automatically saved to .env file!");

    return {
        contractAddress,
        deployer: deployer.address,
        bloodBank: bloodBank.address,
        transporter: transporter.address,
        hospital: hospital.address
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
