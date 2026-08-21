/**
 * StockMint Launchpad Module — 完整部署 + Mint 参与
 * 从大泵-8.15 提取部署页完整功能（仅部署界面 + Mint 界面，无后台界面）。
 * 浏览器内 solc 0.8.26 编译 + 一键部署，主题适配当前金色股票 Mint 风格。
 * Uses ethers v6 from CDN (ES module)
 */
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/dist/ethers.min.js";

/* ================= 状态 ================= */
const state = {
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  compiled: null,
  burnTokenAbi: null,
  buybackProcessorAbi: null,
  launchpad: null,
  burnToken: null,
  launchpadAddress: "",
  mintLaunchpad: null
};

const ERC20_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const LAUNCH_STATUS = [
  "UNINITIALIZED",
  "PREPARED",
  "MINT_LIVE",
  "MINT_CLOSED",
  "FINALIZED",
  "LIQUIDITY_ADDED",
  "TRADING_OPENED"
];

const CHAIN_LABELS = {
  56: "BSC 主网",
  97: "BSC 测试网",
  1: "以太坊",
  288: "OKX / 其他"
};

const CHAIN_DEFAULTS = {
  56: {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    usdt: "0x55d398326f99059fF775485246999027B3197955"
  }
};

const FORM_DEFAULTS = {
  lpTotalSupply: "1000000",
  lpMintPrice: "0.01",
  lpTokenPerMint: "1000000",
  lpMaxMintCount: "1",
  lpMaxMintPerWallet: "1",
  lpUserReceiveShare: "50",
  lpUserReceiveFixed: "500000",
  lpLpFundShare: "100",
  lpLpTokenFixed: "0",
  lpLpTokenShare: "50"
};

const $ = (id) => document.getElementById(id);

function log(message) {
  const box = $("lpDeployLog");
  if (!box) return;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  box.textContent = `[${time}] ${message}\n${box.textContent}`;
}

