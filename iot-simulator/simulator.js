/**
 * IoT Temperature Sensor Simulator
 * Simulates autonomous temperature readings for blood bags
 */

const { ethers } = require("ethers");
require("dotenv").config();

// Configuration
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const IOT_INTERVAL = parseInt(process.env.IOT_INTERVAL) || 10000; // 10 seconds default

// Contract ABI (only the functions we need)
const CONTRACT_ABI = [
    "function recordTemp(string memory bagId, int256 temp) external",
    "function getAllBags() external view returns (string[] memory)",
    "function getBag(string memory bagId) external view returns (tuple(string bagId, address owner, uint40 donationDate, uint40 expiryDate, uint8 bloodType, uint8 status, bool exists, string ipfsHash))",
    "event TempRecorded(string indexed bagId, int256 temp, bool inRange, address indexed recorder, uint256 timestamp)",
    "event Spoiled(string indexed bagId, int256 lastTemp, uint256 timestamp)"
];

// Status enum
const BagStatus = {
    REGISTERED: 0,
    IN_TRANSIT: 1,
    DELIVERED: 2,
    SPOILED: 3
};

class IoTSimulator {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.isRunning = false;
        this.simulationMode = "normal"; // normal, cold_breach, hot_breach, random
        this.targetBagId = null;
    }

    async initialize() {
        console.log("🌡️  IoT Temperature Sensor Simulator");
        console.log("=".repeat(50));
        console.log(`📡 Connecting to: ${RPC_URL}`);

        this.provider = new ethers.JsonRpcProvider(RPC_URL);
        
        // Get the 5th account (index 4) which is the IoT sensor
        const accounts = await this.provider.listAccounts();
        if (accounts.length < 5) {
            console.error("❌ Not enough accounts. Please start Hardhat node first.");
            process.exit(1);
        }
        
        this.signer = await this.provider.getSigner(4); // IoT Sensor account
        const address = await this.signer.getAddress();
        console.log(`🔑 IoT Sensor Address: ${address}`);

        if (!CONTRACT_ADDRESS) {
            console.error("❌ CONTRACT_ADDRESS not set in .env file");
            console.log("   Please deploy the contract first and update .env");
            process.exit(1);
        }

        this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);
        console.log(`📋 Contract Address: ${CONTRACT_ADDRESS}`);
        console.log("=".repeat(50));
        console.log("");

        // Listen for events
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.contract.on("TemperatureRecorded", (bagId, temperature, isWithinRange, recordedBy, timestamp) => {
            const temp = Number(temperature) / 100;
            const status = isWithinRange ? "✅ SAFE" : "⚠️ BREACH";
            console.log(`   📊 Event: Temperature ${temp}°C recorded - ${status}`);
        });

        this.contract.on("BagSpoiled", (bagId, lastTemperature, timestamp) => {
            const temp = Number(lastTemperature) / 100;
            console.log(`   🚨 Event: BAG SPOILED! Last temp: ${temp}°C`);
        });
    }

    // Generate realistic temperature based on mode
    generateTemperature() {
        switch (this.simulationMode) {
            case "normal":
                // Normal operation: 2°C to 6°C with slight variations
                return 2 + Math.random() * 4;
            
            case "cold_breach":
                // Simulate cooling system malfunction (below 2°C)
                return -2 + Math.random() * 3;
            
            case "hot_breach":
                // Simulate refrigeration failure (above 6°C)
                return 7 + Math.random() * 8;
            
            case "random":
                // Random including breaches (10% chance of breach)
                if (Math.random() < 0.1) {
                    return Math.random() < 0.5 
                        ? (-2 + Math.random() * 3)  // Cold breach
                        : (7 + Math.random() * 8);   // Hot breach
                }
                return 2 + Math.random() * 4;
            
            case "gradual_failure":
                // Simulate gradual cooling failure
                if (!this.failureProgress) this.failureProgress = 0;
                this.failureProgress += 0.5;
                return 4 + this.failureProgress;
            
            default:
                return 4; // Default safe temperature
        }
    }

    async getActiveBags() {
        try {
            const allBagIds = await this.contract.getAllBags();
            const activeBags = [];

            for (const bagId of allBagIds) {
                const bag = await this.contract.getBag(bagId);
                // Only record temperature for bags in transit (not spoiled or delivered)
                if (bag.status === BigInt(BagStatus.IN_TRANSIT)) {
                    activeBags.push(bagId);
                }
            }

            return activeBags;
        } catch (error) {
            console.error("Error fetching bags:", error.message);
            return [];
        }
    }

    async recordTemperature(bagId, temperature) {
        try {
            // Convert to contract format (multiply by 100)
            const tempContract = Math.round(temperature * 100);
            
            console.log(`📤 Recording temperature for ${bagId}: ${temperature.toFixed(2)}°C`);
            
            const tx = await this.contract.recordTemp(bagId, tempContract);
            await tx.wait();
            
            const isSafe = temperature >= 2 && temperature <= 6;
            if (isSafe) {
                console.log(`   ✅ Temperature recorded successfully (Safe range)`);
            } else {
                console.log(`   ⚠️ TEMPERATURE BREACH DETECTED!`);
            }
            
            return true;
        } catch (error) {
            console.error(`   ❌ Error: ${error.reason || error.message}`);
            return false;
        }
    }

    async runSimulation() {
        this.isRunning = true;
        console.log("🚀 Starting IoT Simulation...");
        console.log(`   Mode: ${this.simulationMode}`);
        console.log(`   Interval: ${IOT_INTERVAL}ms`);
        console.log("   Press Ctrl+C to stop\n");

        while (this.isRunning) {
            const bags = this.targetBagId 
                ? [this.targetBagId] 
                : await this.getActiveBags();

            if (bags.length === 0) {
                console.log("📭 No bags in transit. Waiting...");
            } else {
                console.log(`\n🔍 Found ${bags.length} bag(s) in transit`);
                
                for (const bagId of bags) {
                    const temperature = this.generateTemperature();
                    await this.recordTemperature(bagId, temperature);
                }
            }

            // Wait for next interval
            await new Promise(resolve => setTimeout(resolve, IOT_INTERVAL));
        }
    }

    // Interactive mode for manual testing
    async interactiveMode() {
        const readline = require("readline");
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

        console.log("\n🎮 Interactive IoT Simulator Mode");
        console.log("=".repeat(50));
        console.log("Commands:");
        console.log("  1. Record normal temperature (2-6°C)");
        console.log("  2. Record cold breach (<2°C)");
        console.log("  3. Record hot breach (>6°C)");
        console.log("  4. Record custom temperature");
        console.log("  5. List active bags");
        console.log("  6. Start auto simulation");
        console.log("  7. Exit");
        console.log("");

        while (true) {
            const choice = await question("\n📌 Enter command (1-7): ");

            switch (choice) {
                case "1":
                    const bags1 = await this.getActiveBags();
                    if (bags1.length > 0) {
                        const bagId = await question(`Enter bag ID [${bags1[0]}]: `) || bags1[0];
                        await this.recordTemperature(bagId, 2 + Math.random() * 4);
                    } else {
                        console.log("No active bags found");
                    }
                    break;

                case "2":
                    const bags2 = await this.getActiveBags();
                    if (bags2.length > 0) {
                        const bagId = await question(`Enter bag ID [${bags2[0]}]: `) || bags2[0];
                        await this.recordTemperature(bagId, -1 + Math.random() * 2);
                    } else {
                        console.log("No active bags found");
                    }
                    break;

                case "3":
                    const bags3 = await this.getActiveBags();
                    if (bags3.length > 0) {
                        const bagId = await question(`Enter bag ID [${bags3[0]}]: `) || bags3[0];
                        await this.recordTemperature(bagId, 8 + Math.random() * 5);
                    } else {
                        console.log("No active bags found");
                    }
                    break;

                case "4":
                    const bags4 = await this.getActiveBags();
                    const bagId = await question("Enter bag ID: ");
                    const temp = parseFloat(await question("Enter temperature (°C): "));
                    if (!isNaN(temp)) {
                        await this.recordTemperature(bagId, temp);
                    }
                    break;

                case "5":
                    const activeBags = await this.getActiveBags();
                    console.log(`\n📦 Active bags in transit: ${activeBags.length}`);
                    activeBags.forEach(id => console.log(`   - ${id}`));
                    break;

                case "6":
                    const mode = await question("Simulation mode (normal/cold_breach/hot_breach/random): ") || "normal";
                    this.simulationMode = mode;
                    rl.close();
                    await this.runSimulation();
                    return;

                case "7":
                    console.log("👋 Goodbye!");
                    rl.close();
                    process.exit(0);

                default:
                    console.log("Invalid command");
            }
        }
    }
}

// Main
async function main() {
    const simulator = new IoTSimulator();
    await simulator.initialize();

    const args = process.argv.slice(2);
    
    if (args.includes("--auto")) {
        // Auto mode with optional mode setting
        const modeIndex = args.indexOf("--mode");
        if (modeIndex !== -1 && args[modeIndex + 1]) {
            simulator.simulationMode = args[modeIndex + 1];
        }
        
        const bagIndex = args.indexOf("--bag");
        if (bagIndex !== -1 && args[bagIndex + 1]) {
            simulator.targetBagId = args[bagIndex + 1];
        }
        
        await simulator.runSimulation();
    } else {
        // Interactive mode
        await simulator.interactiveMode();
    }
}

main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\n\n👋 Shutting down IoT Simulator...");
    process.exit(0);
});
