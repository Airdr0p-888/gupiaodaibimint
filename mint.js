/**
 * StockMint Mint Module — extracted & adapted from GDp版本 mint.js
 * Provides: wallet connect, contract loader, mint, claim dividends, log
 * Uses ethers v6 from CDN (ES module)
 */
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/dist/ethers.min.js";

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function mintMode() view returns (uint8)",
  "function usdtAddress() view returns (address)",
  "function mintPrice() view returns (uint256)",
  "function tokenPerMint() view returns (uint256)",
  "function mintedCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function mintEnabled() view returns (bool)",
  "function hasMinted(address) view returns (bool)",
  "function whitelistEnabled() view returns (bool)",
  "function whitelist(address) view returns (bool)",
  "function pendingTokenDividend(address) view returns (uint256)",
  "function pendingLPDividend(address) view returns (uint256)",
  "function dividendReserve() view returns (uint256)",
  "function dividendReserveView() view returns (uint256)",
  "function minTokenDividendBalance() view returns (uint256)",
  "function minTokenDividendBalanceView() view returns (uint256)",
  "function mintBNB() payable",
  "function mintUSDT()",
  "function claimDividends()"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

const NETWORKS = {
  56: { name: "BNB Smart Chain", native: "BNB" },
  97: { name: "BNB Smart Chain Testnet", native: "tBNB" }
};

// 默认合约地址：页面打开时预填，无 URL/localStorage 地址时使用
const DEFAULT_CONTRACT = "0x0d9cded5067456d84909f89ab1ea755b1bad8888";

const state = {
  provider: null,
  signer: null,
  account: null,
  contract: null,
  tokenDecimals: 18,
  rewardDecimals: 18,
  rewardSymbol: "BNB",
  mintPayDecimals: 18,
  mintPaySymbol: "BNB",
  nativeSymbol: "BNB",
  mode: 0,
  mintEnabled: true,
  hasMinted: false,
  mintedCount: 0,
  maxMintCount: 0
};

const $ = (id) => document.getElementById(id);
const short = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "-");
const isAddress = (addr) => ethers.isAddress(String(addr || "").trim());

