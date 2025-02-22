const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const projectWalletAddress = holder;
const participant_1 = accounts[4];
const participant_2 = accounts[5];
const participant_3 = accounts[6];
const participant_4 = accounts[7];
const participant_5 = accounts[8];
const participant_6 = accounts[9];

const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 6450;

const ApplicationEventTypes = {
    NOT_SET:0,        // will match default value of a mapping result
    CONTRIBUTION_NEW:1,
    CONTRIBUTION_CANCEL:2,
    PARTICIPANT_CANCEL:3,
    WHITELIST_CANCEL:4,
    WHITELIST_ACCEPT:5,
    COMMIT_ACCEPT:6,
    ACCEPT:7,
    REJECT:8,
    CANCEL:9
}

const TransferTypes = {
    NOT_SET:0,
    AUTOMATIC_REFUND:1,
    WHITELIST_CANCEL:2,
    PARTICIPANT_CANCEL:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAW:5
}


const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let SnapShotKey = "ContributionsTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

let TokenTrackerAddress, ReversibleICOAddress, stageValidation = [], currentBlock, 
    StartBlock, AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, EndBlock, TokenTrackerInstance, 
    TokenTrackerReceipt, ReversibleICOInstance, ReversibleICOReceipt;

async function revertToFreshDeployment() {

    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }

    if (typeof snapshots[SnapShotKey] !== "undefined" && snapshotsEnabled) {
        // restore snapshot
        await helpers.web3.evm.revert(snapshots[SnapShotKey]);

        // save again because whomever wrote test rpc had the impression no one would ever restore twice.. dafuq
        snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();

        // reset account nonces.. 
        helpers.utils.resetAccountNonceCache(helpers);
    } else {

        /*
        *   Deploy Token Contract
        */
       
        TokenTrackerInstance = await helpers.utils.deployNewContractInstance(
            helpers, "RicoToken", {
                from: holder,
                arguments: [
                    setup.settings.token.supply.toString(),
                    defaultOperators
                ],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );
        TokenTrackerReceipt = TokenTrackerInstance.receipt;
        TokenTrackerAddress = TokenTrackerInstance.receipt.contractAddress;
        console.log("      TOKEN Gas used for deployment:", TokenTrackerInstance.receipt.gasUsed);
        console.log("      Contract Address:", TokenTrackerAddress);

        /*
        *   Deploy RICO Contract
        */
        ReversibleICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
        ReversibleICOReceipt = ReversibleICOInstance.receipt;
        ReversibleICOAddress = ReversibleICOInstance.receipt.contractAddress;
        // helpers.addresses.Rico = ReversibleICOAddress;

        console.log("      RICO Gas used for deployment: ", ReversibleICOInstance.receipt.gasUsed);
        console.log("      Contract Address:", ReversibleICOAddress);
        console.log("");

        await TokenTrackerInstance.methods.setup(
            ReversibleICOAddress,
            holder
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
        *   Add RICO Settings
        */
        currentBlock = await ReversibleICOInstance.methods.getCurrentBlockNumber().call();
            
        // starts in one day
        StartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1; 
        
        // 22 days allocation
        AllocationBlockCount = blocksPerDay * 22;                   
        AllocationPrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;      
        StagePriceIncrease = helpers.solidity.ether * 0.0001;
        AllocationEndBlock = StartBlock + AllocationBlockCount;

        EndBlock = AllocationEndBlock + ( (StageBlockCount + 1) * StageCount );


        await ReversibleICOInstance.methods.addSettings(
            TokenTrackerAddress,        // address _TokenTrackerAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            projectWalletAddress,          // address _projectWalletAddress
            StartBlock,                 // uint256 _StartBlock
            AllocationBlockCount,       // uint256 _AllocationBlockCount,
            AllocationPrice,            // uint256 _AllocationPrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
        ).send({
            from: deployerAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenTrackerInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });

        expect(
            await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());
        

        // create snapshot
        if (snapshotsEnabled) {
            snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenTrackerInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenTrackerAddress);
    TokenTrackerInstance.receipt = TokenTrackerReceipt;
    ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
    ReversibleICOInstance.receipt = ReversibleICOReceipt;

    // do some validation
    expect( 
        await helpers.utils.getBalance(helpers, ReversibleICOAddress)
    ).to.be.bignumber.equal( new helpers.BN(0) );

    expect(
        await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversibleICOInstance.methods.TokenSupply().call()
    ).to.be.equal(
        await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
    );
};

describe("Contribution Testing", function () {

    before(async function () { 
        await revertToFreshDeployment();
    });

    describe("transaction () => fallback method", async function () { 

        describe("contract in Allocation phase", async function () { 
            
            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
            });

            it("value >= rico.minContribution results in a new contribution", async function () {

                let contributionCount = 0;
                let ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                const ContributionAmount = new helpers.BN("20000").mul( helpers.solidity.etherBN );
                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;
                // await displayContributions(ReversibleICOInstance, participant_1, helpers, 1);

                let whitelistOrRejectTx = await ReversibleICOInstance.methods.whitelistOrReject(
                    participant_1,
                    ApplicationEventTypes.WHITELIST_ACCEPT
                ).send({
                    from: whitelistControllerAddress
                });
                // await displayContributions(ReversibleICOInstance, participant_1, helpers, 1);

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;
                // await displayContributions(ReversibleICOInstance, participant_1, helpers, 1);

                ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                expect( 
                    afterContributionsCount.toString()
                ).to.be.equal(
                    (parseInt(initialContributionsCount) + contributionCount).toString()
                );

            });
        });
    });
});


