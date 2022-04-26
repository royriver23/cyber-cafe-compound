// To get a clearer idea on the sequencing of these steps,
// see https://github.com/compound-developers/compound-borrow-examples/blob/master/examples-js/ethers-js/borrow-erc20-with-eth-collateral.js

import PropTypes from 'prop-types';
import jwt from 'jsonwebtoken';
import {
  useMemo,
  useCallback,
  useEffect,
  createContext,
  useState,
} from 'react';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { ethers } from 'ethers';
import Web3Modal from 'web3modal';

import {
  Network,
  HTTPRPC,
} from 'utils/constants';
import abis from 'utils/contractAbis.json';

type ContractList = {
  [key: string]: ethers.Contract;
}

type BalanceList = {
  [key: string]: Number;
}

class CollateralFactorList {
  [key: string]: Number;
}

type PriceList = {
  [key: string]: Number;
}

type BorrowConditions = {
  liquidity?: Number;
  collateralFactors?: CollateralFactorList;
  maxAmountToBorrowDAI?: Number;
}

type ContextData = {
  signer: ethers.providers.JsonRpcSigner | null;
  address: string | null;
  contracts:  ContractList;
  networkError:   Boolean | string;
  provider:   ethers.providers.Web3Provider | null;
  networkId:  Number | null;
  web3:    any;
  connect: () => void;
  disconnect:   () => void;
  supplyEthCollateral: ( ) => Promise<void>;
  canBorrowDAI: (daiToBorrow: Number) => Promise<boolean>;
  borrowDAI: (daiToBorrow: Number) => Promise<boolean>;
  borrowConditions: BorrowConditions;
  balances:   BalanceList;
  prices:   PriceList;
  ens:  string | null;
  bearerToken:  string | null;
  isLoggedIn: boolean;
  isLoading:  boolean;
}

const initialContext = {
  signer: null,
  address: '',
  contracts:  {},
  networkError:   false,
  provider:   null,
  networkId:  null,
  web3:    null,
  connect() {},
  disconnect() {},
  supplyEthCollateral: async () => {},
  canBorrowDAI: async (daiToBorrow: Number) => { return false },
  borrowDAI: async (daiToBorrow: Number) => { return false },
  borrowConditions: {},
  balances:   {},
  prices:   {},
  ens:  null,
  bearerToken:  null,
  isLoggedIn: false,
  isLoading:  false,
};

const { cEthAbi, comptrollerAbi, priceFeedAbi, erc20Abi, cErcAbi } = abis;

