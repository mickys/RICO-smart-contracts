/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

contract ReversableICO {

    address public TokenTrackerAddress;
    address public whitelistControllerAddress;

    /*
    *   Contract Settings
    */
    uint256 public StartBlock;
    uint256 public EndBlock;

    /*
    * Allocation period
    */
    uint256 public AllocationPrice;
    uint256 public AllocationBlockCount;
    uint256 public AllocationEndBlock;
    uint256 public StageBlockCount;

    /*
    *   Contract Stages
    */
    struct ContractStage {
        uint256 start_block;
        uint256 end_block;
        uint256 token_price;
    }

    mapping ( uint8 => ContractStage ) public StageByNumber;
    uint8 public ContractStageCount = 0;

    /*
    *   Addresses
    */
    address public deployerAddress;

    /*
    *   Internals
    */
    bool public initialized = false;
    bool public running = false;
    bool public frozen = false;
    bool public ended = false;

    enum Stages {
        DEPLOYED,
        INITIALIZED,
        SALE,
        RICO,
        ENDED,
        FROZEN
    }

    constructor() public {
        deployerAddress = msg.sender;
    }

    // fallback function
    function () external payable {
        this.commit();
    }

    function addSettings(
        address _TokenTrackerAddress,
        address _whitelistControllerAddress,
        uint256 _StartBlock,
        uint256 _AllocationBlockCount,
        uint256 _AllocationPrice,
        uint8   _StageCount,
        uint256 _StageBlockCount,
        uint256 _StagePriceIncrease
    )
        public
        onlyDeployer
        requireNotInitialized
    {
        // addresses
        TokenTrackerAddress = _TokenTrackerAddress;
        whitelistControllerAddress = _whitelistControllerAddress;

        // Allocation settings
        StartBlock = _StartBlock;
        AllocationBlockCount = _AllocationBlockCount;
        AllocationEndBlock = StartBlock + AllocationBlockCount;
        AllocationPrice = _AllocationPrice;

        StageBlockCount = _StageBlockCount;

        // first stage is allocation. Set it up.
        ContractStage storage StageRecord = StageByNumber[ContractStageCount];
        StageRecord.start_block = _StartBlock;
        StageRecord.end_block = _StartBlock + _AllocationBlockCount;
        StageRecord.token_price = _AllocationPrice;
        ContractStageCount++;

        uint256 lastStageBlockEnd = StageRecord.end_block;

        // calculate block ranges and set price for each period
        for(uint8 i = 1; i <= _StageCount; i++) {

            StageRecord = StageByNumber[ContractStageCount];
            StageRecord.start_block = lastStageBlockEnd + 1;
            StageRecord.end_block = lastStageBlockEnd + _StageBlockCount + 1;
            StageRecord.token_price = _AllocationPrice + ( _StagePriceIncrease * (i) );
            ContractStageCount++;

            lastStageBlockEnd = StageRecord.end_block;
        }

        EndBlock = lastStageBlockEnd;

        initialized = true;
    }

    function getCurrentPrice() public view returns ( uint256 ) {
        return StageByNumber[getCurrentStage()].token_price;
    }

    /*
        Do we want to normalise for gas usage ?!
        ( ie. add useless computation just to have the same gas used at all times ? )

        22023 - Case 1: lower than allocation end
        22797 - Case 2: lower than stage[X].end_block
        22813 - Case 3: exactly at stage[X].end_block

        Doing an interation and validating on each item range can go upto 37391 gas for 13 stages.
    */
    function getCurrentStage() public view returns ( uint8 ) {

        uint256 currentBlock = getCurrentBlockNumber();

        // if current is end block.. the user will get the correct
        // stage now but their new transaction will end up in the
        // next block which changes the stage vs what they've seen.
        // resulting in a different price..
        //
        // @TODO: decide how we want to handle this on the frontend,
        //        contract should always display proper data.
        //
        if ( currentBlock <= AllocationEndBlock ) {
            return 0;
        }

        uint256 num = (currentBlock - AllocationEndBlock) / (StageBlockCount + 1) + 1;

        // last block of each stage always computes as stage + 1
        if(StageByNumber[uint8(num)-1].end_block == currentBlock) {
            // save some gas and just return instead of decrementing.
            return uint8(num - 1);
        }

        return uint8(num);
    }

    /*
    *   Participants
    */
    struct Contribution {
        uint256 value;
        uint256 block;
    }

    struct Participant {
        bool   whitelisted;
        uint16  contributionsCount;
        mapping ( uint16 => Contribution ) contributions;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 ParticipantCount = 0;

    /*
    *   Investor commits funds
    */
    function commit()
        public
        payable
        requireRunning
        requireNotEnded
        requireNotFrozen
    {
        /*
        // require(isStarted() && notFrozen(), "");
        require(isWhitelisted(msg.sender), "Address is not whitelisted to participate");
        require(msg.value > 0, "Value must be higher than zero");

        // contribute first, then get whitelisted.

        ParticipantType storage newRecord = ParticipantsByAddress[_address];
        newRecord.whitelisted = true;
        ParticipantCount++;

        based on amount of blocks that passed, take the cut for the project
        */
    }

    /*
    *   Whitelisting
    */

    function whitelist(address _address) public {
        Participant storage newRecord = ParticipantsByAddress[_address];
        newRecord.whitelisted = true;
        ParticipantCount++;
    }

    function whitelistMultiple(address[] memory _address) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            this.whitelist(_address[i]);
        }
    }

    function isWhitelisted(address _address) public view returns ( bool ) {
        if(ParticipantsByAddress[_address].whitelisted == true) {
            return true;
        }
        return false;
    }

    /*
    * Refund ( ERC777TokensRecipient method )
    */
    function refund() public view returns (bool) {
        // 1. make sure we're receiving the correct tokens, else revert
        // 2. get current balance, and
    }

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    )
        external
        requireInitialized
        requireRunning
        requireNotFrozen
        requireNotEnded
    {
        // call internal refund method()
        this.refund();
    }

    /*
    *   Utils
    */
    // required so we can override when running tests
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
    }

    /*
    *   Modifiers
    */

    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "Only deployer can call this method");
        _;
    }

    modifier requireInitialized() {
        require(initialized == true, "Contract must be initialized");
        _;
    }

    modifier requireNotInitialized() {
        require(initialized == false, "Contract must not be initialized");
        _;
    }

    modifier requireRunning() {
        require(ended == true, "RICO must be running");
        _;
    }

    modifier requireNotRunning() {
        require(ended == false, "RICO must not be running");
        _;
    }

    modifier requireEnded() {
        require(ended == true, "RICO period must have ended");
        _;
    }

    modifier requireNotEnded() {
        require(ended == false, "RICO period must not have ended");
        _;
    }

    modifier requireFrozen() {
        require(frozen == true, "Contract must be frozen");
        _;
    }

    modifier requireNotFrozen() {
        require(frozen == false, "Contract must not be frozen");
        _;
    }

}