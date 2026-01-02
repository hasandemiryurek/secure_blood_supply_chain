// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BloodChainTypes
 * @dev Shared types for Blood Cold Chain system
 */
library BloodChainTypes {
    enum BloodType { A_POS, A_NEG, B_POS, B_NEG, AB_POS, AB_NEG, O_POS, O_NEG }
    enum BagStatus { REGISTERED, IN_TRANSIT, DELIVERED, SPOILED }
    enum Role { BLOOD_BANK, TRANSPORTER, HOSPITAL, IOT_SENSOR }
    
    struct BloodBag {
        string bagId;
        address currentOwner;
        uint40 donationDate;
        uint40 expiryDate;
        BloodType bloodType;
        BagStatus status;
        bool exists;
        string ipfsHash;
    }
    
    struct TempRecord {
        int256 temp;
        uint40 timestamp;
        address recorder;
        bool inRange;
    }
    
    struct Transfer {
        address from;
        address to;
        uint40 timestamp;
        string notes;
    }
    
    struct Participant {
        string name;
        Role role;
        bool active;
    }
    
    struct IPFSDoc {
        string hash;
        string docType;
        uint40 timestamp;
        address uploader;
    }
}

/**
 * @title BloodChainLib
 * @dev Utility functions for Blood Cold Chain
 */
library BloodChainLib {
    int256 constant MIN_TEMP = 200;  // 2.00°C
    int256 constant MAX_TEMP = 600;  // 6.00°C
    
    function isValidTemp(int256 temp) internal pure returns (bool) {
        return temp >= MIN_TEMP && temp <= MAX_TEMP;
    }
    
    function isTempReasonable(int256 temp) internal pure returns (bool) {
        return temp >= -5000 && temp <= 10000;
    }
    
    function validateIPFS(string memory hash) internal pure returns (bool) {
        bytes memory b = bytes(hash);
        if (b.length == 46) return b[0] == 'Q' && b[1] == 'm';
        if (b.length >= 59) return b[0] == 'b' || b[0] == 'z';
        return false;
    }
    
    function bloodTypeStr(BloodChainTypes.BloodType t) internal pure returns (string memory) {
        string[8] memory s = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
        return s[uint8(t)];
    }
    
    function statusStr(BloodChainTypes.BagStatus s) internal pure returns (string memory) {
        string[4] memory st = ["Registered", "In Transit", "Delivered", "Spoiled"];
        return st[uint8(s)];
    }
}
