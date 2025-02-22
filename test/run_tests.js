async function runTests() {
  const Web3 = require("web3");
  let web3Instance, network;

  if (process.argv[3] == "coverage") {
    network = process.argv[3];
  } else {
    // Network name we're using to run the tests
    network = process.argv[4];
  }

  if (!network) {
    network = "development";
  }

  // load truffle config
  const truffleConfig = require("../truffle-config.js");

  let accounts;
  let networkConfig = truffleConfig.networks[network];

  if (truffleConfig.networks[network]) {
    web3Instance = await new Web3(truffleConfig.networks[network].provider());
    accounts = await web3Instance.eth.getAccounts();
  } else {
    console.log(
      "Specified Network [" + network + "] not found in truffle-config."
    );
    process.exit(1);
  }

  // global required by openzeppelin-test-helpers
  global.web3 = web3Instance;

  const {
    BN,
    constants,
    expectRevert,
    expectEvent
  } = require("openzeppelin-test-helpers");
  const { MAX_UINT256 } = constants;
  const web3util = require("web3-utils");
  const Table = require("cli-table");
  const utils = require("./helpers/utils");
  const safeUtils = require("./helpers/safeUtils");
  const { assert, expect } = require("chai");
  const { assertInvalidOpcode } = require("./helpers/assertThrow");

  utils.toLog(
    " ----------------------------------------------------------------\n" +
      "  Step 1 - Setting up helpers and globals \n" +
      "  ----------------------------------------------------------------"
  );

  const ether = 1000000000000000000; // 1 ether in wei
  const etherBN = new BN(ether.toString());

  const solidity = {
    ether: ether,
    etherBN: etherBN,
    gwei: 1000000000
  };

  // https://github.com/0xjac/ERC1820
  const ERC1820 = {
    RawTx:
      "0xf90a388085174876e800830c35008080b909e5608060405234801561001057600080fd5b506109c5806100206000396000f3fe608060405234801561001057600080fd5b50600436106100a5576000357c010000000000000000000000000000000000000000000000000000000090048063a41e7d5111610078578063a41e7d51146101d4578063aabbb8ca1461020a578063b705676514610236578063f712f3e814610280576100a5565b806329965a1d146100aa5780633d584063146100e25780635df8122f1461012457806365ba36c114610152575b600080fd5b6100e0600480360360608110156100c057600080fd5b50600160a060020a038135811691602081013591604090910135166102b6565b005b610108600480360360208110156100f857600080fd5b5035600160a060020a0316610570565b60408051600160a060020a039092168252519081900360200190f35b6100e06004803603604081101561013a57600080fd5b50600160a060020a03813581169160200135166105bc565b6101c26004803603602081101561016857600080fd5b81019060208101813564010000000081111561018357600080fd5b82018360208201111561019557600080fd5b803590602001918460018302840111640100000000831117156101b757600080fd5b5090925090506106b3565b60408051918252519081900360200190f35b6100e0600480360360408110156101ea57600080fd5b508035600160a060020a03169060200135600160e060020a0319166106ee565b6101086004803603604081101561022057600080fd5b50600160a060020a038135169060200135610778565b61026c6004803603604081101561024c57600080fd5b508035600160a060020a03169060200135600160e060020a0319166107ef565b604080519115158252519081900360200190f35b61026c6004803603604081101561029657600080fd5b508035600160a060020a03169060200135600160e060020a0319166108aa565b6000600160a060020a038416156102cd57836102cf565b335b9050336102db82610570565b600160a060020a031614610339576040805160e560020a62461bcd02815260206004820152600f60248201527f4e6f7420746865206d616e616765720000000000000000000000000000000000604482015290519081900360640190fd5b6103428361092a565b15610397576040805160e560020a62461bcd02815260206004820152601a60248201527f4d757374206e6f7420626520616e204552433136352068617368000000000000604482015290519081900360640190fd5b600160a060020a038216158015906103b85750600160a060020a0382163314155b156104ff5760405160200180807f455243313832305f4143434550545f4d4147494300000000000000000000000081525060140190506040516020818303038152906040528051906020012082600160a060020a031663249cb3fa85846040518363ffffffff167c01000000000000000000000000000000000000000000000000000000000281526004018083815260200182600160a060020a0316600160a060020a031681526020019250505060206040518083038186803b15801561047e57600080fd5b505afa158015610492573d6000803e3d6000fd5b505050506040513d60208110156104a857600080fd5b5051146104ff576040805160e560020a62461bcd02815260206004820181905260248201527f446f6573206e6f7420696d706c656d656e742074686520696e74657266616365604482015290519081900360640190fd5b600160a060020a03818116600081815260208181526040808320888452909152808220805473ffffffffffffffffffffffffffffffffffffffff19169487169485179055518692917f93baa6efbd2244243bfee6ce4cfdd1d04fc4c0e9a786abd3a41313bd352db15391a450505050565b600160a060020a03818116600090815260016020526040812054909116151561059a5750806105b7565b50600160a060020a03808216600090815260016020526040902054165b919050565b336105c683610570565b600160a060020a031614610624576040805160e560020a62461bcd02815260206004820152600f60248201527f4e6f7420746865206d616e616765720000000000000000000000000000000000604482015290519081900360640190fd5b81600160a060020a031681600160a060020a0316146106435780610646565b60005b600160a060020a03838116600081815260016020526040808220805473ffffffffffffffffffffffffffffffffffffffff19169585169590951790945592519184169290917f605c2dbf762e5f7d60a546d42e7205dcb1b011ebc62a61736a57c9089d3a43509190a35050565b600082826040516020018083838082843780830192505050925050506040516020818303038152906040528051906020012090505b92915050565b6106f882826107ef565b610703576000610705565b815b600160a060020a03928316600081815260208181526040808320600160e060020a031996909616808452958252808320805473ffffffffffffffffffffffffffffffffffffffff19169590971694909417909555908152600284528181209281529190925220805460ff19166001179055565b600080600160a060020a038416156107905783610792565b335b905061079d8361092a565b156107c357826107ad82826108aa565b6107b85760006107ba565b815b925050506106e8565b600160a060020a0390811660009081526020818152604080832086845290915290205416905092915050565b6000808061081d857f01ffc9a70000000000000000000000000000000000000000000000000000000061094c565b909250905081158061082d575080155b1561083d576000925050506106e8565b61084f85600160e060020a031961094c565b909250905081158061086057508015155b15610870576000925050506106e8565b61087a858561094c565b909250905060018214801561088f5750806001145b1561089f576001925050506106e8565b506000949350505050565b600160a060020a0382166000908152600260209081526040808320600160e060020a03198516845290915281205460ff1615156108f2576108eb83836107ef565b90506106e8565b50600160a060020a03808316600081815260208181526040808320600160e060020a0319871684529091529020549091161492915050565b7bffffffffffffffffffffffffffffffffffffffffffffffffffffffff161590565b6040517f01ffc9a7000000000000000000000000000000000000000000000000000000008082526004820183905260009182919060208160248189617530fa90519096909550935050505056fea165627a7a72305820377f4a2d4301ede9949f163f319021a6e9c687c292a5e2b2c4734c126b524e6c00291ba01820182018201820182018201820182018201820182018201820182018201820a01820182018201820182018201820182018201820182018201820182018201820",
    SenderAddress: "0xa990077c3205cbDf861e17Fa532eeB069cE9fF96",
    ContractAddress: "0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24",
    sig: {
      v: "0x1b", // 27
      r: "0x1820182018201820182018201820182018201820182018201820182018201820",
      s: "0x1820182018201820182018201820182018201820182018201820182018201820"
    },
    deploymentCost: solidity.ether * 0.08,

    // edit this to change "funds supplier address"
    FundsSupplierAddress: accounts[10],
    abi: [
      {
        constant: false,
        inputs: [
          { name: "_addr", type: "address" },
          { name: "_interfaceHash", type: "bytes32" },
          { name: "_implementer", type: "address" }
        ],
        name: "setInterfaceImplementer",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function"
      },
      {
        constant: true,
        inputs: [{ name: "_addr", type: "address" }],
        name: "getManager",
        outputs: [{ name: "", type: "address" }],
        payable: false,
        stateMutability: "view",
        type: "function"
      },
      {
        constant: false,
        inputs: [
          { name: "_addr", type: "address" },
          { name: "_newManager", type: "address" }
        ],
        name: "setManager",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function"
      },
      {
        constant: true,
        inputs: [{ name: "_interfaceName", type: "string" }],
        name: "interfaceHash",
        outputs: [{ name: "", type: "bytes32" }],
        payable: false,
        stateMutability: "pure",
        type: "function"
      },
      {
        constant: false,
        inputs: [
          { name: "_contract", type: "address" },
          { name: "_interfaceId", type: "bytes4" }
        ],
        name: "updateERC165Cache",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function"
      },
      {
        constant: true,
        inputs: [
          { name: "_addr", type: "address" },
          { name: "_interfaceHash", type: "bytes32" }
        ],
        name: "getInterfaceImplementer",
        outputs: [{ name: "", type: "address" }],
        payable: false,
        stateMutability: "view",
        type: "function"
      },
      {
        constant: true,
        inputs: [
          { name: "_contract", type: "address" },
          { name: "_interfaceId", type: "bytes4" }
        ],
        name: "implementsERC165InterfaceNoCache",
        outputs: [{ name: "", type: "bool" }],
        payable: false,
        stateMutability: "view",
        type: "function"
      },
      {
        constant: true,
        inputs: [
          { name: "_contract", type: "address" },
          { name: "_interfaceId", type: "bytes4" }
        ],
        name: "implementsERC165Interface",
        outputs: [{ name: "", type: "bool" }],
        payable: false,
        stateMutability: "view",
        type: "function"
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, name: "addr", type: "address" },
          { indexed: true, name: "interfaceHash", type: "bytes32" },
          { indexed: true, name: "implementer", type: "address" }
        ],
        name: "InterfaceImplementerSet",
        type: "event"
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, name: "addr", type: "address" },
          { indexed: true, name: "newManager", type: "address" }
        ],
        name: "ManagerChanged",
        type: "event"
      }
    ],
    instance: false
  };

  function toIntVal(val) {
    return parseInt(val);
  }

  // https://web3js.readthedocs.io/en/v1.2.1/web3.html#extend
  web3.extend({
    property: "evm",
    methods: [
      {
        name: "snapshot",
        call: "evm_snapshot",
        params: 0,
        outputFormatter: toIntVal
      },
      {
        name: "revert",
        call: "evm_revert",
        params: 1,
        inputFormatter: [toIntVal]
      }
    ]
  });

  const setup = {
    network: network,
    globals: {},
    helpers: {
      networkName: network,
      networkConfig: networkConfig,
      assertInvalidOpcode: assertInvalidOpcode,
      utils: utils,
      safeUtils: safeUtils,
      web3util: web3util,
      web3: web3,
      web3Instance: web3Instance,
      Table: Table,
      BN: BN,
      constants: constants,
      expectRevert: expectRevert,
      expectEvent: expectEvent,
      MAX_UINT256: MAX_UINT256,
      expect: expect,
      assert: assert,
      solidity: solidity,
      ERC1820: ERC1820,
      addresses: {
        ERC1820: "0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24",
        Token: null,
        Rico: null
      }
    },
    settings: {
      token: {
        name: "LYXeToken",
        symbol: "LYXe",
        decimals: 18,
        supply: new BN(100)
          .mul(
            // 100 milions
            new BN("10").pow(new BN("6"))
          )
          .mul(
            // 10^18 to account for decimals
            new BN("10").pow(new BN("18"))
          ),
        sale: new BN(15)
          .mul(
            // 15 milions
            new BN("10").pow(new BN("6"))
          )
          .mul(
            // 10^18 to account for decimals
            new BN("10").pow(new BN("18"))
          )
      }
    }
  };

  global.setup = setup;
  global.helpers = setup.helpers;
  global.accounts = accounts;
  global.assert = assert;

  const tests = [
    "external/SafeMath",
    "1_ERC1820",
    "2_ERC777_Token",
    "3_ERC20Token",
    "4_ReversibleICO",
    "5_Cancel",
    "5_Flows",
    "5_Contributions",
    // "6_Gnosis-Safe",
    "7_Website"
  ];

  utils.toLog(
    " ----------------------------------------------------------------\n" +
      "  Step 2 - Run tests \n" +
      "  ----------------------------------------------------------------"
  );

  if (tests.length > 0) {
    const Mocha = require("mocha");

    // Instantiate a Mocha instance.
    const mocha = new Mocha();

    mocha.useColors(true);
    mocha.slow(15);
    mocha.timeout(600000);

    for (let i = 0; i < tests.length; i++) {
      try {
        mocha.addFile("test/tests/" + tests[i] + ".js");
      } catch (e) {
        console.log("error:", e);
      }
    }

    // Run the tests.
    const runner = mocha.run(
      function(failures) {
        process.exitCode = failures ? 1 : 0; // exit with non-zero status if there were failures
      },
      true // delay execution of root suite until ready.
    );

    runner.on("end", e => {
      // display stats
      /*
            try {
                const initStats = require('./tests/stats.js');
                initStats(setup);
            } catch(e) {
                console.log("error:", e);
            }
            */

      console.log("Done");
      // terminate process
      process.exit(process.exitCode);
    });
  }
}

try {
  runTests();
} catch (e) {
  console.log("error:", e);
}
