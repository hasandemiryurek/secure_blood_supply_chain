# Blood Cold Chain
Blockchain-based blood cold chain management system. Tracks safe storage and transportation of blood products using smart contracts.
This project tracks the entire lifecycle of blood products (erythrocytes, plasma, platelets, etc.) on the Ethereum blockchain.

### Key Features
- **Blockchain Records** - All data is stored immutably on the blockchain
- **Automatic Temperature Monitoring** - IoT sensor data is recorded in real-time
- **Smart Spoilage Detection** - Blood outside +2C to +6C range is automatically marked as "Spoiled"
- **IPFS Integration** - Documents are stored in a decentralized file system
- **Role-Based Access** - Each user can only perform authorized operations

## Tech Stack
| Technology | Version |
|------------|---------|
| Solidity | 0.8.20 |
| Hardhat | 2.19.0 |
| ethers.js | 6.9.0 |
| Node.js | 18+ |
| Docker | - |

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | System management, add users |
| **Blood Bank** | Register blood bags, read temperature |
| **Transporter** | Transport operations, record temperature |
| **Hospital** | Accept blood, record usage |

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (optional)

### 1. Install Dependencies
```bash
npm install
```
### 2. Environment File
Create a `.env` file:
```env
PORT=3000
RPC_URL=http://localhost:8545
JWT_SECRET=your-secret-key
PINATA_API_KEY=your-pinata-key
PINATA_SECRET=your-pinata-secret
```
### With Docker (Recommended)
```bash
docker-compose up --build
```
This starts the following services:
- **Hardhat Node** - localhost:8545
- **Backend API** - localhost:3000
- **IoT Simulator** - Sends automatic temperature data
### Manual Setup
**Terminal 1 - Blockchain Node:**
```bash
npm run node
```

**Terminal 2 - Deploy & Server:**
```bash
npm run deploy
npm run server
```

**Terminal 3 - IoT Simulator (optional):**
```bash
npm run iot
```
## Testing
```bash
npm test
```
## Project Structure
```
contracts/           # Solidity smart contracts
   BloodColdChainV2.sol
   libraries/
backend/             # Express.js API
frontend/            # Web interface
iot-simulator/       # Temperature simulator
scripts/             # Deploy scripts
test/                # Test files
```
## Authors
- Yusuf Emre Elmali
- Hasan Demiryurek

## License
MIT