async function displayContributions(contract, participant_address, helpers, max = null) {

    let receivedETH = await contract.methods.receivedETH().call();
    let returnedETH = await contract.methods.returnedETH().call();
    let acceptedETH = await contract.methods.acceptedETH().call();
    let withdrawnETH = await contract.methods.withdrawnETH().call();
    let ContractBalance = await helpers.utils.getBalance(helpers, contract.receipt.contractAddress);

    let ParticipantByAddress = await contract.methods.ParticipantsByAddress(participant_address).call();

    let ContractStageCount = await contract.methods.ContractStageCount().call();
    const contributionsCount = ParticipantByAddress.contributionsCount;

    console.log("Globals");
    console.log("Real Balance:             ", helpers.utils.toEth(helpers, ContractBalance.toString()) +" eth" );
    console.log("Total amount Received:    ", helpers.utils.toEth(helpers, receivedETH.toString()) +" eth" );
    console.log("Total amount Returned:    ", helpers.utils.toEth(helpers, returnedETH.toString()) +" eth" );
    console.log("Total amount Accepted:    ", helpers.utils.toEth(helpers, acceptedETH.toString()) +" eth" );
    console.log("Total amount Withdrawn:   ", helpers.utils.toEth(helpers, withdrawnETH.toString()) +" eth" );
    
    console.log("Contributions for address:", participant_address);
    console.log("Count:                    ", contributionsCount.toString());
    console.log("Total amount Received:    ", helpers.utils.toEth(helpers, ParticipantByAddress.received.toString()) +" eth" );
    console.log("Total amount Returned:    ", helpers.utils.toEth(helpers, ParticipantByAddress.returned.toString()) +" eth" );
    console.log("Total amount Accepted:    ", helpers.utils.toEth(helpers, ParticipantByAddress.accepted.toString()) +" eth" );
    console.log("Total amount Withdrawn:   ", helpers.utils.toEth(helpers, ParticipantByAddress.withdrawn.toString()) +" eth" );
    console.log("Total reserved Tokens:    ", helpers.utils.toEth(helpers, ParticipantByAddress.tokens_reserved.toString()) +" tokens" );
    console.log("Total awarded Tokens:     ", helpers.utils.toEth(helpers, ParticipantByAddress.tokens_awarded.toString()) +" tokens" );

    if(max > 0) {
        ContractStageCount = max;
    }

    for(let i = 0; i < ContractStageCount; i++) {
        const ParticipantStageDetails = await contract.methods.ParticipantTotalsDetails(participant_address, i).call();
        console.log("-------------------------------------------");
        console.log("stageId:          ", i);
        console.log("received:         ", helpers.utils.toEth(helpers,ParticipantStageDetails.received.toString() ) +" eth" );
        console.log("returned:         ", helpers.utils.toEth(helpers,ParticipantStageDetails.returned.toString() ) +" eth" );
        console.log("accepted:         ", helpers.utils.toEth(helpers,ParticipantStageDetails.accepted.toString() ) +" eth" );
        console.log("withdrawn:        ", helpers.utils.toEth(helpers,ParticipantStageDetails.withdrawn.toString() ) +" eth" );
        console.log("tokens_reserved:  ", helpers.utils.toEth(helpers,ParticipantStageDetails.tokens_reserved.toString() ) +" tokens" );
        console.log("tokens_awarded:   ", helpers.utils.toEth(helpers,ParticipantStageDetails.tokens_awarded.toString() ) +" tokens" );
    }

    console.log("\n");
}
