import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import '@typechain/hardhat'
import * as dotenv from 'dotenv';
import deploymentConfig from "./scripts/deployment.config";
import { HardhatUserConfig } from "hardhat/config"
import 'hardhat-contract-sizer'
import 'hardhat-deploy'
import "solidity-coverage";
import "@nomicfoundation/hardhat-foundry";
dotenv.config();

function getNetworkUrl(name: string): string {
  return `https://${name}.infura.io/v3/${process.env.INFURA_ID}`
  // NOTE: To use WebSocket -> `wss://${name}.infura.io/ws/v3/${process.env.INFURA_ID}`
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.21",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  networks: {
    local: {
      url: `http://localhost:8545/rpc`
    },
    hardhat: {
      blockGasLimit: 30_000_000,
      chainId: 3604,
      initialBaseFeePerGas: 10 // Putting gas to low for coverage testing
    },
    goerli: {
      url: getNetworkUrl('goerli'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    sepolia: {
      url: getNetworkUrl('sepolia'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    polygonMumbai: {
      url: getNetworkUrl('polygon-mumbai'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    polygon: {
      url: getNetworkUrl('polygon-mainnet'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    optimism: {
      url: getNetworkUrl('optimism-mainnet'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    arbitrum: {
      url: getNetworkUrl('arbitrum-mainnet'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    zkSyncTestnet: {
      url: "https://testnet.era.zksync.dev",
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    avalanche: {
      url: getNetworkUrl('avalanche-mainnet'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    opBNB: {
      url: "https://opbnb-mainnet-rpc.bnbchain.org",
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    },
    base: {
      url: getNetworkUrl('base-mainnet'),
      accounts: [deploymentConfig.PRIVATE_KEY || ""],
    }
  },
  mocha: {
    timeout: 10000
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY
  }
};

export default config;
