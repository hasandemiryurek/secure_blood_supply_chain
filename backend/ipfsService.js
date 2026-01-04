/**
 * IPFS Service for Blood Cold Chain
 * Handles file upload/download to IPFS using different providers
 * Supports: Pinata, Infura IPFS, Local IPFS node, NFT.Storage
 */

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");
const crypto = require("crypto");

class IPFSService {
    constructor(config = {}) {
        this.provider = config.provider || "pinata"; 
        
        this.config = config;
        
        // Encryption key (in production, use environment variable)
        this.encryptionKey = process.env.IPFS_ENCRYPTION_KEY || "blood-chain-default-encryption-key-change-in-production";
        
        // Gateway URLs for fetching content
        this.gateways = {
            pinata: "https://gateway.pinata.cloud/ipfs/",
            infura: "https://ipfs.infura.io/ipfs/",
            cloudflare: "https://cloudflare-ipfs.com/ipfs/",
            dweb: "https://dweb.link/ipfs/",
            local: "http://localhost:8080/ipfs/"
        };
    }

    /**
     * Encrypt file content using AES-256
     * @param {Buffer} fileContent - File buffer to encrypt
     * @returns {Buffer} Encrypted buffer
     */
    encryptFile(fileContent) {
        const encrypted = CryptoJS.AES.encrypt(
            fileContent.toString('base64'),
            this.encryptionKey
        ).toString();
        return Buffer.from(encrypted);
    }

    /**
     * Decrypt file content
     * @param {Buffer} encryptedContent - Encrypted buffer
     * @returns {Buffer} Decrypted buffer
     */
    decryptFile(encryptedContent) {
        const decrypted = CryptoJS.AES.decrypt(
            encryptedContent.toString(),
            this.encryptionKey
        );
        const base64String = decrypted.toString(CryptoJS.enc.Utf8);
        return Buffer.from(base64String, 'base64');
    }

    /**
     * Upload a file to IPFS (with optional encryption)
     * @param {Buffer|string} fileContent - File content as buffer or file path
     * @param {string} fileName - Name of the file
     * @param {Object} metadata - Optional metadata for the file
     * @param {boolean} encrypt - Whether to encrypt the file (default: true)
     * @returns {Promise<{hash: string, url: string, encrypted: boolean}>}
     */
    async uploadFile(fileContent, fileName, metadata = {}, encrypt = true) {
        // Encrypt file if requested
        if (encrypt && Buffer.isBuffer(fileContent)) {
            console.log(`🔒 Encrypting file: ${fileName}`);
            fileContent = this.encryptFile(fileContent);
            fileName = fileName + '.encrypted';
        }

        let result;
        switch (this.provider) {
            case "pinata":
                result = await this.uploadToPinata(fileContent, fileName, metadata);
                break;
            case "infura":
                result = await this.uploadToInfura(fileContent, fileName);
                break;
            case "nft.storage":
                result = await this.uploadToNFTStorage(fileContent, fileName, metadata);
                break;
            case "local":
                result = await this.uploadToLocal(fileContent, fileName);
                break;
            default:
                throw new Error(`Unknown IPFS provider: ${this.provider}`);
        }

        return {
            ...result,
            encrypted: encrypt
        };
    }

    /**
     * Get and decrypt file from IPFS
     * @param {string} hash - IPFS hash
     * @param {string} gateway - Gateway to use
     * @param {boolean} encrypted - Whether file is encrypted
     * @returns {Promise<Buffer>} Decrypted file content
     */
    async getFile(hash, gateway = "cloudflare", encrypted = true) {
        const content = await this.getContent(hash, gateway);
        
        if (encrypted) {
            console.log(`🔓 Decrypting file from IPFS: ${hash}`);
            return this.decryptFile(content);
        }
        
        return content;
    }

    /**
     * Upload JSON metadata to IPFS
     * @param {Object} jsonData - JSON object to upload
     * @param {string} name - Optional name for the JSON file
     * @returns {Promise<{hash: string, url: string}>}
     */
    async uploadJSON(jsonData, name = "metadata.json") {
        const jsonString = JSON.stringify(jsonData, null, 2);
        const buffer = Buffer.from(jsonString, "utf-8");
        return this.uploadFile(buffer, name, { contentType: "application/json" });
    }