function log(message) {
  const el = $("smLog");
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "sm-log-line";
  line.innerHTML = `<span class="sm-log-time">${time}</span><span class="sm-log-msg">${message}</span>`;
  el.prepend(line);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

function setBadge(elId, text, active) {
  const el = $(elId);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("active", !!active);
}

function providerFromWallet() {
  const eth = window.ethereum;
  if (!eth) throw new Error("没有检测到钱包，请先安装 MetaMask 或 TokenPocket。");
  if (Array.isArray(eth.providers)) {
    return eth.providers.find((p) => p.isTokenPocket) || eth.providers.find((p) => p.isMetaMask) || eth.providers[0];
  }
  return eth;
}

async function connectWallet() {
  const injected = providerFromWallet();
  state.provider = new ethers.BrowserProvider(injected);
  await injected.request({ method: "eth_requestAccounts" });
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const network = await state.provider.getNetwork();
  const chainId = Number(network.chainId);
  state.nativeSymbol = NETWORKS[chainId]?.native || network.name || "BNB";
  $("smWalletAddress").textContent = short(state.account);
  $("smNetworkName").textContent = NETWORKS[chainId]?.name || `Chain ${chainId}`;
  $("smConnectWallet").textContent = "已连接";
  $("smConnectWallet").classList.add("connected");
  $("smWalletDot").classList.add("on");
  log(`钱包已连接：${short(state.account)}`);
}

async function ensureWallet() {
  if (!state.signer) await connectWallet();
}

function formatAmount(value, decimals = 18, max = 6) {
  const text = ethers.formatUnits(value, decimals);
  if (!text.includes(".")) return text;
  const [whole, frac] = text.split(".");
  const trimmed = frac.slice(0, max).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function renderStats(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="sm-stat"><span>${label}</span><strong>${value}</strong></div>`
    )
    .join("");
}

async function txDone(tx, label) {
  log(`${label} 已提交：${short(tx.hash)}`);
  await tx.wait();
  log(`${label} 已确认 ✓`);
}

async function approveIfNeeded(tokenAddress, spender, amount, label) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, state.signer);
  const allowance = await token.allowance(state.account, spender);
  if (allowance >= amount) return;
  await txDone(await token.approve(spender, amount), `${label} 授权`);
}

async function loadContract() {
  await ensureWallet();
  const address = $("smContractAddress").value.trim();
  if (!isAddress(address)) throw new Error("请填写正确的合约地址。");
  localStorage.setItem("stockMintContract", address);
  state.contract = new ethers.Contract(address, TOKEN_ABI, state.signer);
  $("smLoadContract").textContent = "读取中...";
  await refreshContract();
  $("smLoadContract").textContent = "已读取";
  log(`合约已读取：${address}`);
}

async function refreshContract() {
  if (!state.contract) return;
  const [
    name, symbol, decimals, balance, mode, mintPrice, tokenPerMint,
    mintedCount, maxMintCount, mintEnabled, hasMinted, whitelistEnabled,
    pendingToken, pendingLP, dividendReserve, minTokenDividendBalance
  ] = await Promise.all([
    state.contract.name(), state.contract.symbol(), state.contract.decimals(),
    state.contract.balanceOf(state.account), state.contract.mintMode(),
    state.contract.mintPrice(), state.contract.tokenPerMint(),
    state.contract.mintedCount(), state.contract.maxMintCount(),
    state.contract.mintEnabled(), state.contract.hasMinted(state.account),
    state.contract.whitelistEnabled(),
    state.contract.pendingTokenDividend(state.account),
    state.contract.pendingLPDividend(state.account),
    state.contract.dividendReserveView().catch(() => state.contract.dividendReserve()),
    state.contract.minTokenDividendBalanceView().catch(() => state.contract.minTokenDividendBalance())
  ]);

  state.tokenDecimals = Number(decimals);
  state.mode = Number(mode);
  state.rewardSymbol = state.mode === 0 ? state.nativeSymbol : "TOKEN";
  state.rewardDecimals = 18;
  state.mintPaySymbol = state.mode === 0 ? state.nativeSymbol : "TOKEN";
  state.mintPayDecimals = 18;
  state.mintEnabled = mintEnabled;
  state.hasMinted = hasMinted;
  state.mintedCount = Number(mintedCount);
  state.maxMintCount = Number(maxMintCount);

  let whitelistStatus = "未开启";
  if (whitelistEnabled) {
    const allowed = await state.contract.whitelist(state.account);
    whitelistStatus = allowed ? "已在白名单" : "未在白名单";
  }

  if (state.mode === 1) {
    const paymentAddress = await state.contract.usdtAddress();
    const reward = new ethers.Contract(paymentAddress, ERC20_ABI, state.signer);
    try {
      state.mintPaySymbol = await reward.symbol();
      state.mintPayDecimals = Number(await reward.decimals());
      state.rewardSymbol = state.mintPaySymbol;
      state.rewardDecimals = state.mintPayDecimals;
    } catch {
      state.mintPaySymbol = "TOKEN";
      state.rewardSymbol = "TOKEN";
      state.rewardDecimals = 18;
    }
  }

  $("smTokenTitle").textContent = `${name} (${symbol})`;
  setBadge("smMintModeBadge", state.mode === 0 ? "BNB 模式" : `${state.mintPaySymbol} 模式`, true);
  setBadge("smRewardUnitBadge", state.rewardSymbol, true);

  // Progress bar
  const pct = state.maxMintCount > 0 ? Math.min(100, (state.mintedCount / state.maxMintCount) * 100) : 0;
  const bar = $("smMintProgress");
  if (bar) {
    bar.querySelector(".sm-progress-fill").style.width = pct.toFixed(1) + "%";
    bar.querySelector(".sm-progress-text").textContent = `${state.mintedCount} / ${state.maxMintCount}  (${pct.toFixed(1)}%)`;
  }

  renderStats("smMintStats", [
    ["Mint 价格", `${formatAmount(mintPrice, state.mintPayDecimals)} ${state.mintPaySymbol}`],
    ["单次获得", `${formatAmount(tokenPerMint, state.tokenDecimals)} ${symbol}`],
    ["Mint 状态", mintEnabled ? '<span style="color:#3dd598">开启</span>' : '<span style="color:#ff6b81">关闭</span>'],
    ["我的余额", `${formatAmount(balance, state.tokenDecimals)} ${symbol}`],
    ["我的资格", hasMinted ? "已 Mint" : whitelistStatus]
  ]);

  renderStats("smRewardStats", [
    ["持币可领", `${formatAmount(pendingToken, state.rewardDecimals)} ${state.rewardSymbol}`],
    ["LP 可领", `${formatAmount(pendingLP, state.rewardDecimals)} ${state.rewardSymbol}`],
    ["分红储备", `${formatAmount(dividendReserve, state.rewardDecimals)} ${state.rewardSymbol}`],
    ["最低持仓", `${formatAmount(minTokenDividendBalance, state.tokenDecimals)} ${symbol}`]
  ]);

  // Mint button state
  const btn = $("smMintNow");
  if (!mintEnabled || state.hasMinted || state.mintedCount >= state.maxMintCount) {
    btn.disabled = true;
    if (!mintEnabled) btn.textContent = "Mint 已关闭";
    else if (state.hasMinted) btn.textContent = "已 Mint 过";
    else btn.textContent = "Mint 已满";
  } else {
    btn.disabled = false;
    btn.textContent = state.mode === 0 ? "BNB Mint" : `${state.mintPaySymbol} Mint`;
  }
}

async function mintNow() {
  await ensureWallet();
  if (!state.contract) await loadContract();
  if (!state.mintEnabled) throw new Error("Mint 已关闭，无法继续");
  if (state.hasMinted) throw new Error("该钱包已经 Mint 过，每个地址限 Mint 一次");
  if (state.mintedCount >= state.maxMintCount) throw new Error("Mint 已满/售罄");
  const address = await state.contract.getAddress();
  const mode = Number(await state.contract.mintMode());
  const price = await state.contract.mintPrice();
  if (mode === 0) {
    await txDone(await state.contract.mintBNB({ value: price }), "Mint");
  } else {
    const paymentAddress = await state.contract.usdtAddress();
    const token = new ethers.Contract(paymentAddress, ERC20_ABI, state.signer);
    const balance = await token.balanceOf(state.account);
    if (balance < price)
      throw new Error(`${state.mintPaySymbol} 余额不足，需要 ${formatAmount(price, state.mintPayDecimals)} ${state.mintPaySymbol}`);
    await approveIfNeeded(paymentAddress, address, price, `${state.mintPaySymbol} Mint`);
    await txDone(await state.contract.mintUSDT(), "Mint");
  }
  await refreshContract();
}

async function claimDividends() {
  await ensureWallet();
  if (!state.contract) await loadContract();
  await txDone(await state.contract.claimDividends(), "领取分红");
  await refreshContract();
}

const ERROR_TRANSLATIONS = [
  [/not\s*bnb\s*mode/i, "当前合约是 USDT 模式，不支持 BNB Mint"],
  [/not\s*usdt\s*mode/i, "当前合约是 BNB 模式，不支持 USDT Mint"],
  [/not\s*erc20\s*mode/i, "当前合约是 BNB 模式，不支持 ERC20 Mint"],
  [/unsupported\s*payment\s*token/i, "该支付代币存在转账扣费或非标准余额行为，暂不支持用于 Mint"],
  [/bad\s*bnb\s*amount/i, "发送的 BNB 金额不正确，请检查 Mint 价格"],
  [/mint\s*disabled/i, "Mint 已关闭"],
  [/already\s*minted/i, "该钱包已经 Mint 过了，每个地址限 Mint 一次"],
  [/mint\s*full/i, "Mint 已满/售罄"],
  [/not\s*whitelisted/i, "当前钱包不在白名单中，请联系管理员添加"],
  [/insufficient\s*token\s*reserve/i, "合约内代币储备不足以发放"],
  [/trading\s*not\s*open/i, "交易尚未开启"],
  [/buy\s*limit/i, "超过单钱包买入限额"],
  [/Pausable:\s*paused/i, "合约已暂停"],
  [/Ownable:\s*caller\s*is\s*not\s*the\s*owner/i, "当前钱包不是合约 Owner，无权操作"],
  [/ReentrancyGuard:\s*reentrant\s*call/i, "操作太频繁，请稍后再试"],
  [/ERC20:\s*transfer\s*amount\s*exceeds\s*balance/i, "代币余额不足"],
  [/ERC20:\s*insufficient\s*allowance/i, "代币授权不足，请先授权"],
  [/tax\s*>\s*10%/, "税率超过 10% 上限"],
  [/sum\s*!=\s*10000/, "税收分配合计不等于 100%"],
  [/lt\s*minted/i, "新最大值不能小于已 Mint 数"],
  [/no\s*available\s*BNB/i, "无可提取的 BNB"],
  [/no\s*available\s*token/i, "无可提取的代币"],
  [/exceeds\s*available/i, "提取数量超过可用余额"],
  [/exceeds\s*reserve/i, "提取数量超过储备"],
  [/no\s*circulating\s*supply/i, "代币无流通供应（全在合约内）"],
  [/no\s*lp\s*supply/i, "无 LP 流动性供应"],
  [/bad\s*BNB/i, "发送的 BNB 金额不正确"],
  [/zero\s*amount/i, "数量不能为 0"],
  [/unknown\s*custom\s*error/i, "合约执行失败，请确认操作条件是否满足"],
];

function translateError(message) {
  for (const [pattern, translation] of ERROR_TRANSLATIONS) {
    if (pattern.test(message)) return translation;
  }
  return null;
}

async function run(button, fn) {
  try {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "处理中...";
    await fn();
    button.textContent = original;
  } catch (err) {
    console.error(err);
    const message = err.shortMessage || err.reason || err.message || String(err);
    const translated = translateError(message);
    if (translated) {
      log(translated);
    } else if (message.includes("TRANSFER_FROM_FAILED")) {
      log("TRANSFER_FROM_FAILED：通常是授权不足、余额不足、USDT/Router/网络不匹配，或池子太浅导致路由失败。");
    } else if (message.includes("insufficient funds")) {
      log("Gas 不足：请确认当前网络的钱包里有足够原生币支付手续费。");
    } else {
      log(message);
    }
  } finally {
    button.disabled = false;
  }
}

function bootAddress() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("contract");
  const saved = localStorage.getItem("stockMintContract");
  const address = isAddress(fromUrl) ? fromUrl : (isAddress(saved) ? saved : DEFAULT_CONTRACT);
  if (address && $("smContractAddress")) $("smContractAddress").value = address;
}

// Bind events (guard against missing elements — mint section may not exist on other pages)
function initMint() {
  const cw = $("smConnectWallet");
  const lc = $("smLoadContract");
  const mn = $("smMintNow");
  const cd = $("smClaimDividends");
  if (!cw) return; // Mint section not on this page

  cw.addEventListener("click", (e) =>
    run(e.currentTarget, async () => {
      await connectWallet();
      if (isAddress($("smContractAddress").value)) await loadContract();
    })
  );
  lc.addEventListener("click", (e) => run(e.currentTarget, loadContract));
  mn.addEventListener("click", (e) => run(e.currentTarget, mintNow));
  cd.addEventListener("click", (e) => run(e.currentTarget, claimDividends));

  window.ethereum?.on?.("accountsChanged", () => {
    state.signer = null;
    state.account = null;
    connectWallet()
      .then(async () => {
        if (isAddress($("smContractAddress").value)) await loadContract();
      })
      .catch((err) => log(err.message || String(err)));
  });

  window.ethereum?.on?.("chainChanged", () => location.reload());

  bootAddress();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMint);
} else {
  initMint();
}