function logMint(message) {
  const box = $("lpMintLog");
  if (box) box.textContent = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${message}\n${box.textContent}`;
  log(message);
}

function safeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function toBpsFromPercent(value) {
  return Math.round(safeNumber(value) * 100);
}

function parseTokenUnits(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0n;
  return ethers.parseUnits(raw, 18);
}

function toTimestamp(value) {
  if (!value) return 0n;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 0n;
  return BigInt(Math.floor(ms / 1000));
}

function formatAddress(address) {
  if (!address || address === ethers.ZeroAddress) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDateTime(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN");
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function getNetworkLabel(chainId) {
  return CHAIN_LABELS[chainId] || `Chain ${chainId}`;
}

function getExplorerBase(chainId) {
  if (chainId === 56) return "https://bscscan.com/address/";
  if (chainId === 97) return "https://testnet.bscscan.com/address/";
  return "";
}

/* ================= 钱包 ================= */
function setWalletUi() {
  const ws = $("lpWalletStatus");
  const ns = $("lpNetworkStatus");
  const btn = $("lpConnectWallet");
  if (ws) ws.textContent = state.account ? formatAddress(state.account) : "未连接";
  if (ns) ns.textContent = state.chainId ? `网络: ${getNetworkLabel(state.chainId)} (${state.chainId})` : "网络: 未知";
  if (btn) {
    btn.classList.toggle("connected", !!state.account);
    btn.innerHTML = state.account
      ? `<span class="lp-wallet-dot"></span> ${formatAddress(state.account)}`
      : `<span class="lp-wallet-dot"></span> 连接钱包`;
  }
}

function setIfEmpty(id, value) {
  const el = $(id);
  if (!el || !value) return;
  if (!el.value.trim()) el.value = value;
}

function setNumericInputValue(id, value) {
  const el = $(id);
  if (!el) return;
  const normalized = Number.isFinite(value) ? String(Math.max(0, Math.floor(value))) : "0";
  el.value = normalized;
}

function applyFormDefaults() {
  Object.entries(FORM_DEFAULTS).forEach(([id, value]) => setIfEmpty(id, value));
}

function updateDefaultsHint() {
  const hint = $("lpDefaultsHint");
  if (!hint) return;
  const defaults = CHAIN_DEFAULTS[state.chainId];
  if (!defaults) {
    hint.textContent = "当前网络没有内置默认地址，请手动填写 Router 和 QuoteToken。";
    return;
  }
  hint.textContent = $("lpMintMode").value === "USDT"
    ? `已按 ${getNetworkLabel(state.chainId)} 默认填入 Pancake V2 Router 和 USDT`
    : `已按 ${getNetworkLabel(state.chainId)} 默认填入 Pancake V2 Router 和 WBNB`;
}

function applySuggestedDefaults() {
  if (!state.account) return;
  setIfEmpty("lpOperator", state.account);
  setIfEmpty("lpTaxProcessor", state.account);
  setIfEmpty("lpStairReceiver", state.account);

  const defaults = CHAIN_DEFAULTS[state.chainId];
  if (!defaults) {
    updateDefaultsHint();
    return;
  }

  setIfEmpty("lpRouter", defaults.router);
  const quoteEl = $("lpQuoteToken");
  if (quoteEl && !quoteEl.value.trim()) {
    quoteEl.value = $("lpMintMode").value === "USDT" ? defaults.usdt : defaults.wbnb;
  }
  updateDefaultsHint();
}

function showAddressLink(targetId, address) {
  const el = $(targetId);
  if (!el) return;
  const base = getExplorerBase(state.chainId);
  el.value = address && base ? `${address}  |  ${base}${address}` : (address || "");
}

/* ================= 税阶段 ================= */
function buildTaxPhasesFromInputs() {
  const phases = [];
  for (let i = 1; i <= 3; i += 1) {
    const end = safeNumber($(`lpTaxPhase${i}End`)?.value);
    const buy = safeNumber($(`lpTaxPhase${i}Buy`)?.value);
    const sell = safeNumber($(`lpTaxPhase${i}Sell`)?.value);
    if (end > 0) {
      phases.push({ endAfterSeconds: end, buyTaxPercent: buy, sellTaxPercent: sell });
    }
  }
  return phases;
}

function syncTaxPhasesJson() {
  const box = $("lpTaxPhasesJson");
  if (!box) return;
  const phases = buildTaxPhasesFromInputs();
  box.value = JSON.stringify(phases, null, 2);
}

function parseTaxPhases() {
  if ($("lpTaxPhase1End")) {
    const phases = buildTaxPhasesFromInputs();
    let previousEnd = 0;
    return phases.map((item, index) => {
      const endAfterSeconds = Number(item.endAfterSeconds || 0);
      const buyPercent = item.buyTaxPercent ?? 0;
      const sellPercent = item.sellTaxPercent ?? 0;
      if (!Number.isFinite(endAfterSeconds) || endAfterSeconds <= 0) {
        throw new Error(`税阶段第 ${index + 1} 档结束秒数无效`);
      }
      if (endAfterSeconds <= previousEnd) {
        throw new Error(`税阶段第 ${index + 1} 档结束秒数必须递增`);
      }
      previousEnd = endAfterSeconds;
      return { endAfterSeconds, buyTaxBps: toBpsFromPercent(buyPercent), sellTaxBps: toBpsFromPercent(sellPercent) };
    });
  }

  const raw = $("lpTaxPhasesJson").value.trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("税阶段 JSON 格式不正确");
  }
  if (!Array.isArray(parsed)) throw new Error("税阶段 JSON 必须是数组");
  return parsed.map((item, index) => {
    const endAfterSeconds = Number(item.endAfterSeconds || 0);
    const buyPercent = item.buyTaxPercent ?? item.buyTax ?? item.buyPercent ?? 0;
    const sellPercent = item.sellTaxPercent ?? item.sellTax ?? item.sellPercent ?? 0;
    if (!Number.isFinite(endAfterSeconds)) throw new Error(`税阶段第 ${index + 1} 档 endAfterSeconds 无效`);
    return { endAfterSeconds, buyTaxBps: toBpsFromPercent(buyPercent), sellTaxBps: toBpsFromPercent(sellPercent) };
  });
}

/* ================= 配置收集 ================= */
function enumMintMode() {
  return $("lpMintMode").value === "USDT" ? 1 : 0;
}
function enumUserReceiveMode() {
  return $("lpUserReceiveMode").value === "FIXED" ? 1 : 0;
}
function enumLpTokenMode() {
  return { REMAINING: 0, FIXED_AMOUNT: 1, FIXED_SHARE: 2 }[$("lpLpTokenMode").value];
}
function enumLpReceiverMode() {
  return { DEPLOYER: 0, LAUNCH_OPERATOR: 1, CUSTOM: 2 }[$("lpLpReceiverMode").value];
}

function gatherTokenInitParams() {
  return {
    name: $("lpTokenName").value.trim(),
    symbol: $("lpTokenSymbol").value.trim(),
    totalSupply: parseTokenUnits($("lpTotalSupply").value),
    dexPair: $("lpPair").value.trim() || ethers.ZeroAddress,
    taxProcessor: $("lpTaxProcessor").value.trim() || state.account || "",
    pancakeV2Router: $("lpRouter").value.trim(),
    poolQuoteToken: $("lpQuoteToken").value.trim(),
    stairTaxReceiver: $("lpStairReceiver").value.trim() || state.account || "",
    launchType: Number($("lpLaunchType").value || 0),
    tradingOpenTime: toTimestamp($("lpTradingOpenTime").value),
    normalBuyTaxBps: toBpsFromPercent($("lpNormalBuyTax").value),
    normalSellTaxBps: toBpsFromPercent($("lpNormalSellTax").value),
    poolBurnBpsPerHour: toBpsFromPercent($("lpPoolBurnPerHour").value),
    minPoolTokenBalance: parseTokenUnits($("lpMinPoolBalance").value),
    taxPhases: parseTaxPhases()
  };
}

function gatherLaunchConfig() {
  return {
    implementation: $("lpImplementation").value.trim(),
    launchOperator: $("lpOperator").value.trim() || state.account || "",
    mintWhitelistEnabled: $("lpMintWlEnabled").value === "true",
    mintWhitelistAddresses: parseAddressLines($("lpMintWlList").value || ""),
    buybackConfig: {
      enabled: $("lpBuybackEnabled")?.value === "true",
      processorAddress: $("lpBuybackProcessor")?.value.trim() || "",
      intervalSeconds: Number($("lpBuybackInterval")?.value || 0),
      spendAmount: parseTokenUnits($("lpBuybackSpend")?.value || 0),
      maxTaxSwapAmount: parseTokenUnits($("lpBuybackMaxSwap")?.value || 0),
      onlyOnSell: $("lpBuybackOnlySell")?.value !== "false"
    },
    mintConfig: {
      mintMode: enumMintMode(),
      mintPrice: ethers.parseUnits(String($("lpMintPrice").value || 0), 18),
      tokenPerMint: parseTokenUnits($("lpTokenPerMint").value),
      maxMintCount: BigInt($("lpMaxMintCount").value || 0),
      maxMintPerWallet: BigInt($("lpMaxMintPerWallet").value || 0),
      mintStartTime: 0n,
      oneWalletOneMint: $("lpOneWalletOnce").value === "true",
      autoFinishOnSoldOut: $("lpAutoFinish").value === "true"
    },
    deliveryConfig: {
      userReceiveMode: enumUserReceiveMode(),
      userReceiveShareBps: toBpsFromPercent($("lpUserReceiveShare").value),
      userReceiveFixedAmount: parseTokenUnits($("lpUserReceiveFixed").value)
    },
    liquidityConfig: {
      lpFundShareBps: toBpsFromPercent($("lpLpFundShare").value),
      lpTokenMode: enumLpTokenMode(),
      lpTokenShareBps: toBpsFromPercent($("lpLpTokenShare").value),
      lpTokenFixedAmount: parseTokenUnits($("lpLpTokenFixed").value),
      lpReceiverMode: enumLpReceiverMode(),
      customLpReceiver: $("lpCustomLpReceiver").value.trim() || ethers.ZeroAddress
    }
  };
}

function validateDeployInput(tokenParams, cfg) {
  if (!tokenParams.name) throw new Error("代币名称不能为空");
  if (!tokenParams.symbol) throw new Error("代币符号不能为空");
  if (tokenParams.totalSupply <= 0n) throw new Error("总供应量必须大于 0");
  if (cfg.implementation && !ethers.isAddress(cfg.implementation)) throw new Error("BurnToken 实现地址无效");
  if (!ethers.isAddress(tokenParams.pancakeV2Router)) throw new Error("Router 地址无效");
  if (!ethers.isAddress(tokenParams.poolQuoteToken)) throw new Error("QuoteToken 地址无效");
  if (!ethers.isAddress(tokenParams.taxProcessor)) throw new Error("税处理地址无效");
  if (!ethers.isAddress(tokenParams.stairTaxReceiver)) throw new Error("阶梯税接收地址无效");
  if (tokenParams.dexPair !== ethers.ZeroAddress && !ethers.isAddress(tokenParams.dexPair)) {
    throw new Error("Pair 地址无效");
  }
  if (cfg.mintConfig.mintPrice <= 0n) throw new Error("Mint 价格必须大于 0");
  if (cfg.mintConfig.maxMintCount <= 0n) throw new Error("最大 Mint 份数必须大于 0");
  if (cfg.mintConfig.maxMintPerWallet <= 0n) throw new Error("单钱包最大 Mint 次数必须大于 0");
  if (cfg.mintConfig.maxMintPerWallet > cfg.mintConfig.maxMintCount) {
    throw new Error("单钱包最大 Mint 次数不能大于最大 Mint 份数");
  }
  if (cfg.deliveryConfig.userReceiveMode === 0 && cfg.deliveryConfig.userReceiveShareBps <= 0) {
    throw new Error("按比例到账时，用户到账比例必须大于 0");
  }
  if (cfg.deliveryConfig.userReceiveMode === 1 && cfg.deliveryConfig.userReceiveFixedAmount <= 0n) {
    throw new Error("固定到账数量必须大于 0");
  }
  cfg.mintWhitelistAddresses.forEach((address) => {
    if (!ethers.isAddress(address)) throw new Error(`Mint 白名单地址无效: ${address}`);
  });
  if (cfg.buybackConfig?.enabled) {
    if (cfg.buybackConfig.processorAddress && !ethers.isAddress(cfg.buybackConfig.processorAddress)) {
      throw new Error("回购处理器地址无效");
    }
    if (!Number.isFinite(cfg.buybackConfig.intervalSeconds) || cfg.buybackConfig.intervalSeconds <= 0) {
      throw new Error("回购间隔秒数必须大于 0");
    }
    if (cfg.buybackConfig.spendAmount <= 0n) throw new Error("单次回购花费数量必须大于 0");
  }

  const plan = buildMintPlan();
  const errors = plan.checks.filter((item) => item.level === "error");
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join("；"));
  }
}

/* ================= Mint 计划预览 ================= */
function buildMintPlan() {
  const mintPrice = safeNumber($("lpMintPrice").value);
  const maxMintCount = safeNumber($("lpMaxMintCount").value);
  const tokenPerMint = safeNumber($("lpTokenPerMint").value);
  const totalSupply = safeNumber($("lpTotalSupply").value);
  const receiveMode = $("lpUserReceiveMode").value;
  const userReceiveShare = safeNumber($("lpUserReceiveShare").value);
  const userReceiveFixedAmount = safeNumber($("lpUserReceiveFixed").value);
  const lpFundShare = safeNumber($("lpLpFundShare").value);
  const lpTokenMode = $("lpLpTokenMode").value;
  const lpTokenFixedAmount = safeNumber($("lpLpTokenFixed").value);
  const lpTokenShare = safeNumber($("lpLpTokenShare").value);
  const maxMintPerWallet = safeNumber($("lpMaxMintPerWallet").value);
  const oneWalletOneMint = $("lpOneWalletOnce").value === "true";
  const mintBasePerShare = maxMintCount > 0 ? Math.floor(totalSupply / maxMintCount) : 0;
  const mintRemainder = maxMintCount > 0 ? Math.max(totalSupply - (mintBasePerShare * maxMintCount), 0) : 0;

  const totalRaise = mintPrice * maxMintCount;
  const mintCoverage = tokenPerMint * maxMintCount;
  const userPerMint = receiveMode === "FIXED" ? userReceiveFixedAmount : tokenPerMint * (userReceiveShare / 100);
  const userTotal = userPerMint * maxMintCount;
  const lpFunds = totalRaise * (lpFundShare / 100);

  let lpTokens = 0;
  if (lpTokenMode === "FIXED_AMOUNT") {
    lpTokens = lpTokenFixedAmount;
  } else if (lpTokenMode === "FIXED_SHARE") {
    lpTokens = totalSupply * (lpTokenShare / 100);
  } else {
    lpTokens = Math.max(totalSupply - userTotal, 0);
  }

  const reserved = Math.max(totalSupply - userTotal - lpTokens, 0);
  const checks = [];

  if (oneWalletOneMint && maxMintPerWallet !== 1) {
    checks.push({ level: "warn", message: "已开启一钱包一次，单钱包最大 Mint 次数建议固定为 1。" });
  }
  if (userPerMint <= 0) checks.push({ level: "error", message: "用户单次到账数量必须大于 0。" });
  if (receiveMode === "PROPORTIONAL" && userReceiveShare > 100) checks.push({ level: "error", message: "用户到账比例不能超过 100%。" });
  if (lpFundShare > 100) checks.push({ level: "error", message: "募集资金进池比例不能超过 100%。" });
  if (lpTokenMode === "FIXED_SHARE" && lpTokenShare > 100) checks.push({ level: "error", message: "进池代币比例不能超过 100%。" });
  if (maxMintPerWallet > maxMintCount && maxMintCount > 0) checks.push({ level: "error", message: "单钱包最大 Mint 次数不能大于最大 Mint 份数。" });
  if (receiveMode === "FIXED" && tokenPerMint > 0 && userReceiveFixedAmount > tokenPerMint) {
    checks.push({ level: "error", message: "固定到账数量不能大于单次 Mint 计数代币。" });
  }
  if (lpTokenMode === "FIXED_AMOUNT" && lpTokenFixedAmount > totalSupply) checks.push({ level: "error", message: "进池代币固定数量不能大于总供应量。" });
  if (lpTokenMode === "FIXED_AMOUNT" && lpTokenFixedAmount > mintCoverage && mintCoverage > 0) {
    checks.push({ level: "warn", message: "进池代币固定数量已大于 Mint 覆盖代币，请确认这是你想要的配置。" });
  }
  if (mintCoverage > 0 && userTotal > mintCoverage) {
    checks.push({ level: "error", message: "用户总代币已超过 Mint 覆盖代币，请增大单次 Mint 计数代币或减少份数。" });
  }
  if (userTotal + lpTokens > totalSupply) {
    checks.push({ level: "error", message: "用户总代币 + LP 代币 已超过总供应量，请调整到账或 LP 配置。" });
  }
  if (mintCoverage > totalSupply) checks.push({ level: "warn", message: "Mint 覆盖代币大于总供应量，虽然不一定报错，但配置含义容易混乱。" });
  if (mintRemainder > 0) {
    checks.push({
      level: "warn",
      message: `当前总供应量不能被最大 Mint 份数整除：每份按 ${mintBasePerShare} 计算，余数 ${mintRemainder} 会留在剩余预留中。`
    });
  }
  if (lpTokenMode === "REMAINING" && Math.abs((userTotal + lpTokens) - totalSupply) < 0.0000001 && totalSupply > 0) {
    checks.push({ level: "ok", message: "当前进池代币模式为按剩余代币，用户到账后剩下的代币会全部用于 LP。" });
  }
  if (!checks.length) {
    checks.push({ level: "ok", message: "参数联动校验通过：用户到账、LP 代币、总供应量之间没有发现明显冲突。" });
  }

  return {
    totalRaise, mintCoverage, userPerMint, userTotal, lpFunds, lpTokens, reserved, mintRemainder, checks
  };
}

function renderPreviewChecks(checks) {
  const container = $("lpPreviewChecks");
  if (!container) return;
  container.innerHTML = "";
  checks.forEach((item) => {
    const line = document.createElement("div");
    line.className = `lp-check-item ${item.level}`;
    line.textContent = item.message;
    container.appendChild(line);
  });
}

function autoSyncLinkedFields() {
  const totalSupply = safeNumber($("lpTotalSupply").value);
  const maxMintCount = safeNumber($("lpMaxMintCount").value);
  const userReceiveShare = safeNumber($("lpUserReceiveShare").value);
  const receiveMode = $("lpUserReceiveMode").value;
  const lpTokenMode = $("lpLpTokenMode").value;

  if (totalSupply > 0 && maxMintCount > 0) {
    const tokenPerMint = Math.floor(totalSupply / maxMintCount);
    setNumericInputValue("lpTokenPerMint", tokenPerMint);

    if (receiveMode === "PROPORTIONAL") {
      setNumericInputValue("lpUserReceiveFixed", Math.floor(tokenPerMint * (userReceiveShare / 100)));
    } else {
      const currentFixed = safeNumber($("lpUserReceiveFixed").value);
      if (currentFixed <= 0 || currentFixed > tokenPerMint) {
        setNumericInputValue("lpUserReceiveFixed", tokenPerMint);
      }
    }

    const syncedTokenPerMint = safeNumber($("lpTokenPerMint").value);
    const syncedUserPerMint = receiveMode === "FIXED"
      ? safeNumber($("lpUserReceiveFixed").value)
      : syncedTokenPerMint * (userReceiveShare / 100);
    const remainingForLp = Math.max(totalSupply - (syncedUserPerMint * maxMintCount), 0);

    if (lpTokenMode === "FIXED_AMOUNT" || lpTokenMode === "REMAINING") {
      setNumericInputValue("lpLpTokenFixed", remainingForLp);
    }
  }
}

function syncConfigDependencies() {
  const oneWalletOneMint = $("lpOneWalletOnce").value === "true";
  const maxMintPerWallet = $("lpMaxMintPerWallet");
  if (oneWalletOneMint) {
    maxMintPerWallet.value = "1";
    maxMintPerWallet.disabled = true;
  } else {
    maxMintPerWallet.disabled = false;
  }

  const receiveMode = $("lpUserReceiveMode").value;
  $("lpUserReceiveShare").disabled = receiveMode !== "PROPORTIONAL";
  $("lpUserReceiveFixed").disabled = receiveMode !== "FIXED";

  const lpTokenMode = $("lpLpTokenMode").value;
  $("lpLpTokenFixed").disabled = lpTokenMode !== "FIXED_AMOUNT";
  $("lpLpTokenShare").disabled = lpTokenMode !== "FIXED_SHARE";

  const lpReceiverMode = $("lpLpReceiverMode").value;
  $("lpCustomLpReceiver").disabled = lpReceiverMode !== "CUSTOM";
}

function calcPreview() {
  syncConfigDependencies();
  const plan = buildMintPlan();

  $("lpPreviewRaise").textContent = String(plan.totalRaise || 0);
  $("lpPreviewMintCoverage").textContent = String(plan.mintCoverage || 0);
  $("lpPreviewUserTokens").textContent = String(plan.userTotal || 0);
  $("lpPreviewLpFunds").textContent = String(plan.lpFunds || 0);
  $("lpPreviewLpTokens").textContent = String(plan.lpTokens || 0);
  $("lpPreviewReserved").textContent = String(plan.reserved || 0);
  $("lpPreviewLpReceiver").textContent = $("lpLpReceiverMode").selectedOptions[0].textContent;
  $("lpPreviewUserPerMint").textContent = String(plan.userPerMint || 0);
  renderPreviewChecks(plan.checks);
}

/* ================= 钱包连接 ================= */
async function connectWallet(forceRequest = false) {
  if (!window.ethereum) {
    throw new Error("未检测到浏览器钱包，请使用 MetaMask / OKX / TokenPocket 钱包");
  }
  const method = forceRequest ? "eth_requestAccounts" : "eth_accounts";
  const accounts = await window.ethereum.request({ method });

  if (!accounts?.length) {
    state.provider = null;
    state.signer = null;
    state.account = null;
    state.chainId = null;
    setWalletUi();
    updateDefaultsHint();
    return false;
  }

  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const network = await state.provider.getNetwork();
  state.chainId = Number(network.chainId);
  setWalletUi();
  applySuggestedDefaults();
  return true;
}

async function ensureWallet() {
  const ok = await connectWallet(false);
  if (ok) return;
  const requested = await connectWallet(true);
  if (!requested) throw new Error("钱包未连接");
}

/* ================= 浏览器内编译 ================= */
function compileWithWorker(input) {
  const workerCode = `
    import solc from "https://esm.sh/solc@0.8.26";
    self.onmessage = (event) => {
      try {
        const output = solc.compile(JSON.stringify(event.data), {
          import: (path) => ({ error: "Missing import " + path })
        });
        self.postMessage({ ok: true, output });
      } catch (error) {
        self.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    };
  `;
  const blob = new Blob([workerCode], { type: "text/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl, { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      if (event.data.ok) resolve(JSON.parse(event.data.output));
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error(event.message || "Solidity 编译器工作线程失败"));
    };
    worker.postMessage(input);
  });
}

async function compileLaunchpad() {
  if (state.compiled) return state.compiled;
  log("开始编译 Launchpad + BurnToken...");
  const launchpadSource = await fetch("./DBurnMintLaunchpad.sol").then((r) => r.text());
  const burnTokenSource = await fetch("./BurnToken.sol").then((r) => r.text());
  const buybackProcessorSource = await fetch("./BuybackBurnProcessor.sol").then((r) => r.text());
  const input = {
    language: "Solidity",
    sources: {
      "DBurnMintLaunchpad.sol": { content: launchpadSource },
      "BurnToken.sol": { content: burnTokenSource },
      "BuybackBurnProcessor.sol": { content: buybackProcessorSource }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  };
  const output = await compileWithWorker(input);
  if (output.errors?.length) {
    const fatal = output.errors.filter((item) => item.severity === "error");
    if (fatal.length) {
      throw new Error(fatal.map((item) => item.formattedMessage).join("\n"));
    }
  }
  const contract = output.contracts["DBurnMintLaunchpad.sol"].DBurnMintLaunchpad;
  const burnToken = output.contracts["BurnToken.sol"].BurnToken;
  const buybackProcessor = output.contracts["BuybackBurnProcessor.sol"].BuybackBurnProcessor;
  state.compiled = {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    burnTokenAbi: burnToken.abi,
    burnTokenBytecode: `0x${burnToken.evm.bytecode.object}`,
    buybackProcessorAbi: buybackProcessor.abi,
    buybackProcessorBytecode: `0x${buybackProcessor.evm.bytecode.object}`
  };
  state.burnTokenAbi = burnToken.abi;
  state.buybackProcessorAbi = buybackProcessor.abi;
  log(`编译完成：Launchpad ABI ${contract.abi.length} 项，BurnToken ABI ${burnToken.abi.length} 项，Buyback ABI ${buybackProcessor.abi.length} 项`);
  return state.compiled;
}

async function loadBurnTokenAbi() {
  if (state.burnTokenAbi) return state.burnTokenAbi;
  await compileLaunchpad();
  return state.burnTokenAbi;
}

async function getLaunchpad(address, writable = false) {
  const compiled = await compileLaunchpad();
  const runner = writable ? state.signer : (state.signer || state.provider);
  return new ethers.Contract(address, compiled.abi, runner);
}

async function getBurnToken(address, writable = false) {
  const abi = await loadBurnTokenAbi();
  const runner = writable ? state.signer : (state.signer || state.provider);
  return new ethers.Contract(address, abi, runner);
}

async function getBuybackProcessor(address, writable = false) {
  const compiled = await compileLaunchpad();
  const runner = writable ? state.signer : (state.signer || state.provider);
  return new ethers.Contract(address, compiled.buybackProcessorAbi, runner);
}

/* ================= 部署 ================= */
function fillDeploymentResult(launchpadAddress, tokenAddress, buybackProcessorAddress = "") {
  const origin = window.location.origin + window.location.pathname;
  const mintLink = `${origin}#deploy-mint`;
  showAddressLink("lpResultLaunchpad", launchpadAddress);
  showAddressLink("lpResultToken", tokenAddress);
  if ($("lpResultBuyback")) {
    showAddressLink("lpResultBuyback", buybackProcessorAddress || "");
  }
  $("lpResultMintLink").value = mintLink;
  $("lpMintLaunchpad").value = launchpadAddress;
  $("lpDeployBadge").textContent = "已部署";
  $("lpDeployBadge").classList.add("done");
}

async function deployLocalBurnTokenImplementation() {
  const compiled = await compileLaunchpad();
  log("请在钱包中确认部署本地 BurnToken 实现...");
  const factory = new ethers.ContractFactory(compiled.burnTokenAbi, compiled.burnTokenBytecode, state.signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const implementationAddress = await contract.getAddress();
  $("lpImplementation").value = implementationAddress;
  log(`本地 BurnToken 实现已部署: ${implementationAddress}`);
  return implementationAddress;
}

async function deployFreshBurnToken() {
  const compiled = await compileLaunchpad();
  log("请在钱包中确认部署主 Token 合约...");
  const factory = new ethers.ContractFactory(compiled.burnTokenAbi, compiled.burnTokenBytecode, state.signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const tokenAddress = await contract.getAddress();
  log(`主 Token 合约已部署: ${tokenAddress}`);
  return tokenAddress;
}

async function deployBuybackProcessor(routerAddress) {
  const compiled = await compileLaunchpad();
  log("请在钱包中确认部署自动回购销毁处理器...");
  const factory = new ethers.ContractFactory(compiled.buybackProcessorAbi, compiled.buybackProcessorBytecode, state.signer);
  const contract = await factory.deploy(state.account, routerAddress);
  await contract.waitForDeployment();
  const processorAddress = await contract.getAddress();
  if ($("lpBuybackProcessor")) $("lpBuybackProcessor").value = processorAddress;
  log(`自动回购销毁处理器已部署: ${processorAddress}`);
  return processorAddress;
}

async function deployLaunchpad() {
  await ensureWallet();
  state.compiled = null;
  const compiled = await compileLaunchpad();
  const tokenParams = gatherTokenInitParams();
  const cfg = gatherLaunchConfig();

  let buybackProcessorAddress = "";
  if (cfg.buybackConfig?.enabled) {
    buybackProcessorAddress = cfg.buybackConfig.processorAddress || "";
    if (!buybackProcessorAddress) {
      buybackProcessorAddress = await deployBuybackProcessor(tokenParams.pancakeV2Router);
      cfg.buybackConfig.processorAddress = buybackProcessorAddress;
    }
    tokenParams.taxProcessor = buybackProcessorAddress;
  }

  validateDeployInput(tokenParams, cfg);

  const owner = state.account;
  const operator = cfg.launchOperator && ethers.isAddress(cfg.launchOperator) ? cfg.launchOperator : state.account;
  const implementationAddress = cfg.implementation && ethers.isAddress(cfg.implementation)
    ? cfg.implementation
    : await deployLocalBurnTokenImplementation();

  log("请在钱包中确认部署 Launchpad...");
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, state.signer);
  const contract = await factory.deploy(owner, operator, implementationAddress);
  await contract.waitForDeployment();
  const launchpadAddress = await contract.getAddress();
  log(`Launchpad 已部署: ${launchpadAddress}`);

  state.launchpad = contract;
  state.launchpadAddress = launchpadAddress;

  log("写入 Launch 配置...");
  await (await contract.configureLaunch(tokenParams, cfg.mintConfig, cfg.deliveryConfig, cfg.liquidityConfig)).wait();
  log("Launch 配置已写入");

  const tokenAddress = await deployFreshBurnToken();
  log("挂载外部主 Token 到 Launchpad...");
  await (await contract.attachExistingToken(tokenAddress, ethers.ZeroAddress)).wait();
  log(`主 Token 已挂载: ${tokenAddress}`);

  if (tokenParams.dexPair === ethers.ZeroAddress) {
    log("创建或读取 Pair...");
    await (await contract.createOrUsePair()).wait();
    const pairAddress = await contract.pair();
    $("lpPair").value = pairAddress;
    log(`Pair 已就绪: ${pairAddress}`);
  } else {
    log(`使用预填 Pair: ${tokenParams.dexPair}`);
  }

  log("初始化 Token...");
  await (await contract.initializeToken()).wait();
  log("Token 初始化已完成，当前为锁定交易状态，Mint 可立即开始");

  if (cfg.buybackConfig?.enabled && buybackProcessorAddress) {
    const pairAddress = await contract.pair();
    const processor = await getBuybackProcessor(buybackProcessorAddress, true);

    log("注册自动回购销毁处理器...");
    await (await processor.registerToken(
      tokenAddress,
      pairAddress,
      ethers.ZeroHash,
      tokenParams.poolQuoteToken,
      ethers.ZeroAddress,
      0,
      ethers.ZeroHash,
      tokenParams.normalBuyTaxBps,
      tokenParams.normalSellTaxBps
    )).wait();
    log("自动回购销毁处理器注册完成");

    log("写入自动回购销毁参数...");
    await (await processor.configureToken(
      tokenAddress,
      cfg.buybackConfig.onlyOnSell,
      cfg.buybackConfig.intervalSeconds,
      cfg.buybackConfig.spendAmount,
      cfg.buybackConfig.maxTaxSwapAmount
    )).wait();
    log("自动回购销毁参数已写入");
  }

  if (cfg.mintWhitelistAddresses.length) {
    log("写入初始 Mint 白名单...");
    await (await contract.batchSetMintWhitelist(cfg.mintWhitelistAddresses, true)).wait();
    log(`初始 Mint 白名单已写入 ${cfg.mintWhitelistAddresses.length} 个地址`);
  }

  if (cfg.mintWhitelistEnabled) {
    log("开启 Mint 白名单模式...");
    await (await contract.setMintWhitelistEnabled(true)).wait();
    log("Mint 白名单模式已开启");
  }

  fillDeploymentResult(launchpadAddress, tokenAddress, buybackProcessorAddress);
  await refreshMintView(launchpadAddress).catch((err) => log(`Mint 状态读取失败: ${err.message || String(err)}`));
}

/* ================= Mint 参与 ================= */
async function refreshMintView(launchpadAddress) {
  await connectWallet(false);
  const address = launchpadAddress || $("lpMintLaunchpad").value.trim();
  if (!address) throw new Error("请填写 Launchpad 地址");

  const launchpad = await getLaunchpad(address, false);
  state.mintLaunchpad = launchpad;
  state.launchpadAddress = address;

  const account = state.account || ethers.ZeroAddress;
  const [
    status,
    mintConfig,
    totalMintedCount,
    mintedCount,
    mintedPaid,
    mintedTokenEntitlement,
    tokenDelivered,
    quoteToken
  ] = await Promise.all([
    launchpad.launchStatus(),
    launchpad.mintConfig(),
    launchpad.totalMintedCount(),
    launchpad.mintedCount(account),
    launchpad.mintedPaid(account),
    launchpad.mintedTokenEntitlement(account),
    launchpad.tokenDelivered(account),
    launchpad.quoteToken()
  ]);

  const priceDecimals = mintConfig.mintMode === 0n || mintConfig.mintMode === 0 ? 18 : 18;
  $("lpMintStatus").textContent = LAUNCH_STATUS[Number(status)] || String(status);
  $("lpMintPagePrice").textContent = `${ethers.formatUnits(mintConfig.mintPrice, priceDecimals)} ${mintConfig.mintMode === 0n ? "BNB" : "QuoteToken"}`;
  $("lpMintPageTokenPerMint").textContent = ethers.formatUnits(mintConfig.tokenPerMint, 18);
  $("lpMintPageProgress").textContent = `${totalMintedCount.toString()} / ${mintConfig.maxMintCount.toString()}`;
  $("lpMintPageQuoteToken").textContent = formatAddress(quoteToken);
  $("lpMyMintCount").textContent = mintedCount.toString();
  $("lpMyMintPaid").textContent = ethers.formatUnits(mintedPaid, 18);
  $("lpMyMintTokens").textContent = ethers.formatUnits(mintedTokenEntitlement, 18);
  $("lpMyMintDelivered").textContent = tokenDelivered ? "是" : "否";
}

async function doMint() {
  await ensureWallet();
  const address = $("lpMintLaunchpad").value.trim() || state.launchpadAddress;
  if (!address) throw new Error("请先填写 Launchpad 地址");

  const launchpad = await getLaunchpad(address, true);
  const mintConfig = await launchpad.mintConfig();
  const mintMode = Number(mintConfig.mintMode);

  if (mintMode === 0) {
    logMint("请在钱包中确认 BNB Mint...");
    await (await launchpad.mint({ value: mintConfig.mintPrice })).wait();
    logMint("BNB Mint 已完成，代币到账和加池已执行");
  } else {
    const quoteTokenAddress = await launchpad.quoteToken();
    if (!quoteTokenAddress || quoteTokenAddress === ethers.ZeroAddress) {
      throw new Error("QuoteToken 地址无效");
    }
    const quoteToken = new ethers.Contract(quoteTokenAddress, ERC20_ABI, state.signer);
    const allowance = await quoteToken.allowance(state.account, address);
    if (allowance < mintConfig.mintPrice) {
      logMint("请在钱包中确认 QuoteToken 授权...");
      await (await quoteToken.approve(address, mintConfig.mintPrice)).wait();
      logMint("QuoteToken 授权已完成");
    }
    logMint("请在钱包中确认 QuoteToken Mint...");
    await (await launchpad.mintWithQuoteToken(mintConfig.mintPrice)).wait();
    logMint("QuoteToken Mint 已完成，代币到账和加池已执行");
  }

  await refreshMintView(address);
}

/* ================= 辅助 ================= */
function parseAddressLines(raw) {
  return raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function bindEvents() {
  $("lpConnectWallet").addEventListener("click", async () => {
    try {
      await ensureWallet();
      log("钱包已连接");
    } catch (error) {
      log(error.message || String(error));
    }
  });

  const linkedInputIds = [
    "lpTotalSupply",
    "lpMaxMintCount",
    "lpUserReceiveShare",
    "lpUserReceiveMode",
    "lpLpTokenMode"
  ];
  linkedInputIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => { autoSyncLinkedFields(); calcPreview(); });
    el.addEventListener("change", () => { autoSyncLinkedFields(); calcPreview(); });
  });

  [
    "lpMintPrice",
    "lpMaxMintCount",
    "lpMaxMintPerWallet",
    "lpTokenPerMint",
    "lpOneWalletOnce",
    "lpUserReceiveMode",
    "lpUserReceiveShare",
    "lpUserReceiveFixed",
    "lpLpFundShare",
    "lpLpTokenMode",
    "lpLpTokenFixed",
    "lpLpTokenShare",
    "lpLpReceiverMode",
    "lpCustomLpReceiver",
    "lpTotalSupply",
    "lpMintMode"
  ].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", calcPreview);
    el.addEventListener("change", calcPreview);
  });

  $("lpMintMode").addEventListener("change", () => {
    const quoteEl = $("lpQuoteToken");
    if (quoteEl && CHAIN_DEFAULTS[state.chainId]) quoteEl.value = "";
    applySuggestedDefaults();
  });

  $("lpQuoteTokenPreset").addEventListener("change", () => {
    const preset = $("lpQuoteTokenPreset").value;
    const quoteEl = $("lpQuoteToken");
    if (!quoteEl) return;
    if (preset) {
      quoteEl.value = preset;
      $("lpMintMode").value = "USDT";
    }
    calcPreview();
  });

  // 快捷选择股票代币：与 deploy.html 内独立兜底脚本联动（即使本模块加载失败也能自动填入）
  document.addEventListener("lp-preset-changed", () => calcPreview());

  $("lpCompileBtn").addEventListener("click", async () => {
    try {
      state.compiled = null;
      await compileLaunchpad();
    } catch (error) {
      log(error.message || String(error));
    }
  });

  $("lpDeployBtn").addEventListener("click", async () => {
    const btn = $("lpDeployBtn");
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="lp-spin"></span> 部署中...`;
      await deployLaunchpad();
    } catch (error) {
      log(error.message || String(error));
    } finally {
      btn.disabled = false;
      btn.innerHTML = `⚡ 一键部署`;
    }
  });

  $("lpMintLoadBtn").addEventListener("click", async () => {
    try {
      logMint("开始读取 Mint 合约...");
      await refreshMintView();
      logMint("Mint 页面已读取");
    } catch (error) {
      logMint(error.message || String(error));
    }
  });

  $("lpMintBtn").addEventListener("click", async () => {
    const btn = $("lpMintBtn");
    try {
      btn.disabled = true;
      logMint("开始执行 Mint...");
      await doMint();
    } catch (error) {
      logMint(error.message || String(error));
    } finally {
      btn.disabled = false;
    }
  });

  ["lpTaxPhase1End", "lpTaxPhase1Buy", "lpTaxPhase1Sell",
   "lpTaxPhase2End", "lpTaxPhase2Buy", "lpTaxPhase2Sell",
   "lpTaxPhase3End", "lpTaxPhase3Buy", "lpTaxPhase3Sell"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", syncTaxPhasesJson);
    el.addEventListener("change", syncTaxPhasesJson);
  });

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => { connectWallet(false).catch(() => {}); });
    window.ethereum.on?.("chainChanged", () => { connectWallet(false).catch(() => {}); });
  }
}

function bootstrap() {
  applyFormDefaults();
  syncTaxPhasesJson();
  connectWallet(false).catch(() => {});
  updateDefaultsHint();
  autoSyncLinkedFields();
  calcPreview();

  const queryLaunchpad = getUrlParam("launchpad");
  if (queryLaunchpad) {
    $("lpMintLaunchpad").value = queryLaunchpad;
    refreshMintView(queryLaunchpad).catch((error) => log(error.message || String(error)));
  }
}

bindEvents();
setWalletUi();
bootstrap();