const Web3Context = createContext<ContextData>(initialContext);

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      rpc: {
        [Network.id]: HTTPRPC,
      },
    },
  },
};

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  const [contextState, setContext] = useState<ContextData>(initialContext);
  const [web3Modal, setWeb3Modal] = useState<Web3Modal | null>(null);
  const [signer, setSigner] = useState<ethers.providers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractList>({});
  const [web3, setWeb3] = useState();
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [networkId, setNetworkId] = useState<Number | null>(null);
  const [networkError, setNetworkError] = useState<Boolean | string>(false);
  const [ens, setEns] = useState<string | null>(null);
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balances, setBalances] = useState({});
  const [prices, setPrices] = useState<PriceList>({});
  const [borrowConditions, setBorrowConditions] = useState<BorrowConditions>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setWeb3Modal(
      new Web3Modal({
        cacheProvider: true,
        providerOptions,
      }),
    );
  }, []);

  useEffect(() => {
    if (networkId && networkId !== Network.id) {
      setNetworkError(
        `Please switch to ${ethers.providers.getNetwork(Network.id).name}`,
      );
    } else {
      setNetworkError(false);
    }
  }, [networkId]);

  // Save JWT wallet sig (bearerToken) locally:
  useEffect(() => {
    /* eslint-disable no-undef */
    if (bearerToken) localStorage.setItem('bearerToken', bearerToken);
  }, [bearerToken]);

  // Read JWT wallet sig (bearerToken) on bootstrap:
  useEffect(() => {
    /* eslint-disable no-undef */
    const _bearerToken = localStorage.getItem('bearerToken');
    if (_bearerToken) setBearerToken(_bearerToken);
  }, []);

  // Reload token data whenever deps change:
  useEffect(() => {
    let active = true;

    const fetchToken = async () => {
      if (!address) return;
      try {
        // const balance = Number(await contracts.LvlV1.balanceOf(address))
        // if (active) setHasLvlToken(balance > 0)
      } catch (e) {
        // if (active) setHasLvlToken(false)
      }
    };

    const fetchEns = async () => {
      if (!address || !provider) return;
      const _ens = await provider.lookupAddress(address);
      if (active) setEns(_ens ?? null);
    };

    fetchToken();
    fetchEns();

    // Kill any async requests if deps change to avoid race conditions:
    return () => {
      active = false;
    };
  }, [networkId, address, provider]);

  const resetBearerToken = () => {
    setBearerToken(null);
    setIsLoggedIn(false);
    /* eslint-disable no-undef */
    localStorage.removeItem('bearerToken');
  };

  const promptSignature = async ({ _signer, _address }: { _signer: ethers.providers.JsonRpcSigner, _address: string }) => {
    const sig = await _signer.signMessage(
      `I am signing into rook as ${_address}`,
    );
    const _bearerToken = jwt.sign(
      { sig, address: _address },
      'rook', // public key
    );
    setBearerToken(_bearerToken);
  };

  // Sync Compound Liquidity
  const fetchPrices = async () => {
    let daiPriceInUSD = 0;
    let ethPriceInUSD = 0;

    try {
      daiPriceInUSD = await contracts.PriceFeed.price('DAI');
      ethPriceInUSD = await contracts.PriceFeed.price('ETH');
    } catch (error) {
      // TODO: price feed contract is not working great in Rinkeby
      // fallback to price provided as for 04/21/2022 for now in Staging
      // Check price calling https://etherscan.io/address/0x6d2299c48a8dd07a872fdd0f8233924872ad1071#readContract
      daiPriceInUSD = 1000379;
      ethPriceInUSD = 3387324249;
      console.error(error);
    }

    const currentPrices = {
      DAI: daiPriceInUSD / 1e6,
      ETH: ethPriceInUSD / 1e6,
    };
    // Price feed provides price in USD with 6 decimal places
    setPrices(currentPrices);
    return currentPrices;
  };

  const fetchBorrowConditions = async (currentPrices = prices) => {
    // Sync Collateral Factors
    const currentCollateralFactors = borrowConditions.collateralFactors ?? new CollateralFactorList();

    if (Object.keys(currentCollateralFactors).length === 0) {
      const { 1: cethCollateralFactor } = await contracts.Comptroller.markets(
        process.env.NEXT_PUBLIC_COMPOUND_CETH_NETWORK_ADDRESS,
      );
      currentCollateralFactors.CETH = (cethCollateralFactor / 1e18) * 100;

      const { 1: cDAIollateralFactor } = await contracts.Comptroller.markets(
        process.env.NEXT_PUBLIC_COMPOUND_CDAI_NETWORK_ADDRESS,
      );
      currentCollateralFactors.CDAI = (cDAIollateralFactor / 1e18) * 100;
    }

    // Sync Compound Liquidity
    // LIQUID assets (worth of USD) pooled in the protocol.
    let { 1: compoundLiquidityUSD } =
      await contracts.Comptroller.getAccountLiquidity(address);
    compoundLiquidityUSD = (+compoundLiquidityUSD / 1e18).toString();

    const currentBorrowConditions = {
      collateralFactors: currentCollateralFactors,
      liquidityUSD: compoundLiquidityUSD,
      maxAmountToBorrowDAI:
        (compoundLiquidityUSD / +currentPrices.DAI) *
        (+process.env.NEXT_PUBLIC_FIXED_COLLATERAL_FACTOR_PERCENTAGE / 100),
    };

    setBorrowConditions(currentBorrowConditions);
    return currentBorrowConditions;
  };

  // Sync Token Balances
  const fetchBalances = async () => {
    const _balances: BalanceList = {};

    if (provider && address) {
      const myWalletEthBalance = await provider.getBalance(address);
      const _cEthBalance = await contracts.CETH.balanceOf(address);
      const _cDAIBalance = await contracts.CDAI.balanceOf(address);
      const _DAIBalance = await contracts.DAI.balanceOf(address);
      _balances.ETH = +myWalletEthBalance / 1e18;
      _balances.CETH = _cEthBalance / 1e8;
      _balances.DAI = _DAIBalance / 1e18;
      _balances.CDAI = _cDAIBalance / 1e18;
    }


    console.log('balances =>', _balances);

    setBalances(_balances);
    return _balances;
  };

  const connect = useCallback(async () => {
    if (!web3Modal) {
      return;
    }

    const _web3 = await web3Modal.connect();
    const _provider = new ethers.providers.Web3Provider(_web3, 'any');
    const _signer = _provider.getSigner();
    const _address = await _signer.getAddress();
    const _network = await _provider.getNetwork();

    setProvider(_provider);
    setWeb3(_web3);
    setSigner(_signer);
    setNetworkId(_network.chainId);
    setAddress(_address);

    // Prompt user to sign login message (unless already cached):
    if (!bearerToken) {
      await promptSignature({ _signer, _address });
    }

    // Initialize contracts:
    setContracts({
      ...contracts,
      // Collateral Contracts
      CETH: new ethers.Contract(process.env.NEXT_PUBLIC_COMPOUND_CETH_NETWORK_ADDRESS, cEthAbi, _signer),
      CDAI: new ethers.Contract(process.env.NEXT_PUBLIC_COMPOUND_CDAI_NETWORK_ADDRESS, cErcAbi, _signer),
      // Borrowable Contracts, stable coins use standard ERC20 ABIs
      DAI: new ethers.Contract(process.env.NEXT_PUBLIC_COMPOUND_DAI_NETWORK_ADDRESS, erc20Abi, _signer),

      // Functional Compound Contract for collateral management
      Comptroller: new ethers.Contract(
        process.env.NEXT_PUBLIC_COMPTROLLER_ADDRESS,
        comptrollerAbi,
        _signer,
      ),
      // Functional Compound Contract for getting prices
      // (not using testnet (rinkeby in this case) is encouraged, instead mainnet fork)
      PriceFeed: new ethers.Contract(process.env.NEXT_PUBLIC_PRICE_FEED_ADDRESS, priceFeedAbi, _signer),
    });

    // Watch for provider network changes:
    _provider.on('network', newNetwork => {
      setNetworkId(newNetwork.chainId);
    });

    // Watch for wallet account change:
    _web3.on('accountsChanged', async () => {
      resetBearerToken();
      await promptSignature({ _signer, _address });
      setSigner(_provider.getSigner());
      setAddress(await _provider.getSigner().getAddress());
      setIsLoggedIn(true);
    });

    setIsLoggedIn(true);
  }, [bearerToken, contracts, web3Modal]);

  const fetchData = async () => {
    if (Object.keys(contracts).length) {
      const currentBalances = await fetchBalances();
      const currentPrices = await fetchPrices();
      const currentBorrowConditions = await fetchBorrowConditions(
        currentPrices,
      );

      console.table({
        balances: currentBalances,
        borrowConditions: {
          ...currentBorrowConditions,
          collateralFactors: JSON.stringify(
            currentBorrowConditions.collateralFactors,
          ),
        },
        prices: currentPrices,
      });
    }
  };

  useEffect(() => {
    if (Object.keys(contracts).length) {
      fetchData();
    }
  }, [contracts]);

  const disconnect = useCallback(async () => {
    if (!web3Modal) {
      return;
    }

    await web3Modal.clearCachedProvider();
    setProvider(null);
    setWeb3(undefined);
    setSigner(null);
    setNetworkId(null);
    setAddress(null);
    setContracts({});
    resetBearerToken();
  }, [web3Modal]);

  // STEP 1 - Supply Collateral - it's like an insurance of the loan. (Using ETH to start)
  // This will give us CETH in the compound protocol
  const supplyEthCollateral = useCallback(
    async (etherAmount = 1) => {
      if (isLoggedIn && contracts.CETH) {
        // Supplying ETH to the protocol as collateral (you will get cETH in return)
        await contracts.CETH.mint({
          value: (etherAmount * 1e18).toString(),
        });

        // An asset that is supplied to the protocol is not usable as collateral initially.
        // In order to inform the protocol that you wish to use an asset as collateral,
        // you must “enter the market” for that asset.
        const enterMarkets = await contracts.Comptroller.enterMarkets([
          process.env.NEXT_PUBLIC_COMPOUND_CETH_NETWORK_ADDRESS,
        ]);
        await enterMarkets.wait(1);

        // This will change your CETH balance within Compound protocol
        await fetchBalances();
      }
    },
    [isLoggedIn, contracts.CETH, contracts.Comptroller],
  );

  // STEP 2: Check whether user can borrow based on desired amount
  // If user has collateralized before, this could be STEP 1
  // Specific to DAI case for now
  const canBorrowDAI = useCallback(async (daiToBorrow: Number) => {
    if (isLoggedIn && borrowConditions.maxAmountToBorrowDAI) {
      return daiToBorrow < borrowConditions.maxAmountToBorrowDAI;
    }
    return false;
  }, [isLoggedIn, borrowConditions]);

  // STEP 3: Actually perform the borrow
  const borrowDAI = useCallback(
    async (daiToBorrow: Number) => {
      if (isLoggedIn && contracts.CDAI) {
        const scaledUpBorrowAmount = (+daiToBorrow * 1e18).toString();
        const trx = await contracts.CDAI.borrow(scaledUpBorrowAmount);
        await trx.wait(1);
        console.log('Borrow Transaction', trx);

        // This will change your wallet DAI balance
        await fetchData();

        return true;
      }
      return false;
    },
    [contracts.CDAI, isLoggedIn],
  );



  const memoizedData = useMemo(
    () => ({
      connect,
      disconnect,
      // STEP 1
      supplyEthCollateral,
      // STEP 2
      canBorrowDAI,
      // STEP 3
      borrowDAI,
      borrowConditions,
      balances,
      prices,
      signer,
      address,
      networkId,
      contracts,
      web3,
      networkError,
      provider,
      ens,
      bearerToken,
      isLoggedIn,
      isLoading,
    }),
    [
      signer,
      address,
      contracts,
      networkError,
      provider,
      networkId,
      web3,
      connect,
      disconnect,
      supplyEthCollateral,
      canBorrowDAI,
      borrowDAI,
      borrowConditions,
      balances,
      prices,
      ens,
      bearerToken,
      isLoggedIn,
      isLoading,
    ],
  );

  setContext(memoizedData);

  return (
    <Web3Context.Provider value={{ ...contextState }}>{children}</Web3Context.Provider>
  );
};

Web3Provider.propTypes = {
  children: PropTypes.element.isRequired,
};

export default Web3Context;
