/**
 * Blood Cold Chain - Main Application JavaScript
 * Modular and optimized version
 */

// ============ Constants ============
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const STATUS_CLASSES = ["status-registered", "status-in-transit", "status-delivered", "status-spoiled"];
const STATUS_NAMES = ["Registered", "In Transit", "Delivered", "Spoiled"];

const ACCOUNT_ROLES = [
    { name: "Admin (Blood Bank)", icon: "🏥", color: "bg-purple-600" },
    { name: "Kızılay (Blood Bank)", icon: "🩸", color: "bg-red-500" },
    { name: "DHL (Transporter)", icon: "🚚", color: "bg-yellow-600" },
    { name: "Hospital", icon: "🏨", color: "bg-green-600" },
    { name: "IoT Sensor", icon: "📡", color: "bg-blue-600" }
];

const CONTRACT_ABI = [
    "function register(string memory bagId, uint8 bloodType, uint256 expiryDays, string memory ipfsHash) external",
    "function transfer(string memory bagId, address to, string memory notes) external",
    "function recordTemp(string memory bagId, int256 temp) external",
    "function getHistory(string memory bagId) external view returns (tuple(string bagId, address owner, uint40 donationDate, uint40 expiryDate, uint8 bloodType, uint8 status, bool exists, string ipfsHash), tuple(int256 temp, uint256 timestamp, address recorder, bool inRange)[], tuple(address from, address to, uint256 timestamp, string notes)[])",
    "function getBag(string memory bagId) external view returns (tuple(string bagId, address owner, uint40 donationDate, uint40 expiryDate, uint8 bloodType, uint8 status, bool exists, string ipfsHash))",
    "function getAllBags() external view returns (string[] memory)",
    "function totalBags() external view returns (uint256)",
    "function bloodTypeStr(uint8 t) external pure returns (string memory)",
    "function statusStr(uint8 s) external pure returns (string memory)",
    "function isSafe(string memory bagId) external view returns (bool safe, string memory reason)",
    "function getParticipant(address addr) external view returns (tuple(string name, uint8 role, bool active, bool exists))"
];

// ============ State ============
let provider;
let signer;
let contract;
let contractAddress = "";
let currentAccountIndex = 0;

// ============ DOM Helpers ============
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// ============ Authentication ============
function logout() {
    // Clear all auth data
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('accountIndex');
    localStorage.removeItem('authToken');
    localStorage.removeItem('accountIndex');
    localStorage.removeItem('tokenExpiry');
    
    // Redirect to login
    window.location.href = 'login.html';
}

