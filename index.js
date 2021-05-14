require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");
const util = require("util");



var counter = 0;
const tick = async (config, binanceClient) => {
  const { base, spread, allocation, myAssetsDict } = config;

  // Fetch the current true market price (average on all crypto), binance is just one market!
  // I use https://www.coingecko.com for that goto ressources api -> https://www.coingecko.com/en/api
  // GET /simple/price
  //
  // we can for example not get the price from bitcoin against ether directly
  // we need first bitcoint against usd and after ether against usd
  // this we do for every crypto currency against usd
  let axiosGetArray = [];
  for (const [key, value] of Object.entries(config.myAssetsDict)) {
    axiosGetArray.push(
      axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${value}&vs_currencies=usd`
      )
    );
  }

  // API Call from all Cryptos and Build tradingObj
  const results = await Promise.all(axiosGetArray);
  const balances = await binanceClient.fetchBalance(); //returns us all balance for all crypto currencies

  let tradingObjArray = [];
  results.forEach((item, index) => {
    for (const [key, value] of Object.entries(item)) {
      if (value[Object.keys(value)]) {
        tradingObjArray.push({
          id: index,
          asset: Object.keys(myAssetsDict)[index],
          assetlong: Object.keys(value).join(),
          marketPrice:
            value[Object.keys(value)].usd / results[0].data.tether.usd,
          sellPrice:
            (value[Object.keys(value)].usd / results[0].data.tether.usd) *
            (1 + spread),
          buyPrice:
            (value[Object.keys(value)].usd / results[0].data.tether.usd) *
            (1 - spread),
          spread,
          assetBalance: balances.free[Object.keys(myAssetsDict)[index]],
          baseBalance: balances.free[base],
          sellVolume:
            balances.free[Object.keys(myAssetsDict)[index]] * allocation,
          buyVolume:
            (balances.free[base] * allocation) /
            (value[Object.keys(value)].usd / results[0].data.tether.usd),
          counter: counter + 1,

          //Todo:
          //why goes this.assetBalance not???
          //sellVolume: assetBalance * allocation,
          //buyVolume: (baseBalance * allocation) / marketPrice,
        });
      }
    }
  });
  const tradingObjArrayWihtoutStableCoins = tradingObjArray.slice(2);

  // In each Interation cancel all Orders from all myAssetsDict, then place Order and Log Output
  for (const [key, value] of Object.entries(
    tradingObjArrayWihtoutStableCoins
  )) {
    let {
      asset,
      sellVolume,
      sellPrice,
      buyVolume,
      buyPrice,
      marketPrice,
      assetBalance,
      baseBalance,
      counter,
    } = value;

    let market = `${asset}/${base}`;
    cancelAllOpenOrders({ market });

    // PlaceOrders: Attention: you need an intial balance (saldo) of bitcon to run your bot!!!!
    // https://github.com/ccxt/ccxt/wiki/Manual

    await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);

    console.log(`
        Market ${market}

        Created limit sell order for ${sellVolume}@${sellPrice}
        Create limit buy order for ${buyVolume}@${buyPrice}

        Debug-Values:
        marketPrice ${marketPrice}
        sellprice ${sellPrice}
        buyPrice ${buyPrice}
        assetBalance ${assetBalance}
        baseBalance ${baseBalance}
        sellVolume ${sellVolume}
        buyVolume ${buyVolume}
        Execution-count ${counter}

      `);
  }
  //console.log(util.inspect(balances, false, null, true /* enable colors */));
};


const cancelAllOpenOrders = async ({ market }) => {
    const orders = await binanceClient.fetchOpenOrders(market);
    orders.forEach(async (order) => {
      await binanceClient.cancelOrder(order.id, order.symbol); //for each order we already have we chancel it
    });
}

const sellAllCoinsCrash = async ({ binanceClient, config }) => {
  let { base } = config;
  const balances = await binanceClient.fetchBalance(); //returns us all balance for all crypto currencies

  //https://github.com/ccxt/ccxt/wiki/Manual#private-api
  const assetsMoreThan0 = [];
  for (const [key, value] of Object.entries(balances.free)) {
    if (value > 0) {
      //Attention: Only display one Wallet to Test createMarketSellOrder and createMarketBuyOrder!!!
      if (key == "SHIB") {
        assetsMoreThan0.push({
          asset: key,
          market: `${key}/${base}`,
          amount: value,
          status: "sell",
        });
      }
    }
  }

  Object.entries(assetsMoreThan0).forEach((item) => {
    const [key, value] = item;
    let { asset, market, amount, status } = value;

    // PlaceOrders: Attention: you need an intial balance (saldo) of bitcon to run your bot!!!!
    // https://github.com/ccxt/ccxt/wiki/Manual

    if (status === "sell") {
      console.log("MarketSellOrder!");
      //await binanceClient.createMarketSellOrder(market, amount)
    } else if (status == "buy") {
      console.log("MarketBuyOrder!");
      ////await binanceClient.createMarketBuyOrder(markt, amount)
    } else {
      console.log("undefinierter Status!");
    }

    console.log(
      `Asset: ${asset}, market: ${market}, amount: ${amount}, Status:${status}`
    );
  });
};

// API Keys and Global Configuration
const binanceClient = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
});
const config = {
  base: "USDT",
  allocation: 0.2, // percentage of your portfolio to allocate for each trade
  spread: 0.2, // ex. when bitcon is 10k, sellLimitOrder is 12k, limitBuyOrder is 8k
  tickInterval: 36000000, // every 2 seconds we evaluate our position, we are going to cancel buy and sell limit order of the previos stick and create new one
  myAssetsDict: {
    // Todo: Put Stable Conins and Other Broker in diffent Dict, be aware, the first 2 are stable coins, check slice function above!
    USDT: "tether",
    BUSD: "binance-usd",
    //ETH: "ethereum",
    //SOL: "solana",
    //BNB: "binancecoin",
    //ADA: "cardano",
    ICP: "internet-computer",
    REEF: "reef-finance",
    //NEO: "neo",

    //Todo: diffent Brocker Setup
    /*
    BTC: "bitcoin",
    CUDOS: "cudos",
    VRA: "verasity",
    SRM: "serum",
    RAY: "raydium",
    COPE: "cope",
    */
  },
};

const run = () => {
  // Todo: Setup Broker Cukow and FTX
  tick(config, binanceClient);
  setInterval(tick, config.tickInterval, config, binanceClient); // execute tick function in tickInterval(2s), and set arguments to pass into tick -> 'config, binanceClient' for each execution
};

run();
//sellAllCoinsCrash({ binanceClient, config });
