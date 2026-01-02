// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./libraries/BloodChainLib.sol";

/**
 * @title BloodColdChainV2
 * @dev Optimized Blood Cold Chain - Uses libraries for smaller bytecode
 * @author Yusuf Emre Elmali & Hasan Demiryurek
 */
contract BloodColdChainV2 is AccessControl, ReentrancyGuard, Pausable {
    using BloodChainLib for int256;
    using BloodChainLib for string;
    using BloodChainTypes for BloodChainTypes.BloodType;
    
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant BLOOD_BANK = keccak256("BLOOD_BANK");
    bytes32 public constant TRANSPORTER = keccak256("TRANSPORTER");
    bytes32 public constant HOSPITAL = keccak256("HOSPITAL");
    bytes32 public constant IOT_SENSOR = keccak256("IOT_SENSOR");
    
    mapping(string => BloodChainTypes.BloodBag) public bags;
    mapping(string => BloodChainTypes.TempRecord[]) public temps;
    mapping(string => BloodChainTypes.Transfer[]) public transfers;
    mapping(string => BloodChainTypes.IPFSDoc[]) public docs;
    mapping(address => BloodChainTypes.Participant) public participants;
    
    string[] public bagIds;
    address[] public participantList;
    
    event Registered(string indexed bagId, BloodChainTypes.BloodType bloodType, address indexed by);
    event Transferred(string indexed bagId, address indexed from, address indexed to);
    event TempRecorded(string indexed bagId, int256 temp, bool safe, address indexed by);
    event Spoiled(string indexed bagId, int256 temp);
    event ParticipantAdded(address indexed addr, string name, BloodChainTypes.Role role);
    event DocAdded(string indexed bagId, string hash, string docType);
    event Alert(string alertType, address indexed actor, string details);
    
    modifier active() {
        require(participants[msg.sender].active, "Not active");
        _;
    }
    
    modifier exists(string memory id) {
        require(bags[id].exists, "Not found");
        _;
    }
    
    modifier notSpoiled(string memory id) {
        require(bags[id].status != BloodChainTypes.BagStatus.SPOILED, "Spoiled");
        _;
    }
    
    modifier onlyBloodBank() {
        require(participants[msg.sender].role == BloodChainTypes.Role.BLOOD_BANK, "You don't have permission");
        _;
    }
    
    modifier onlyHospital() {
        require(participants[msg.sender].role == BloodChainTypes.Role.HOSPITAL, "Yetkiniz yok: Sadece hastane");
        _;
    }
    
    modifier onlyTransporter() {
        require(participants[msg.sender].role == BloodChainTypes.Role.TRANSPORTER, "Yetkiniz yok: Sadece tasiyici");
        _;
    }
    
    modifier onlyIoTSensor() {
        require(participants[msg.sender].role == BloodChainTypes.Role.IOT_SENSOR, "Yetkiniz yok: Sadece IoT sensor");
        _;
    }
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        _grantRole(BLOOD_BANK, msg.sender);
        
        participants[msg.sender] = BloodChainTypes.Participant("Admin", BloodChainTypes.Role.BLOOD_BANK, true);
        participantList.push(msg.sender);
        emit ParticipantAdded(msg.sender, "Admin", BloodChainTypes.Role.BLOOD_BANK);
    }
    
    function addParticipant(address addr, string calldata name, BloodChainTypes.Role role) external onlyRole(ADMIN) {
        require(!participants[addr].active, "Exists");
        require(addr != address(0) && bytes(name).length > 0, "Invalid");
        
        participants[addr] = BloodChainTypes.Participant(name, role, true);
        participantList.push(addr);
        
        // Grant role
        bytes32[4] memory roles = [BLOOD_BANK, TRANSPORTER, HOSPITAL, IOT_SENSOR];
        _grantRole(roles[uint8(role)], addr);
        
        emit ParticipantAdded(addr, name, role);
    }
    
    function setParticipantActive(address addr, bool active_) external onlyRole(ADMIN) {
        participants[addr].active = active_;
    }
    
    function register(
        string calldata id,
        BloodChainTypes.BloodType bloodType,
        uint256 expiryDays,
        string calldata ipfs
    ) external active onlyBloodBank whenNotPaused nonReentrant {
        require(!bags[id].exists && bytes(id).length > 0, "Invalid ID");
        require(expiryDays > 0 && expiryDays <= 365, "Invalid expiry");
        if (bytes(ipfs).length > 0) require(BloodChainLib.validateIPFS(ipfs), "Invalid IPFS");
        
        bags[id] = BloodChainTypes.BloodBag({
            bagId: id,
            currentOwner: msg.sender,
            donationDate: uint40(block.timestamp),
            expiryDate: uint40(block.timestamp + expiryDays * 1 days),
            bloodType: bloodType,
            status: BloodChainTypes.BagStatus.REGISTERED,
            exists: true,
            ipfsHash: ipfs
        });
        
        bagIds.push(id);
        transfers[id].push(BloodChainTypes.Transfer(address(0), msg.sender, uint40(block.timestamp), "Initial"));
        emit Registered(id, bloodType, msg.sender);
    }
    
    function transfer(string calldata id, address to, string calldata notes) 
        external active exists(id) notSpoiled(id) whenNotPaused nonReentrant 
    {
        BloodChainTypes.BloodBag storage bag = bags[id];
        require(bag.currentOwner == msg.sender, "Not owner");
        require(participants[to].active && to != msg.sender, "Invalid recipient");
        
        address from = bag.currentOwner;
        bag.currentOwner = to;
        
        // Update status
        BloodChainTypes.Role role = participants[to].role;
        if (role == BloodChainTypes.Role.TRANSPORTER) bag.status = BloodChainTypes.BagStatus.IN_TRANSIT;
        else if (role == BloodChainTypes.Role.HOSPITAL) bag.status = BloodChainTypes.BagStatus.DELIVERED;
        
        transfers[id].push(BloodChainTypes.Transfer(from, to, uint40(block.timestamp), notes));
        emit Transferred(id, from, to);
    }
    
    function recordTemp(string calldata id, int256 temp) external active exists(id) whenNotPaused {
        BloodChainTypes.Role role = participants[msg.sender].role;
        require(role == BloodChainTypes.Role.IOT_SENSOR || role == BloodChainTypes.Role.TRANSPORTER, "Yetkiniz yok: Sadece IoT sensor veya tasiyici");
        require(BloodChainLib.isTempReasonable(temp), "Out of range");
        
        BloodChainTypes.BloodBag storage bag = bags[id];
        bool safe = BloodChainLib.isValidTemp(temp);
        
        temps[id].push(BloodChainTypes.TempRecord(temp, uint40(block.timestamp), msg.sender, safe));
        emit TempRecorded(id, temp, safe, msg.sender);
        
        if (!safe && bag.status != BloodChainTypes.BagStatus.SPOILED) {
            bag.status = BloodChainTypes.BagStatus.SPOILED;
            emit Spoiled(id, temp);
            emit Alert("TEMP_BREACH", msg.sender, id);
        }
    }
    
    function addDoc(string calldata id, string calldata hash, string calldata docType) 
        external active exists(id) whenNotPaused 
    {
        BloodChainTypes.Role role = participants[msg.sender].role;
        require(role == BloodChainTypes.Role.BLOOD_BANK || role == BloodChainTypes.Role.HOSPITAL, "Yetkiniz yok: Sadece kan bankasi veya hastane");
        require(bytes(hash).length > 0 && bytes(docType).length > 0, "Empty");
        require(BloodChainLib.validateIPFS(hash), "Invalid IPFS");
        
        docs[id].push(BloodChainTypes.IPFSDoc(hash, docType, uint40(block.timestamp), msg.sender));
        emit DocAdded(id, hash, docType);
    }
    
    function updateIPFS(string calldata id, string calldata hash) external active exists(id) whenNotPaused {
        require(bags[id].currentOwner == msg.sender, "Yetkiniz yok: Sadece mevcut sahip");
        require(BloodChainLib.validateIPFS(hash), "Invalid IPFS");
        bags[id].ipfsHash = hash;
    }
    

    function getBag(string calldata id) external view exists(id) returns (BloodChainTypes.BloodBag memory) {
        return bags[id];
    }
    
    function getHistory(string calldata id) external view exists(id) returns (
        BloodChainTypes.BloodBag memory,
        BloodChainTypes.TempRecord[] memory,
        BloodChainTypes.Transfer[] memory
    ) {
        return (bags[id], temps[id], transfers[id]);
    }
    
    function getDocs(string calldata id) external view exists(id) returns (BloodChainTypes.IPFSDoc[] memory) {
        return docs[id];
    }
    
    function isSafe(string calldata id) external view exists(id) returns (bool safe, string memory reason) {
        BloodChainTypes.BloodBag memory bag = bags[id];
        if (bag.status == BloodChainTypes.BagStatus.SPOILED) return (false, "Spoiled");
        if (block.timestamp > bag.expiryDate) return (false, "Expired");
        return (true, "Safe");
    }
    
    function getAllBags() external view returns (string[] memory) { return bagIds; }
    function getTotal() external view returns (uint256) { return bagIds.length; }
    function getAllParticipants() external view returns (address[] memory) { return participantList; }
    function getParticipant(address a) external view returns (BloodChainTypes.Participant memory) { return participants[a]; }
    
    function bloodTypeStr(BloodChainTypes.BloodType t) external pure returns (string memory) {
        return BloodChainLib.bloodTypeStr(t);
    }
    
    function statusStr(BloodChainTypes.BagStatus s) external pure returns (string memory) {
        return BloodChainLib.statusStr(s);
    }
    
    function pause() external onlyRole(ADMIN) { _pause(); emit Alert("PAUSED", msg.sender, ""); }
    function unpause() external onlyRole(ADMIN) { _unpause(); }
    
    function emergencySpoil(string calldata id, string calldata reason) external onlyRole(ADMIN) exists(id) {
        require(bags[id].status != BloodChainTypes.BagStatus.SPOILED, "Already spoiled");
        bags[id].status = BloodChainTypes.BagStatus.SPOILED;
        emit Spoiled(id, 0);
        emit Alert("EMERGENCY_SPOIL", msg.sender, reason);
    }
}