    /**
     * Upload to Pinata (Recommended for production)
     * Requires PINATA_API_KEY and PINATA_SECRET_KEY in .env
     */
    async uploadToPinata(fileContent, fileName, metadata = {}) {
        const apiKey = this.config.pinataApiKey || process.env.PINATA_API_KEY;
        const secretKey = this.config.pinataSecretKey || process.env.PINATA_SECRET_KEY;

        if (!apiKey || !secretKey) {
            throw new Error("Pinata API credentials not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY in .env");
        }

        const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
        const formData = new FormData();

        // Handle both buffer and file path
        const buffer = typeof fileContent === "string" 
            ? fs.readFileSync(fileContent) 
            : fileContent;

        formData.append("file", buffer, { filename: fileName });

        // Add metadata
        const pinataMetadata = JSON.stringify({
            name: fileName,
            keyvalues: {
                project: "BloodColdChain",
                type: metadata.documentType || "document",
                bagId: metadata.bagId || "",
                uploadedAt: new Date().toISOString()
            }
        });
        formData.append("pinataMetadata", pinataMetadata);

        // Pin options
        const pinataOptions = JSON.stringify({
            cidVersion: 1
        });
        formData.append("pinataOptions", pinataOptions);

        try {
            const response = await axios.post(url, formData, {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    ...formData.getHeaders(),
                    "pinata_api_key": apiKey,
                    "pinata_secret_api_key": secretKey
                }
            });

            return {
                hash: response.data.IpfsHash,
                url: `${this.gateways.pinata}${response.data.IpfsHash}`,
                size: response.data.PinSize,
                timestamp: response.data.Timestamp
            };
        } catch (error) {
            throw new Error(`Pinata upload failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Upload to Infura IPFS
     * Requires INFURA_PROJECT_ID and INFURA_PROJECT_SECRET in .env
     */
    async uploadToInfura(fileContent, fileName) {
        const projectId = this.config.infuraProjectId || process.env.INFURA_PROJECT_ID;
        const projectSecret = this.config.infuraProjectSecret || process.env.INFURA_PROJECT_SECRET;

        if (!projectId || !projectSecret) {
            throw new Error("Infura credentials not configured. Set INFURA_PROJECT_ID and INFURA_PROJECT_SECRET in .env");
        }

        const formData = new FormData();
        const buffer = typeof fileContent === "string" 
            ? fs.readFileSync(fileContent) 
            : fileContent;

        formData.append("file", buffer, { filename: fileName });

        const auth = Buffer.from(`${projectId}:${projectSecret}`).toString("base64");

        try {
            const response = await axios.post(
                "https://ipfs.infura.io:5001/api/v0/add",
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        "Authorization": `Basic ${auth}`
                    }
                }
            );

            return {
                hash: response.data.Hash,
                url: `${this.gateways.infura}${response.data.Hash}`,
                size: parseInt(response.data.Size),
                name: response.data.Name
            };
        } catch (error) {
            throw new Error(`Infura upload failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Upload to NFT.Storage (Free, great for NFTs and metadata)
     * Requires NFT_STORAGE_KEY in .env
     */
    async uploadToNFTStorage(fileContent, fileName, metadata = {}) {
        const apiKey = this.config.nftStorageKey || process.env.NFT_STORAGE_KEY;

        if (!apiKey) {
            throw new Error("NFT.Storage API key not configured. Set NFT_STORAGE_KEY in .env");
        }

        const buffer = typeof fileContent === "string" 
            ? fs.readFileSync(fileContent) 
            : fileContent;

        try {
            const response = await axios.post(
                "https://api.nft.storage/upload",
                buffer,
                {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/octet-stream"
                    }
                }
            );

            return {
                hash: response.data.value.cid,
                url: `https://${response.data.value.cid}.ipfs.nftstorage.link`,
                created: response.data.value.created
            };
        } catch (error) {
            throw new Error(`NFT.Storage upload failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Upload to local IPFS node
     * Requires local IPFS daemon running on port 5001
     */
    async uploadToLocal(fileContent, fileName) {
        const apiUrl = this.config.localApiUrl || "http://localhost:5001";

        const formData = new FormData();
        const buffer = typeof fileContent === "string" 
            ? fs.readFileSync(fileContent) 
            : fileContent;

        formData.append("file", buffer, { filename: fileName });

        try {
            const response = await axios.post(
                `${apiUrl}/api/v0/add`,
                formData,
                {
                    headers: formData.getHeaders()
                }
            );

            return {
                hash: response.data.Hash,
                url: `${this.gateways.local}${response.data.Hash}`,
                size: parseInt(response.data.Size),
                name: response.data.Name
            };
        } catch (error) {
            throw new Error(`Local IPFS upload failed: ${error.message}. Is the IPFS daemon running?`);
        }
    }

    /**
     * Get content from IPFS by hash
     * @param {string} hash - IPFS CID/hash
     * @param {string} gateway - Preferred gateway (optional)
     * @returns {Promise<Buffer>}
     */
    async getContent(hash, gateway = "cloudflare") {
        const gatewayUrl = this.gateways[gateway] || this.gateways.cloudflare;
        
        try {
            const response = await axios.get(`${gatewayUrl}${hash}`, {
                responseType: "arraybuffer",
                timeout: 30000
            });
            return Buffer.from(response.data);
        } catch (error) {
            // Try alternative gateway
            if (gateway !== "dweb") {
                console.log(`Gateway ${gateway} failed, trying dweb...`);
                return this.getContent(hash, "dweb");
            }
            throw new Error(`Failed to fetch from IPFS: ${error.message}`);
        }
    }

    /**
     * Get JSON content from IPFS
     * @param {string} hash - IPFS CID/hash
     * @returns {Promise<Object>}
     */
    async getJSON(hash, gateway = "cloudflare") {
        const content = await this.getContent(hash, gateway);
        return JSON.parse(content.toString("utf-8"));
    }

    /**
     * Get the IPFS gateway URL for a hash
     * @param {string} hash - IPFS CID/hash
     * @param {string} gateway - Gateway name
     * @returns {string}
     */
    getGatewayUrl(hash, gateway = "pinata") {
        const gatewayUrl = this.gateways[gateway] || this.gateways.pinata;
        return `${gatewayUrl}${hash}`;
    }

    /**
     * Create blood bag metadata for IPFS storage
     * @param {Object} bagData - Blood bag data
     * @returns {Object} - Structured metadata
     */
    createBloodBagMetadata(bagData) {
        return {
            name: `Blood Bag ${bagData.bagId}`,
            description: "Blood Cold Chain - Blockchain tracked blood bag",
            version: "1.0",
            created: new Date().toISOString(),
            bloodBag: {
                id: bagData.bagId,
                bloodType: bagData.bloodType,
                donationDate: bagData.donationDate,
                expiryDate: bagData.expiryDate,
                donor: bagData.donor || null
            },
            testResults: bagData.testResults || [],
            certificates: bagData.certificates || [],
            images: bagData.images || [],
            metadata: {
                project: "BloodColdChain",
                blockchain: "Ethereum",
                standard: "ERC-721 compatible"
            }
        };
    }

    /**
     * Check if IPFS service is configured
     * @returns {Object} - Configuration status
     */
    checkConfiguration() {
        const status = {
            provider: this.provider,
            configured: false,
            message: ""
        };

        switch (this.provider) {
            case "pinata":
                if (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY) {
                    status.configured = true;
                    status.message = "Pinata is configured";
                } else {
                    status.message = "Missing PINATA_API_KEY or PINATA_SECRET_KEY";
                }
                break;
            case "infura":
                if (process.env.INFURA_PROJECT_ID && process.env.INFURA_PROJECT_SECRET) {
                    status.configured = true;
                    status.message = "Infura IPFS is configured";
                } else {
                    status.message = "Missing INFURA_PROJECT_ID or INFURA_PROJECT_SECRET";
                }
                break;
            case "nft.storage":
                if (process.env.NFT_STORAGE_KEY) {
                    status.configured = true;
                    status.message = "NFT.Storage is configured";
                } else {
                    status.message = "Missing NFT_STORAGE_KEY";
                }
                break;
            case "local":
                status.configured = true;
                status.message = "Using local IPFS node (ensure daemon is running)";
                break;
        }

        return status;
    }
}

// Singleton instance
let ipfsInstance = null;

function getIPFSService(config = {}) {
    if (!ipfsInstance) {
        const provider = config.provider || process.env.IPFS_PROVIDER || "pinata";
        ipfsInstance = new IPFSService({ ...config, provider });
    }
    return ipfsInstance;
}

module.exports = { IPFSService, getIPFSService };
