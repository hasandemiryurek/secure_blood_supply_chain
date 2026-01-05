const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BloodColdChainV2", function () {
    let contract;
    let admin, bloodBank, transporter, hospital, other;
    
    // Roles enum matching contract
    const Role = { BLOOD_BANK: 0, TRANSPORTER: 1, HOSPITAL: 2 };
    const BloodType = { A_POS: 0, A_NEG: 1, B_POS: 2, B_NEG: 3, AB_POS: 4, AB_NEG: 5, O_POS: 6, O_NEG: 7 };
    const Status = { REGISTERED: 0, IN_TRANSIT: 1, DELIVERED: 2, SPOILED: 3 };
    
    beforeEach(async function () {
        [admin, bloodBank, transporter, hospital, other] = await ethers.getSigners();
        
        const Contract = await ethers.getContractFactory("BloodColdChainV2");
        contract = await Contract.deploy();
        await contract.waitForDeployment();
        
        // Register participants
        await contract.addParticipant(bloodBank.address, "Kizilay", Role.BLOOD_BANK);
        await contract.addParticipant(transporter.address, "DHL", Role.TRANSPORTER);
        await contract.addParticipant(hospital.address, "City Hospital", Role.HOSPITAL);
    });
    
    describe("Deployment", function () {
        it("Should set admin correctly", async function () {
            const participant = await contract.getParticipant(admin.address);
            expect(participant.active).to.be.true;
            expect(participant.name).to.equal("Admin");
        });
    });
    
    describe("Participant Management", function () {
        it("Should register participants", async function () {
            const p = await contract.getParticipant(bloodBank.address);
            expect(p.name).to.equal("Kizilay");
            expect(p.role).to.equal(Role.BLOOD_BANK);
            expect(p.active).to.be.true;
        });
        
        it("Should deactivate participant", async function () {
            await contract.setParticipantActive(bloodBank.address, false);
            const p = await contract.getParticipant(bloodBank.address);
            expect(p.active).to.be.false;
        });
        
        it("Should get all participants", async function () {
            const list = await contract.getAllParticipants();
            expect(list.length).to.equal(4);
        });
    });
    
    describe("Blood Donation", function () {
        const validIPFS = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
        
        it("Should register donation", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            const bag = await contract.getBag("BAG-001");
            expect(bag.bagId).to.equal("BAG-001");
            expect(bag.bloodType).to.equal(BloodType.O_NEG);
            expect(bag.exists).to.be.true;
        });
        
        it("Should register with IPFS", async function () {
            await contract.connect(bloodBank).register("BAG-002", BloodType.A_POS, 42, validIPFS);
            const bag = await contract.getBag("BAG-002");
            expect(bag.ipfsHash).to.equal(validIPFS);
        });
        
        it("Should fail duplicate ID", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            await expect(
                contract.connect(bloodBank).register("BAG-001", BloodType.A_POS, 42, "")
            ).to.be.revertedWith("Invalid ID");
        });
        
        it("Should get total bags", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            expect(await contract.getTotal()).to.equal(1);
        });
    });
    
    describe("Ownership Transfer", function () {
        beforeEach(async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
        });
        
        it("Should transfer to transporter", async function () {
            await contract.connect(bloodBank).transfer("BAG-001", transporter.address, "Pickup");
            const bag = await contract.getBag("BAG-001");
            expect(bag.currentOwner).to.equal(transporter.address);
            expect(bag.status).to.equal(Status.IN_TRANSIT);
        });
        
        it("Should transfer to hospital and mark delivered", async function () {
            await contract.connect(bloodBank).transfer("BAG-001", transporter.address, "Pickup");
            await contract.connect(transporter).transfer("BAG-001", hospital.address, "Delivery");
            const bag = await contract.getBag("BAG-001");
            expect(bag.status).to.equal(Status.DELIVERED);
        });
        
        it("Should fail non-owner transfer", async function () {
            await expect(
                contract.connect(transporter).transfer("BAG-001", hospital.address, "Steal")
            ).to.be.revertedWith("Not owner");
        });
    });
    
    describe("Temperature Recording", function () {
        beforeEach(async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            await contract.connect(bloodBank).transfer("BAG-001", transporter.address, "Pickup");
        });
        
        it("Should record safe temperature", async function () {
            await contract.connect(transporter).recordTemp("BAG-001", 400); // 4°C
            const history = await contract.getHistory("BAG-001");
            expect(history[1].length).to.equal(1);
            expect(history[1][0].inRange).to.be.true;
        });
        
        it("Should mark spoiled on breach", async function () {
            await contract.connect(transporter).recordTemp("BAG-001", 1000); // 10°C
            const bag = await contract.getBag("BAG-001");
            expect(bag.status).to.equal(Status.SPOILED);
        });
        
        it("Should fail for blood bank to record", async function () {
            await expect(
                contract.connect(bloodBank).recordTemp("BAG-001", 400)
            ).to.be.revertedWith("You don't have permission");
        });
    });
    
    describe("Safety Check", function () {
        it("Should report safe bag", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            const [safe, reason] = await contract.isSafe("BAG-001");
            expect(safe).to.be.true;
            expect(reason).to.equal("Safe");
        });
        
        it("Should report spoiled as unsafe", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            await contract.connect(bloodBank).transfer("BAG-001", transporter.address, "");
            await contract.connect(transporter).recordTemp("BAG-001", 1000);
            const [safe, reason] = await contract.isSafe("BAG-001");
            expect(safe).to.be.false;
            expect(reason).to.equal("Spoiled");
        });
    });
    
    describe("IPFS Documents", function () {
        const hash = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
        
        beforeEach(async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
        });
        
        it("Should add document", async function () {
            await contract.connect(bloodBank).addDoc("BAG-001", hash, "certificate");
            const docs = await contract.getDocs("BAG-001");
            expect(docs.length).to.equal(1);
            expect(docs[0].hash).to.equal(hash);
        });
        
        it("Should update IPFS hash", async function () {
            await contract.connect(bloodBank).updateIPFS("BAG-001", hash);
            const bag = await contract.getBag("BAG-001");
            expect(bag.ipfsHash).to.equal(hash);
        });
    });
    
    describe("Emergency Functions", function () {
        it("Should pause contract", async function () {
            await contract.pause();
            await expect(
                contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "")
            ).to.be.reverted;
        });
        
        it("Should emergency spoil", async function () {
            await contract.connect(bloodBank).register("BAG-001", BloodType.O_NEG, 42, "");
            await contract.emergencySpoil("BAG-001", "Contamination");
            const bag = await contract.getBag("BAG-001");
            expect(bag.status).to.equal(Status.SPOILED);
        });
    });
    
    describe("Helper Functions", function () {
        it("Should return blood type string", async function () {
            expect(await contract.bloodTypeStr(BloodType.O_NEG)).to.equal("O-");
            expect(await contract.bloodTypeStr(BloodType.AB_POS)).to.equal("AB+");
        });
        
        it("Should return status string", async function () {
            expect(await contract.statusStr(Status.REGISTERED)).to.equal("Registered");
            expect(await contract.statusStr(Status.SPOILED)).to.equal("Spoiled");
        });
    });
    
    describe("End-to-End Scenario", function () {
        it("Should complete full workflow", async function () {
            // 1. Register
            await contract.connect(bloodBank).register("E2E-001", BloodType.O_NEG, 42, "");
            console.log("✅ Step 1: Registered");
            
            // 2. Transfer to transporter
            await contract.connect(bloodBank).transfer("E2E-001", transporter.address, "Pickup");
            let bag = await contract.getBag("E2E-001");
            expect(bag.status).to.equal(Status.IN_TRANSIT);
            console.log("✅ Step 2: In Transit");
            
            // 3. Record safe temps
            await contract.connect(transporter).recordTemp("E2E-001", 400);
            await contract.connect(transporter).recordTemp("E2E-001", 450);
            console.log("✅ Step 3: Temps recorded (4°C, 4.5°C)");
            
            // 4. Temperature breach
            await contract.connect(transporter).recordTemp("E2E-001", 1000);
            bag = await contract.getBag("E2E-001");
            expect(bag.status).to.equal(Status.SPOILED);
            console.log("🚨 Step 4: SPOILED!");
            
            // 5. Cannot transfer spoiled
            await expect(
                contract.connect(transporter).transfer("E2E-001", hospital.address, "")
            ).to.be.revertedWith("Spoiled");
            console.log("✅ Step 5: Transfer blocked");
            
            // 6. Check history
            const [finalBag, temps, transfers] = await contract.getHistory("E2E-001");
            console.log(`\n📊 FINAL: ${temps.length} temp records, ${transfers.length} transfers`);
        });
    });
});
