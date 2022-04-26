import { ethers } from 'ethers';

const networkId = 4; // process.env.NEXT_PUBLIC_NETWORK_ID
const networkName = ethers.providers.getNetwork(Number(networkId)).name;

export const Network = {
  id: Number(networkId),
  hexId: `0x${Number(networkId).toString(16)}`,
  name: networkName === 'homestead' ? 'mainnet' : networkName,
};
export const HTTPRPC = `https://eth-${Network.name}.alchemyapi.io/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`;
export const WSRPC = `ws://eth-${Network.name}.alchemyapi.io/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`;
