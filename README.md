# Blood Cold Chain - Blockchain Management System

<p align="center">
  <img src="https://img.shields.io/badge/Solidity-0.8.20-blue" alt="Solidity">
  <img src="https://img.shields.io/badge/Hardhat-2.19.0-yellow" alt="Hardhat">
  <img src="https://img.shields.io/badge/ethers.js-6.9.0-purple" alt="ethers.js">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
</p>

## 📋 Project Overview

This project implements a **Blockchain-based Blood Cold Chain Management System** to ensure the safety and traceability of blood products (e.g., erythrocytes) during storage and transport.

### 🎯 Problem Statement

- **Critical Cold Chain Breaches**: Blood products must be stored between **+2°C to +6°C**. Temperature deviations lead to spoilage.
- **Lack of Transparency & Data Integrity**: Traditional centralized systems have mutable logs that can be manipulated.
- **Patient Safety Risks**: Manual tracking creates risks from human error.

### ✅ Solution

A decentralized blockchain system that:
- Provides **immutable** temperature and ownership records
- **Automatically flags** blood bags as "spoiled" when temperature exceeds safe range
- Enables **full traceability** from donation to delivery
- Ensures **transparency** for all participants

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Blood Cold Chain System                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  Blood Bank  │──▶│  Transporter │──▶│   Hospital   │    │
│  │  (Kizilay)   │   │    (DHL)     │   │              │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│         │                  │                   │            │
│         ▼                  ▼                   ▼            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Smart Contract (Ethereum)               │   │
│  │  • registerDonation()                                │   │
│  │  • transferOwnership()                               │   │
│  │  • recordTemperature() ──▶ Auto-spoil if T<2 or T>6 │   │
│  │  • getBagHistory()                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▲                                  │
│                          │                                  │
│                  ┌───────┴───────┐                         │
│                  │  IoT Sensor   │                         │
│                  │  (Simulated)  │                         │
│                  └───────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 👥 System Users

| Role | Description | Functions |
|------|-------------|-----------|
| **Blood Bank** | Registers blood donations (e.g., Kizilay) | `registerDonation()` |
| **Transporter** | Handles logistics and can record temperature | `transferOwnership()`, `recordTemperature()` |
| **Hospital** | Receives blood bags and verifies history | `getBagHistory()` |
| **IoT Sensor** | Autonomously reports temperature data | `recordTemperature()` |

## 🔧 Core Functions

### `registerDonation(bagId, bloodType, expiryDays)`
Registers a new blood donation with unique ID, blood type, and expiry period.

### `transferOwnership(bagId, to, notes)`
Transfers bag ownership between participants (Blood Bank → Transporter → Hospital).

### `recordTemperature(bagId, temperature)`
Records temperature reading. **Critical Logic**: Automatically flags bag as "SPOILED" if temperature is outside **2°C - 6°C** range.

### `getBagHistory(bagId)`
Returns complete history including bag details, temperature records, and ownership transfers.

## 📁 Project Structure

```
blood-cold-chain/
├── contracts/
│   └── BloodColdChain.sol      # Main smart contract
├── test/
│   └── BloodColdChain.test.js  # Comprehensive test suite
├── scripts/
│   └── deploy.js               # Deployment script
├── frontend/
│   └── index.html              # Web UI (ethers.js + TailwindCSS)
├── backend/
│   └── server.js               # Express.js API server
├── iot-simulator/
│   └── simulator.js            # IoT temperature sensor simulator
├── hardhat.config.js           # Hardhat configuration
├── package.json                # Dependencies
└── README.md                   # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone or navigate to project directory
cd blood-cold-chain

# Install dependencies
npm install
```

### Compile Smart Contract

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

Expected output: All 25+ test scenarios pass ✅

### Start Local Blockchain

```bash
# Terminal 1: Start Hardhat node
npx hardhat node
```

### Deploy Contract

```bash
# Terminal 2: Deploy to local network
npx hardhat run scripts/deploy.js --network localhost
```

Copy the contract address and update `.env`:
```
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Start Backend Server

```bash
# Terminal 3: Start Express server
node backend/server.js
```

### Start IoT Simulator (Optional)

```bash
# Terminal 4: Start IoT simulator
node iot-simulator/simulator.js
```

### Access Web UI

Open http://localhost:3000 in your browser.

## 🧪 Test Scenarios

The test suite covers:

1. **Deployment Tests**
   - Admin setup
   - Temperature thresholds

2. **Participant Management**
   - Registration
   - Activation/Deactivation
   - Access control

3. **Blood Donation Registration**
   - Valid registration
   - Duplicate prevention
   - Role-based access

4. **Ownership Transfer**
   - Valid transfers
   - Status updates
   - History tracking

5. **Temperature Recording**
   - Normal temperatures (2-6°C)
   - Cold breach (<2°C) → SPOILED
   - Hot breach (>6°C) → SPOILED
   - Boundary testing

6. **End-to-End Scenario**
   - Complete "Spoiled Bag" demonstration

## 📊 Demo: Spoiled Bag Scenario

```javascript
// Step 1: Register donation at Kizilay
registerDonation("BAG-001", O_NEGATIVE, 42 days)

// Step 2: Transfer to transporter
transferOwnership("BAG-001", transporterAddress, "Delivery to hospital")

// Step 3: Normal temperature readings
recordTemperature("BAG-001", 4.0°C)  // ✅ Safe
recordTemperature("BAG-001", 4.5°C)  // ✅ Safe

// Step 4: Truck breakdown - Temperature breach!
recordTemperature("BAG-001", 12.0°C) // 🚨 SPOILED!

// Step 5: Hospital verifies - Bag is unsafe
getBagHistory("BAG-001") → Status: SPOILED
isBagSafe("BAG-001") → false, "Bag is spoiled due to temperature breach"
```

## 🔐 Security Features

- **Role-based Access Control**: Only authorized participants can perform actions
- **Immutable Records**: All data stored on blockchain cannot be altered
- **Automatic Spoilage Detection**: Smart contract logic, not human judgment
- **Complete Audit Trail**: Every action is timestamped and recorded

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bags` | Get all blood bags |
| GET | `/api/bags/:id` | Get single bag details |
| GET | `/api/bags/:id/history` | Get complete bag history |
| POST | `/api/bags/register` | Register new donation |
| POST | `/api/bags/:id/transfer` | Transfer ownership |
| POST | `/api/bags/:id/temperature` | Record temperature |
| GET | `/api/stats` | Get dashboard statistics |
| POST | `/api/demo/spoiled-bag` | Run demo scenario |

## 📈 Work Package Summary

| WP | Name | Status | Contribution |
|----|------|--------|--------------|
| 1 | Analysis, Setup & Architecture | ✅ Complete | 15% |
| 2 | Smart Contract Development | ✅ Complete | 20% |
| 3 | Smart Contract Testing | ✅ Complete | 20% |
| 4 | Interface & Integration | ✅ Complete | 30% |
| 5 | Final Simulation & Reporting | ✅ Ready | 15% |

## 👨‍💻 Authors

- **Yusuf Emre Elmali** - Smart Contract Development, Testing
- **Hasan Demiryurek** - UI/UX, Backend, IoT Integration

## 📄 License

MIT License

---

<p align="center">
  Built with ❤️ for Blood Safety
</p>