function checkLogin() {
    if (sessionStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ============ Initialization ============
async function init() {
    if (!checkLogin()) return;
    
    currentAccountIndex = parseInt(sessionStorage.getItem('accountIndex') || '0');
    $('accountSelector').value = currentAccountIndex;
    
    try {
        const response = await fetch('http://localhost:3000/api/contract-address');
        const data = await response.json();
        if (data.address) {
            contractAddress = data.address;
            console.log("Contract address loaded:", contractAddress);
        }
    } catch (e) {
        console.log("Could not fetch contract address from backend");
    }
    
    await connectWallet();
    await loadParticipants();
}

// ============ Wallet Connection ============
async function connectWallet() {
    try {
        provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        currentAccountIndex = parseInt($('accountSelector').value);
        signer = await provider.getSigner(currentAccountIndex);

        const address = await signer.getAddress();
        const role = ACCOUNT_ROLES[currentAccountIndex];
        
        if (contractAddress) {
            contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
        }

        // Update UI
        $('statusDot').classList.remove('bg-red-500');
        $('statusDot').classList.add('bg-green-500');
        $('statusText').textContent = `${role.icon} ${address.slice(0, 6)}...${address.slice(-4)}`;
        $('connectBtn').textContent = 'Connected';
        
        // Update role banner
        const banner = $('roleBanner');
        const roleInfo = $('roleInfo');
        banner.className = `${role.color} text-white py-2 px-4 text-center text-sm`;
        roleInfo.textContent = `${role.icon} Active Role: ${role.name} | Address: ${address}`;
        banner.classList.remove('hidden');

        logTransaction('success', `Connected: ${role.icon} ${role.name}`);
        
        if (contract) {
            await loadStats();
        }
    } catch (error) {
        console.error(error);
        logTransaction('error', `Connection failed: ${error.message}`);
    }
}

function switchAccount() {
    alert('Hesap değiştirmek için lütfen çıkış yapıp tekrar giriş yapın.');
}

// ============ Tab Navigation ============
function showTab(tabName) {
    $$('.tab-content').forEach(tab => tab.classList.add('hidden'));
    $$('.tab-btn').forEach(btn => btn.classList.remove('active', 'border-purple-600', 'text-purple-600'));
    
    $(tabName + 'Tab').classList.remove('hidden');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active', 'border-purple-600', 'text-purple-600');

    if (tabName === 'bags') {
        loadAllBags();
    }
}

// ============ Core Functions ============

// Upload to IPFS helper
async function uploadToIPFS(file, bagId, docType = 'certificate') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bagId', bagId);
    formData.append('documentType', docType);
    
    const response = await fetch('/api/ipfs/upload', {
        method: 'POST',
        body: formData
    });
    
    return response.json();
}

// Register Donation
async function registerDonation() {
    if (!contract) {
        alert('Please connect wallet first');
        return;
    }

    const bagId = $('regBagId').value;
    const bloodType = parseInt($('regBloodType').value);
    const expiryDays = parseInt($('regExpiryDays').value);
    const fileInput = $('regIpfsFile');
    
    const uploadStatus = $('ipfsUploadStatus');
    const hashDisplay = $('ipfsHashDisplay');

    if (!bagId) {
        alert('Please enter a Bag ID');
        return;
    }

    try {
        let ipfsHash = "";
        
        // Handle IPFS upload if file selected
        if (fileInput?.files.length > 0) {
            uploadStatus.classList.remove('hidden');
            $('ipfsStatusText').textContent = 'Uploading document to IPFS...';
            
            try {
                const ipfsResult = await uploadToIPFS(fileInput.files[0], bagId);
                
                if (ipfsResult.success) {
                    ipfsHash = ipfsResult.hash;
                    uploadStatus.classList.add('hidden');
                    hashDisplay.classList.remove('hidden');
                    $('ipfsHashValue').textContent = ipfsHash.substring(0, 20) + '...';
                    $('ipfsLink').href = ipfsResult.url;
                    logTransaction('success', `Document uploaded to IPFS: ${ipfsHash.substring(0, 16)}...`);
                } else {
                    throw new Error(ipfsResult.error);
                }
            } catch (ipfsError) {
                uploadStatus.classList.add('hidden');
                logTransaction('error', `IPFS upload failed: ${ipfsError.message}`);
            }
        }
        
        logTransaction('pending', `Registering donation: ${bagId}${ipfsHash ? ' (with IPFS document)' : ''}`);
        
        const response = await fetch('/api/bags/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bagId, bloodType, expiryDays, ipfsHash })
        });
        
        const result = await response.json();
        
        if (result.success) {
            logTransaction('success', `Donation registered: ${bagId} (${BLOOD_TYPES[bloodType]})${ipfsHash ? ' with IPFS' : ''}`);
            $('regBagId').value = '';
            if (fileInput) fileInput.value = '';
            hashDisplay.classList.add('hidden');
            await loadStats();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error(error);
        logTransaction('error', `Registration failed: ${error.reason || error.message}`);
    }
}

// Transfer Ownership
async function transferOwnership() {
    if (!contract) {
        alert('Please connect wallet first');
        return;
    }

    const bagId = $('transBagId').value;
    // Check dropdown first, then manual input
    const toAddress = $('transToAddress').value || $('transToAddressManual').value;
    const notes = $('transNotes').value;

    if (!bagId || !toAddress) {
        alert('Please fill all fields');
        return;
    }

    try {
        logTransaction('pending', `Transferring ${bagId} to ${toAddress.slice(0, 10)}...`);
        const tx = await contract.transfer(bagId, toAddress, notes);
        await tx.wait();
        logTransaction('success', `Ownership transferred: ${bagId}`);
        
        $('transBagId').value = '';
        $('transToAddress').value = '';
        $('transToAddressManual').value = '';
        $('transNotes').value = '';
        await loadStats();
    } catch (error) {
        console.error(error);
        logTransaction('error', `Transfer failed: ${error.reason || error.message}`);
    }
}

// Load registered participants for dropdown
async function loadParticipants() {
    try {
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        
        const dropdown = $('transToAddress');
        if (!dropdown) return;
        
        dropdown.innerHTML = '<option value="">Select recipient...</option>';
        
        const participants = [
            { name: '🩸 Kızılay (Blood Bank)', address: accounts.bloodBank },
            { name: '🚚 DHL (Transporter)', address: accounts.transporter },
            { name: '🏨 Hospital', address: accounts.hospital },
            { name: '📡 IoT Sensor', address: accounts.iotSensor }
        ];
        
        for (const p of participants) {
            if (p.address) {
                const option = document.createElement('option');
                option.value = p.address;
                option.textContent = `${p.name} - ${p.address.slice(0, 8)}...${p.address.slice(-4)}`;
                dropdown.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Failed to load participants:', error);
    }
}

// Record Temperature
async function recordTemperature() {
    if (!contract) {
        alert('Please connect wallet first');
        return;
    }

    const bagId = $('tempBagId').value.trim();
    const tempValue = parseFloat($('tempValue').value);

    if (!bagId || isNaN(tempValue)) {
        alert('Please fill all fields');
        return;
    }

    const tempContract = Math.round(tempValue * 100);
    const isInRange = tempValue >= 2 && tempValue <= 6;

    try {
        logTransaction('pending', `Recording temperature: ${tempValue}°C for ${bagId}`);
        const tx = await contract.recordTemp(bagId, tempContract);
        await tx.wait();
        
        if (isInRange) {
            logTransaction('success', `Temperature recorded: ${tempValue}°C (Safe)`);
        } else {
            logTransaction('error', `⚠️ TEMPERATURE BREACH: ${tempValue}°C - Bag marked as SPOILED!`);
        }
        
        $('tempBagId').value = '';
        $('tempValue').value = '';
        await loadStats();
    } catch (error) {
        console.error(error);
        logTransaction('error', `Recording failed: ${error.reason || error.message}`);
    }
}

// Get Bag History
async function getBagHistory() {
    if (!contract) {
        alert('Please connect wallet first');
        return;
    }

    const bagId = $('historyBagId').value;
    if (!bagId) {
        alert('Please enter a Bag ID');
        return;
    }

    try {
        const [bag, temps, transfers] = await contract.getHistory(bagId);
        const [isSafe, reason] = await contract.isSafe(bagId);
        
        const resultDiv = $('historyResult');
        resultDiv.classList.remove('hidden');
        
        resultDiv.innerHTML = renderBagHistory(bag, temps, transfers, isSafe, reason);
    } catch (error) {
        console.error(error);
        logTransaction('error', `Failed to get history: ${error.reason || error.message}`);
    }
}

// Render bag history HTML
function renderBagHistory(bag, temps, transfers, isSafe, reason) {
    return `
        <div class="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 class="text-lg font-bold mb-4">Bag Information</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <p class="text-gray-500 text-sm">Bag ID</p>
                    <p class="font-semibold">${bag.bagId}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-sm">Blood Type</p>
                    <p class="font-semibold">${BLOOD_TYPES[bag.bloodType]}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-sm">Status</p>
                    <span class="px-2 py-1 rounded text-white text-sm ${STATUS_CLASSES[bag.status]}">${STATUS_NAMES[bag.status]}</span>
                </div>
                <div>
                    <p class="text-gray-500 text-sm">Safety</p>
                    <span class="font-semibold ${isSafe ? 'text-green-600' : 'text-red-600'}">${isSafe ? '✅ Safe' : '❌ ' + reason}</span>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="text-lg font-bold mb-4"><i class="fas fa-thermometer-half text-orange-500 mr-2"></i>Temperature History</h3>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${temps.length === 0 ? '<p class="text-gray-500">No temperature records</p>' : 
                        temps.map(t => `
                            <div class="flex justify-between items-center py-2 border-b">
                                <span class="${t.inRange ? 'temp-safe' : 'temp-danger'} font-semibold">
                                    ${(Number(t.temp) / 100).toFixed(2)}°C
                                    ${t.inRange ? '✓' : '✗'}
                                </span>
                                <span class="text-gray-500 text-sm">${new Date(Number(t.timestamp) * 1000).toLocaleString()}</span>
                            </div>
                        `).join('')
                    }
                </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="text-lg font-bold mb-4"><i class="fas fa-exchange-alt text-blue-500 mr-2"></i>Ownership History</h3>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${transfers.map(t => `
                        <div class="py-2 border-b">
                            <div class="flex items-center text-sm">
                                <span class="text-gray-500">${t.from === '0x0000000000000000000000000000000000000000' ? 'Initial' : t.from.slice(0, 8) + '...'}</span>
                                <i class="fas fa-arrow-right mx-2 text-gray-400"></i>
                                <span class="font-semibold">${t.to.slice(0, 8)}...</span>
                            </div>
                            <p class="text-gray-500 text-xs mt-1">${t.notes} - ${new Date(Number(t.timestamp) * 1000).toLocaleString()}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Load All Bags
async function loadAllBags() {
    if (!contract) return;

    try {
        const bagIds = await contract.getAllBags();
        const tbody = $('bagsTableBody');
        tbody.innerHTML = '';

        for (const bagId of bagIds) {
            const bag = await contract.getBag(bagId);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-3 font-medium">${bag.bagId}</td>
                <td class="px-4 py-3">${BLOOD_TYPES[bag.bloodType]}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded text-white text-xs ${STATUS_CLASSES[bag.status]}">${STATUS_NAMES[bag.status]}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">${bag.owner.slice(0, 10)}...</td>
                <td class="px-4 py-3">
                    ${bag.ipfsHash ? `<a href="https://gateway.pinata.cloud/ipfs/${bag.ipfsHash}" target="_blank" class="text-blue-600"><i class="fas fa-file"></i></a>` : '-'}
                </td>
                <td class="px-4 py-3">
                    <button onclick="viewBagHistory('${bag.bagId}')" class="text-purple-600 hover:text-purple-800">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        }

        if (bagIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No blood bags registered yet</td></tr>';
        }
    } catch (error) {
        console.error(error);
    }
}

function viewBagHistory(bagId) {
    $('historyBagId').value = bagId;
    showTab('history');
    getBagHistory();
}

// Load Stats
async function loadStats() {
    if (!contract) return;

    try {
        const bagIds = await contract.getAllBags();
        let stats = { total: 0, inTransit: 0, delivered: 0, spoiled: 0 };

        for (const bagId of bagIds) {
            const bag = await contract.getBag(bagId);
            stats.total++;
            if (bag.status === 1n) stats.inTransit++;
            else if (bag.status === 2n) stats.delivered++;
            else if (bag.status === 3n) stats.spoiled++;
        }

        $('totalBags').textContent = stats.total;
        $('inTransit').textContent = stats.inTransit;
        $('delivered').textContent = stats.delivered;
        $('spoiled').textContent = stats.spoiled;
    } catch (error) {
        console.error(error);
    }
}

// ============ Transaction Logger ============
function logTransaction(type, message) {
    const log = $('txLog');
    const timestamp = new Date().toLocaleTimeString();
    const fullTimestamp = new Date().toISOString();
    
    // Save to localStorage
    const logs = JSON.parse(localStorage.getItem('txLogs') || '[]');
    logs.unshift({ type, message, timestamp: fullTimestamp });
    if (logs.length > 50) logs.pop();
    localStorage.setItem('txLogs', JSON.stringify(logs));
    
    renderLogEntry(log, type, message, timestamp);
}

function renderLogEntry(log, type, message, timestamp) {
    const icons = {
        success: '<i class="fas fa-check-circle text-green-500"></i>',
        error: '<i class="fas fa-times-circle text-red-500"></i>',
        pending: '<i class="fas fa-spinner fa-spin text-yellow-500"></i>'
    };

    const bgColors = {
        success: 'bg-green-50',
        error: 'bg-red-50',
        pending: 'bg-yellow-50'
    };

    if (log.querySelector('p.text-gray-500')) {
        log.innerHTML = '';
    }

    const entry = document.createElement('div');
    entry.className = `flex items-center space-x-3 p-3 rounded-lg ${bgColors[type] || 'bg-gray-50'}`;
    entry.innerHTML = `
        ${icons[type] || icons.success}
        <span class="text-gray-600 text-sm flex-1">${message}</span>
        <span class="text-gray-400 text-xs">${timestamp}</span>
    `;

    log.insertBefore(entry, log.firstChild);
}

function loadSavedLogs() {
    const log = $('txLog');
    const logs = JSON.parse(localStorage.getItem('txLogs') || '[]');
    
    if (logs.length > 0) {
        log.innerHTML = '';
        logs.forEach(item => {
            const time = new Date(item.timestamp).toLocaleTimeString();
            renderLogEntry(log, item.type, item.message, time);
        });
    }
}

function clearLogs() {
    localStorage.removeItem('txLogs');
    $('txLog').innerHTML = '<p class="text-gray-500 text-center py-4">No transactions yet</p>';
}

// ============ IPFS Functions ============
async function checkIPFSStatus() {
    try {
        const response = await fetch('/api/ipfs/status');
        const status = await response.json();
        
        const statusEl = $('ipfsProviderStatus');
        if (status.configured) {
            statusEl.innerHTML = `<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>${status.provider} - ${status.message}</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>${status.provider} - ${status.message}</span>`;
        }
    } catch (error) {
        $('ipfsProviderStatus').innerHTML = `<span class="text-red-600"><i class="fas fa-times-circle mr-1"></i>Error: ${error.message}</span>`;
    }
}

async function uploadIPFSDocument() {
    const bagId = $('ipfsBagId').value.trim();
    const docType = $('ipfsDocType').value;
    const fileInput = $('ipfsDocFile');
    const resultDiv = $('ipfsUploadResult');
    
    if (!bagId) {
        alert('Please enter a Bag ID');
        return;
    }
    
    if (!fileInput.files.length) {
        alert('Please select a file to upload');
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', docType);
    formData.append('signer', 'bloodBank');
    
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <i class="fas fa-spinner fa-spin text-yellow-600 mr-2"></i>
            <span class="text-yellow-700">Uploading to IPFS and recording on blockchain...</span>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/bags/${bagId}/upload-document`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle text-green-600 mr-2"></i>
                        <span class="text-green-700 font-semibold">Document uploaded successfully!</span>
                    </div>
                    <div class="text-sm text-green-600 space-y-1">
                        <p><strong>IPFS Hash:</strong> <code class="bg-green-100 px-2 py-1 rounded">${result.ipfs.hash}</code></p>
                        <p><strong>Gateway URL:</strong> <a href="${result.ipfs.url}" target="_blank" class="text-blue-600 hover:underline">${result.ipfs.url}</a></p>
                        <p><strong>TX Hash:</strong> <code class="bg-green-100 px-2 py-1 rounded text-xs">${result.blockchain.txHash}</code></p>
                    </div>
                </div>
            `;
            
            logTransaction('success', `IPFS document uploaded for ${bagId}: ${result.ipfs.hash.substring(0, 16)}...`);
            fileInput.value = '';
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <i class="fas fa-times-circle text-red-600 mr-2"></i>
                <span class="text-red-700">Error: ${error.message}</span>
            </div>
        `;
        logTransaction('error', `IPFS upload failed: ${error.message}`);
    }
}

async function loadIPFSDocuments() {
    const bagId = $('ipfsViewBagId').value.trim();
    
    if (!bagId) {
        alert('Please enter a Bag ID');
        return;
    }
    
    try {
        const response = await fetch(`/api/bags/${bagId}/ipfs-documents`);
        const documents = await response.json();
        
        const listDiv = $('ipfsDocumentsList');
        const noDocsDiv = $('ipfsNoDocuments');
        const tbody = $('ipfsDocsTableBody');
        
        if (documents.length === 0) {
            listDiv.classList.add('hidden');
            noDocsDiv.classList.remove('hidden');
            return;
        }
        
        noDocsDiv.classList.add('hidden');
        listDiv.classList.remove('hidden');
        
        tbody.innerHTML = documents.map(doc => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <i class="fas fa-${getDocTypeIcon(doc.documentType)} mr-1"></i>
                        ${doc.documentType}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <code class="text-xs bg-gray-100 px-2 py-1 rounded">${doc.ipfsHash.substring(0, 20)}...</code>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                    ${new Date(doc.timestamp * 1000).toLocaleString()}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                    ${doc.uploadedBy.substring(0, 8)}...
                </td>
                <td class="px-4 py-3">
                    <a href="${doc.url}" target="_blank" class="text-blue-600 hover:text-blue-800">
                        <i class="fas fa-external-link-alt mr-1"></i>View
                    </a>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        alert('Error loading documents: ' + error.message);
    }
}

function getDocTypeIcon(type) {
    const icons = {
        'certificate': 'certificate',
        'test_result': 'flask',
        'photo': 'image',
        'report': 'file-alt',
        'document': 'file'
    };
    return icons[type] || 'file';
}

// ============ Initialize on Load ============
document.addEventListener('DOMContentLoaded', function() {
    // Initialize app
    init();
    loadSavedLogs();
    checkIPFSStatus();
    
    // Add event listeners for all buttons
    const addClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    
    // Header buttons
    addClick('connectBtn', connectWallet);
    addClick('logoutBtn', logout);
    
    // Action buttons
    addClick('registerDonationBtn', registerDonation);
    addClick('transferOwnershipBtn', transferOwnership);
    addClick('recordTemperatureBtn', recordTemperature);
    addClick('getBagHistoryBtn', getBagHistory);
    addClick('loadAllBagsBtn', loadAllBags);
    addClick('clearLogsBtn', clearLogs);
    
    // IPFS buttons
    addClick('checkIPFSStatusBtn', checkIPFSStatus);
    addClick('uploadIPFSDocumentBtn', uploadIPFSDocument);
    addClick('loadIPFSDocumentsBtn', loadIPFSDocuments);
    
    // Tab buttons - use event delegation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            if (tab) showTab(tab);
        });
    });
    
    // Account selector change
    const accountSelector = document.getElementById('accountSelector');
    if (accountSelector) {
        accountSelector.addEventListener('change', connectWallet);
    }
});

// Export functions for dynamic onclick handlers (like viewBagHistory in table)
window.viewBagHistory = viewBagHistory;
