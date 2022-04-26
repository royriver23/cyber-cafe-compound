// declare global env variable to define types
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_COMPOUND_CETH_NETWORK_ADDRESS: string,
      NEXT_PUBLIC_COMPOUND_CDAI_NETWORK_ADDRESS: string,
      NEXT_PUBLIC_COMPOUND_DAI_NETWORK_ADDRESS: string,
      NEXT_PUBLIC_COMPTROLLER_ADDRESS: string,
      NEXT_PUBLIC_PRICE_FEED_ADDRESS: string,
      NEXT_PUBLIC_FIXED_COLLATERAL_FACTOR_PERCENTAGE: string,
    }
  }
}

export { };
