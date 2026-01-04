/**
 * Blood Cold Chain Backend Server
 * Express.js server for serving frontend and providing API endpoints
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");
const multer = require("multer");
const { getIPFSService } = require("./ipfsService");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const JWT_SECRET = process.env.JWT_SECRET || "blood-chain-secret-key-change-in-production";
const SALT_ROUNDS = 10;

// Hashed passwords (in production, store in database)
const HASHED_PASSWORDS = {
    "0": "$2a$10$xYZ123...", // Will be set below
    "1": "$2a$10$xYZ123...",
    "2": "$2a$10$xYZ123...",
    "3": "$2a$10$xYZ123...",
    "4": "$2a$10$xYZ123..."
};

// Initialize hashed passwords
async function initPasswords() {
    HASHED_PASSWORDS["0"] = await bcrypt.hash("admin123", SALT_ROUNDS);
    HASHED_PASSWORDS["1"] = await bcrypt.hash("kizilay123", SALT_ROUNDS);
    HASHED_PASSWORDS["2"] = await bcrypt.hash("dhl123", SALT_ROUNDS);
    HASHED_PASSWORDS["3"] = await bcrypt.hash("hospital123", SALT_ROUNDS);
}

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allowed file types
        const allowedTypes = /jpeg|jpg|png|pdf|json|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error("Invalid file type. Allowed: JPEG, PNG, PDF, JSON, DOC, DOCX"));
    }
});

// Rate limiting - disabled for development
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // High limit for dev
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // High limit for dev
    message: { error: "Too many login attempts, please try again later." },
    skipSuccessfulRequests: true
});

// Initialize IPFS service
const ipfsService = getIPFSService();

// Contract ABI for BloodColdChainV2
const CONTRACT_ABI = [
    // Core functions
    "function register(string calldata id, uint8 bloodType, uint256 expiryDays, string calldata ipfs) external",
    "function transfer(string calldata id, address to, string calldata notes) external",
    "function recordTemp(string calldata id, int256 temp) external",
    // View functions
    "function getBag(string calldata id) external view returns (tuple(string bagId, address owner, uint40 donationDate, uint40 expiryDate, uint8 bloodType, uint8 status, bool exists, string ipfsHash))",
    "function getHistory(string calldata id) external view returns (tuple(string bagId, address owner, uint40 donationDate, uint40 expiryDate, uint8 bloodType, uint8 status, bool exists, string ipfsHash), tuple(int256 temp, uint40 timestamp, address recorder, bool inRange)[], tuple(address from, address to, uint40 timestamp, string notes)[])",
    "function getAllBags() external view returns (string[] memory)",
    "function totalBags() external view returns (uint256)",
    "function isSafe(string calldata id) external view returns (bool safe, string memory reason)",
    "function getParticipant(address a) external view returns (tuple(string name, uint8 role, bool active))",
    "function getAllParticipants() external view returns (address[] memory)",
    // Admin functions
    "function addParticipant(address addr, string calldata name, uint8 role) external",
    "function setParticipantActive(address addr, bool active_) external",
    // IPFS functions
    "function addDoc(string calldata id, string calldata hash, string calldata docType) external",
    "function updateIPFS(string calldata id, string calldata hash) external",
    "function getDocs(string calldata id) external view returns (tuple(string hash, string docType, uint40 timestamp, address uploader)[])",
    // Emergency
    "function pause() external",
    "function unpause() external",
    "function paused() external view returns (bool)",
    "function emergencyMark(string calldata id, string calldata reason) external",
    "event Alert(string alertType, address indexed actor, string details, uint256 timestamp)"
];

// Middleware
const corsOptions = {
    origin: true, // Allow all origins in development
    credentials: true,
    optionsSuccessStatus: 200
};

// Helmet disabled for development - enable in production with proper CSP
// app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Apply rate limiting to API routes
app.use("/api/", apiLimiter);

// Redirect root to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ============ Authentication Middleware ============

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: "Access token required" });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
        req.user = user;
        next();
    });
}

// Provider and contract
let provider;
let contract;
let signers = {};

// Initialize connection
async function initializeConnection() {
    try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        
        // Get all accounts from Hardhat node
        const accounts = await provider.listAccounts();
        
        if (accounts.length >= 5) {
            signers.admin = await provider.getSigner(0);
            signers.bloodBank = await provider.getSigner(1);
            signers.transporter = await provider.getSigner(2);
            signers.hospital = await provider.getSigner(3);
            signers.iotSensor = await provider.getSigner(4);
        }

        // Initialize contract if address is set
        if (process.env.CONTRACT_ADDRESS) {
            contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, signers.admin);
            console.log("✅ Contract connected:", process.env.CONTRACT_ADDRESS);
        } else {
            console.log("⚠️ CONTRACT_ADDRESS not set in .env");
        }

        console.log("✅ Connected to Hardhat node:", RPC_URL);
    } catch (error) {
        console.error("❌ Failed to connect:", error.message);
    }
}

// API Routes

// ============ Authentication Routes ============

// Login endpoint (rate limiter disabled for development)
app.post("/api/auth/login", async (req, res) => {
    try {
        const { accountIndex, password } = req.body;
        
        if (accountIndex === undefined || !password) {
            return res.status(400).json({ error: "Account index and password required" });
        }
        
        const hashedPassword = HASHED_PASSWORDS[accountIndex.toString()];
        if (!hashedPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const isValid = await bcrypt.compare(password, hashedPassword);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { accountIndex: accountIndex.toString() },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token,
            accountIndex,
            expiresIn: '24h'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify token endpoint
app.get("/api/auth/verify", authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============ Contract Routes ============

// API Routes

// Get contract address
app.get("/api/contract-address", (req, res) => {
    res.json({ address: process.env.CONTRACT_ADDRESS || null });
});

// Get accounts
app.get("/api/accounts", async (req, res) => {
    try {
        const accounts = await provider.listAccounts();
        const result = {
            admin: accounts[0] ? await accounts[0].getAddress() : null,
            bloodBank: accounts[1] ? await accounts[1].getAddress() : null,
            transporter: accounts[2] ? await accounts[2].getAddress() : null,
            hospital: accounts[3] ? await accounts[3].getAddress() : null,
            iotSensor: accounts[4] ? await accounts[4].getAddress() : null
        };
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all blood bags
app.get("/api/bags", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const bagIds = await contract.getAllBags();
        const bags = [];

        for (const bagId of bagIds) {
            const bag = await contract.getBag(bagId);
            const [isSafe, reason] = await contract.isSafe(bagId);
            bags.push({
                bagId: bag.bagId,
                bloodType: Number(bag.bloodType),
                donationDate: Number(bag.donationDate),
                expiryDate: Number(bag.expiryDate),
                currentOwner: bag.owner,
                status: Number(bag.status),
                isSafe,
                safetyReason: reason
            });
        }

        res.json(bags);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single blood bag
app.get("/api/bags/:bagId", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const bag = await contract.getBag(bagId);
        const [isSafe, reason] = await contract.isSafe(bagId);

        res.json({
            bagId: bag.bagId,
            bloodType: Number(bag.bloodType),
            donationDate: Number(bag.donationDate),
            expiryDate: Number(bag.expiryDate),
            currentOwner: bag.owner,
            status: Number(bag.status),
            isSafe,
            safetyReason: reason
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get bag history
app.get("/api/bags/:bagId/history", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const [bag, temps, transfers] = await contract.getHistory(bagId);

        res.json({
            bag: {
                bagId: bag.bagId,
                bloodType: Number(bag.bloodType),
                donationDate: Number(bag.donationDate),
                expiryDate: Number(bag.expiryDate),
                currentOwner: bag.owner,
                status: Number(bag.status)
            },
            temperatureHistory: temps.map(t => ({
                temperature: Number(t.temp) / 100,
                timestamp: Number(t.timestamp),
                recordedBy: t.recorder,
                isWithinRange: t.inRange
            })),
            ownershipHistory: transfers.map(t => ({
                from: t.from,
                to: t.to,
                timestamp: Number(t.timestamp),
                notes: t.notes
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register donation (via backend with blood bank signer)
app.post("/api/bags/register", async (req, res) => {
    try {
        if (!contract || !signers.bloodBank) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId, bloodType, expiryDays, ipfsHash } = req.body;
        
        const contractWithSigner = contract.connect(signers.bloodBank);
        const tx = await contractWithSigner.register(bagId, bloodType, expiryDays, ipfsHash || "");
        await tx.wait();

        res.json({ 
            success: true, 
            message: `Donation ${bagId} registered`,
            txHash: tx.hash
        });
    } catch (error) {
        res.status(500).json({ error: error.reason || error.message });
    }
});

// Transfer ownership
app.post("/api/bags/:bagId/transfer", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const { from, to, notes } = req.body;

        // Get the appropriate signer
        let signer;
        const bloodBankAddr = await signers.bloodBank.getAddress();
        const transporterAddr = await signers.transporter.getAddress();

        if (from.toLowerCase() === bloodBankAddr.toLowerCase()) {
            signer = signers.bloodBank;
        } else if (from.toLowerCase() === transporterAddr.toLowerCase()) {
            signer = signers.transporter;
        } else {
            return res.status(400).json({ error: "Invalid 'from' address" });
        }

        const contractWithSigner = contract.connect(signer);
        const tx = await contractWithSigner.transferOwnership(bagId, to, notes);
        await tx.wait();

        res.json({ 
            success: true, 
            message: `Ownership transferred`,
            txHash: tx.hash
        });
    } catch (error) {
        res.status(500).json({ error: error.reason || error.message });
    }
});

// Record temperature
app.post("/api/bags/:bagId/temperature", async (req, res) => {
    try {
        if (!contract || !signers.iotSensor) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const { temperature } = req.body;

        // Convert to contract format (multiply by 100)
        const tempContract = Math.round(temperature * 100);

        const contractWithSigner = contract.connect(signers.iotSensor);
        const tx = await contractWithSigner.recordTemperature(bagId, tempContract);
        await tx.wait();

        const isWithinRange = temperature >= 2 && temperature <= 6;

        res.json({ 
            success: true, 
            message: isWithinRange ? "Temperature recorded (Safe)" : "TEMPERATURE BREACH - Bag spoiled!",
            isWithinRange,
            txHash: tx.hash
        });
    } catch (error) {
        res.status(500).json({ error: error.reason || error.message });
    }
});

// Get statistics
app.get("/api/stats", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const bagIds = await contract.getAllBags();
        const stats = {
            total: bagIds.length,
            registered: 0,
            inTransit: 0,
            delivered: 0,
            spoiled: 0
        };

        for (const bagId of bagIds) {
            const bag = await contract.getBag(bagId);
            const status = Number(bag.status);
            
            switch (status) {
                case 0: stats.registered++; break;
                case 1: stats.inTransit++; break;
                case 2: stats.delivered++; break;
                case 3: stats.spoiled++; break;
            }
        }

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get participants
app.get("/api/participants", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const addresses = await contract.getAllParticipants();
        const participants = [];

        for (const addr of addresses) {
            const participant = await contract.getParticipant(addr);
            participants.push({
                address: addr,
                name: participant.name,
                role: Number(participant.role),
                isActive: participant.active
            });
        }

        res.json(participants);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Demo scenario endpoint
app.post("/api/demo/spoiled-bag", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const bagId = `DEMO-${Date.now()}`;
        const steps = [];

        // Step 1: Register donation (with empty IPFS hash for demo)
        const contractBloodBank = contract.connect(signers.bloodBank);
        let tx = await contractBloodBank.register(bagId, 7, 42, ""); // O-
        await tx.wait();
        steps.push({ step: 1, action: "Registered donation", bagId, txHash: tx.hash });

        // Step 2: Transfer to transporter
        const transporterAddr = await signers.transporter.getAddress();
        tx = await contractBloodBank.transfer(bagId, transporterAddr, "Handover for delivery");
        await tx.wait();
        steps.push({ step: 2, action: "Transferred to transporter", txHash: tx.hash });

        // Step 3: Record normal temperatures
        const contractIoT = contract.connect(signers.iotSensor);
        tx = await contractIoT.recordTemp(bagId, 400); // 4°C
        await tx.wait();
        steps.push({ step: 3, action: "Temperature recorded: 4°C (Safe)", txHash: tx.hash });

        tx = await contractIoT.recordTemp(bagId, 450); // 4.5°C
        await tx.wait();
        steps.push({ step: 4, action: "Temperature recorded: 4.5°C (Safe)", txHash: tx.hash });

        // Step 5: Temperature breach!
        tx = await contractIoT.recordTemp(bagId, 1200); // 12°C - BREACH!
        await tx.wait();
        steps.push({ step: 5, action: "⚠️ TEMPERATURE BREACH: 12°C - BAG SPOILED!", txHash: tx.hash });

        // Get final state
        const [bag, temps, transfers] = await contract.getHistory(bagId);

        res.json({
            success: true,
            message: "Demo scenario completed - Bag is now SPOILED",
            bagId,
            steps,
            finalState: {
                status: "SPOILED",
                temperatureRecords: temps.length,
                ownershipTransfers: transfers.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.reason || error.message });
    }
});

// Serve frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ============ IPFS API Endpoints ============

// Check IPFS configuration status
app.get("/api/ipfs/status", (req, res) => {
    const status = ipfsService.checkConfiguration();
    res.json(status);
});

// Upload file to IPFS
app.post("/api/ipfs/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
        }

        const { bagId, documentType } = req.body;
        
        const result = await ipfsService.uploadFile(
            req.file.buffer,
            req.file.originalname,
            { bagId, documentType: documentType || "document" }
        );

        res.json({
            success: true,
            hash: result.hash,
            url: result.url,
            size: result.size,
            fileName: req.file.originalname
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload JSON metadata to IPFS
app.post("/api/ipfs/upload-json", async (req, res) => {
    try {
        const { data, name } = req.body;
        
        if (!data) {
            return res.status(400).json({ error: "No data provided" });
        }

        const result = await ipfsService.uploadJSON(data, name || "metadata.json");

        res.json({
            success: true,
            hash: result.hash,
            url: result.url
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload blood bag metadata to IPFS
app.post("/api/ipfs/upload-bag-metadata", async (req, res) => {
    try {
        const bagData = req.body;
        
        if (!bagData || !bagData.bagId) {
            return res.status(400).json({ error: "Bag data with bagId is required" });
        }

        const metadata = ipfsService.createBloodBagMetadata(bagData);
        const result = await ipfsService.uploadJSON(metadata, `bag-${bagData.bagId}.json`);

        res.json({
            success: true,
            hash: result.hash,
            url: result.url,
            metadata
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get content from IPFS
app.get("/api/ipfs/content/:hash", async (req, res) => {
    try {
        const { hash } = req.params;
        const { gateway } = req.query;
        
        const content = await ipfsService.getContent(hash, gateway || "cloudflare");
        
        res.set("Content-Type", "application/octet-stream");
        res.send(content);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get JSON from IPFS
app.get("/api/ipfs/json/:hash", async (req, res) => {
    try {
        const { hash } = req.params;
        const { gateway } = req.query;
        
        const data = await ipfsService.getJSON(hash, gateway || "cloudflare");
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get gateway URL for hash
app.get("/api/ipfs/gateway/:hash", (req, res) => {
    const { hash } = req.params;
    const { gateway } = req.query;
    
    const url = ipfsService.getGatewayUrl(hash, gateway || "cloudflare");
    res.json({ hash, url });
});

// Add IPFS document to blood bag on blockchain
app.post("/api/bags/:bagId/ipfs-document", async (req, res) => {
    try {
        if (!contract || !signers.bloodBank) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const { ipfsHash, documentType, signer } = req.body;

        if (!ipfsHash || !documentType) {
            return res.status(400).json({ error: "ipfsHash and documentType are required" });
        }

        // Determine which signer to use
        let contractSigner;
        switch (signer) {
            case "bloodBank":
                contractSigner = signers.bloodBank;
                break;
            case "transporter":
                contractSigner = signers.transporter;
                break;
            case "hospital":
                contractSigner = signers.hospital;
                break;
            case "iotSensor":
                contractSigner = signers.iotSensor;
                break;
            default:
                contractSigner = signers.bloodBank;
        }

        const contractWithSigner = contract.connect(contractSigner);
        const tx = await contractWithSigner.addDoc(bagId, ipfsHash, documentType);
        await tx.wait();

        res.json({
            success: true,
            message: `IPFS document added to ${bagId}`,
            txHash: tx.hash,
            ipfsHash,
            documentType
        });
    } catch (error) {
        res.status(500).json({ error: error.reason || error.message });
    }
});

// Get IPFS documents for a blood bag
app.get("/api/bags/:bagId/ipfs-documents", async (req, res) => {
    try {
        if (!contract) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        const { bagId } = req.params;
        const documents = await contract.getDocs(bagId);

        const formattedDocs = documents.map(doc => ({
            ipfsHash: doc.hash,
            documentType: doc.docType,
            timestamp: Number(doc.timestamp),
            uploadedBy: doc.uploader,
            url: ipfsService.getGatewayUrl(doc.hash)
        }));

        res.json(formattedDocs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload file and add to blockchain in one step
app.post("/api/bags/:bagId/upload-document", upload.single("file"), async (req, res) => {
    try {
        if (!contract || !signers.bloodBank) {
            return res.status(400).json({ error: "Contract not initialized" });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
        }

        const { bagId } = req.params;
        const { documentType, signer } = req.body;

        // 1. Upload to IPFS
        const ipfsResult = await ipfsService.uploadFile(
            req.file.buffer,
            req.file.originalname,
            { bagId, documentType: documentType || "document" }
        );

        // 2. Add to blockchain
        let contractSigner = signers[signer] || signers.bloodBank;
        const contractWithSigner = contract.connect(contractSigner);
        const tx = await contractWithSigner.addDoc(bagId, ipfsResult.hash, documentType || "document");
        await tx.wait();

        res.json({
            success: true,
            message: `Document uploaded and recorded on blockchain`,
            ipfs: {
                hash: ipfsResult.hash,
                url: ipfsResult.url,
                size: ipfsResult.size
            },
            blockchain: {
                txHash: tx.hash,
                bagId,
                documentType
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, async () => {
    console.log("");
    console.log("🏥 Blood Cold Chain Backend Server");
    console.log("=".repeat(50));
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log(`📁 Frontend served at: http://localhost:${PORT}`);
    console.log("");
    
    // Initialize hashed passwords
    await initPasswords();
    console.log("🔐 Password hashing initialized");
    
    await initializeConnection();
    
    // Check IPFS configuration
    const ipfsStatus = ipfsService.checkConfiguration();
    console.log("");
    console.log("📦 IPFS Status:");
    console.log(`   Provider: ${ipfsStatus.provider}`);
    console.log(`   Configured: ${ipfsStatus.configured ? "✅ Yes" : "❌ No"}`);
    console.log(`   ${ipfsStatus.message}`);
    
    console.log("");
    console.log("📌 API Endpoints:");
    console.log("   GET  /api/contract-address - Get contract address");
    console.log("   GET  /api/accounts - Get all account addresses");
    console.log("   GET  /api/bags - Get all blood bags");
    console.log("   GET  /api/bags/:id - Get single bag");
    console.log("   GET  /api/bags/:id/history - Get bag history");
    console.log("   POST /api/bags/register - Register new donation");
    console.log("   POST /api/bags/:id/transfer - Transfer ownership");
    console.log("   POST /api/bags/:id/temperature - Record temperature");
    console.log("   GET  /api/stats - Get statistics");
    console.log("   GET  /api/participants - Get all participants");
    console.log("   POST /api/demo/spoiled-bag - Run demo scenario");
    console.log("");
    console.log("📦 IPFS Endpoints:");
    console.log("   GET  /api/ipfs/status - Check IPFS configuration");
    console.log("   POST /api/ipfs/upload - Upload file to IPFS");
    console.log("   POST /api/ipfs/upload-json - Upload JSON to IPFS");
    console.log("   POST /api/ipfs/upload-bag-metadata - Upload bag metadata");
    console.log("   GET  /api/ipfs/content/:hash - Get content from IPFS");
    console.log("   GET  /api/ipfs/json/:hash - Get JSON from IPFS");
    console.log("   POST /api/bags/:id/ipfs-document - Add IPFS doc to blockchain");
    console.log("   GET  /api/bags/:id/ipfs-documents - Get IPFS docs for bag");
    console.log("   POST /api/bags/:id/upload-document - Upload & record in one step");
    console.log("=".repeat(50));
});
