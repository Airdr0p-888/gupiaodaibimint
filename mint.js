/**
 * StockMint Mint Module — auto-load edition
 * 页面打开时自动读取合约公开信息（无需钱包 / 只读 RPC），
 * 已授权钱包静默自动连接后升级为完整个人数据。
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
  97: { name: "BSC Testnet", native: "tBNB" }
};
const RPC_URLS = {
  56: "https://bsc-dataseed.binance.org",
  97: "https://data-seed-prebsc-1-s1.binance.org:8545"
};

// 默认合约地址：留空，用户粘贴合约地址后点「读取合约」
const DEFAULT_CONTRACT = "";

const state = {
  provider: null,     // 当前 provider（只读 RPC 或钱包）
  signer: null,
  account: null,
  contract: null,
  readOnly: true,     // 未连接钱包 = 只读模式
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

/* ---------- 图标（Feather 风格） ---------- */
const ICONS = {
  tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  gift: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  bell: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  wallet: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
  ticket: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/></svg>',
  diamond: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>',
  droplet: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  bank: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><path d="M12 2 2 7h20L12 2z"/><path d="M4 11v7"/><path d="M10 11v7"/><path d="M16 11v7"/><path d="M22 11v7"/></svg>',
  chart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
};

// 代币 Logo 颜色池（按 symbol 哈希取色）
const LOGO_COLORS = [
  ["#f0b90b", "#ff8c00"], ["#00d4ff", "#4d8aff"], ["#a855f7", "#ec4899"],
  ["#3dd598", "#00b894"], ["#ff6b81", "#ff4757"], ["#ffcc66", "#ff9f43"]
];
function logoColor(symbol) {
  let h = 0;
  for (const ch of String(symbol || "T")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

/* ---------- 日志 ---------- */
function log(message, type = "info") {
  const el = $("smLog");
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = `sm-log-line ${type === "error" ? "err" : type === "ok" ? "ok" : ""}`;
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

/* ---------- 钱包 ---------- */
async function connectWallet() {
  const injected = providerFromWallet();
  state.provider = new ethers.BrowserProvider(injected);
  await injected.request({ method: "eth_requestAccounts" });
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const network = await state.provider.getNetwork();
  const chainId = Number(network.chainId);
  state.nativeSymbol = NETWORKS[chainId]?.native || network.name || "BNB";
  state.readOnly = false;

  $("smWalletAddress").textContent = short(state.account);
  $("smWalletAddress").title = state.account;
  setBadge("smNetworkBadge", NETWORKS[chainId]?.name || `Chain ${chainId}`, chainId === 56 || chainId === 97);
  $("smConnectWallet").innerHTML = `<span class="sm-wallet-icon"></span>${short(state.account)}`;
  $("smConnectWallet").classList.add("connected");
  $("smWalletDot").classList.add("on");
  log(`钱包已连接：${short(state.account)}`, "ok");
}

async function ensureWallet() {
  if (!state.signer) await connectWallet();
}

/* ---------- 格式化 ---------- */
function formatAmount(value, decimals = 18, max = 6) {
  if (value === null || value === undefined) return "-";
  const text = ethers.formatUnits(value, decimals);
  if (!text.includes(".")) return text;
  const [whole, frac] = text.split(".");
  const trimmed = frac.slice(0, max).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/* ---------- 环形进度 ---------- */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r = 52
function updateRing(pct) {
  const ring = document.querySelector(".sm-ring-fill");
  const pctEl = $("smProgressPct");
  const textEl = $("smProgressText");
  const safePct = typeof pct === "number" && !Number.isNaN(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  if (ring) ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - safePct / 100);
  if (pctEl) pctEl.textContent = `${safePct.toFixed(1)}%`;
  if (textEl) textEl.textContent = `${state.mintedCount || 0} / ${state.maxMintCount || 0}`;
}

/* ---------- 数据卡片 ---------- */
function renderCards(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items
    .map(
      ([icon, label, value, cls]) =>
        `<div class="sm-card ${cls || ""}"><div class="sm-card-icon">${icon || ""}</div><div class="sm-card-body"><span>${label}</span><strong>${value}</strong></div></div>`
    )
    .join("");
}

/* ---------- 合约 ---------- */
async function txDone(tx, label) {
  log(`${label} 已提交：${short(tx.hash)}`);
  await tx.wait();
  log(`${label} 已确认 ✓`, "ok");
}

async function approveIfNeeded(tokenAddress, spender, amount, label) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, state.signer);
  const allowance = await token.allowance(state.account, spender);
  if (allowance >= amount) return;
  await txDone(await token.approve(spender, amount), `${label} 授权`);
}

/** 手动读取合约（带钱包） */
async function loadContract() {
  await ensureWallet();
  const address = $("smContractAddress").value.trim();
  if (!isAddress(address)) throw new Error("请填写正确的合约地址。");
  const btn = $("smLoadContract");
  btn.disabled = true;
  btn.innerHTML = `${ICONS.refresh}<span>读取中...</span>`;
  try {
    state.contract = new ethers.Contract(address, TOKEN_ABI, state.signer);
    state.readOnly = false;
    await refreshContract();
    const addrEl = $("smTokenAddr");
    if (addrEl) { addrEl.textContent = short(address); addrEl.title = address; }
    log(`合约已读取：${address}`, "ok");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${ICONS.refresh}<span>读取合约</span>`;
  }
}

/** 确保合约已绑定签名者（从只读模式升级到可交易模式） */
async function ensureContractWithSigner() {
  await ensureWallet();
  const address = $("smContractAddress").value.trim();
  if (!state.contract || state.readOnly || !state.signer) {
    if (!isAddress(address)) throw new Error("请填写正确的合约地址。");
    state.contract = new ethers.Contract(address, TOKEN_ABI, state.signer);
    state.readOnly = false;
    await refreshContract();
  }
}

/** 页面打开时自动读取（只读 RPC，无需钱包） */
async function autoLoad() {
  const address = $("smContractAddress").value.trim();
  if (!isAddress(address)) {
    const badge = $("smAutoBadge");
    if (badge) {
      badge.classList.add("done");
      badge.textContent = "等待输入合约地址";
    }
    return;
  }

  // 优先使用钱包 provider 探测网络（不请求授权，不弹窗）
  let provider = null;
  const eth = window.ethereum;
  if (eth) {
    try {
      const bp = new ethers.BrowserProvider(eth);
      const net = await bp.getNetwork();
      const chainId = Number(net.chainId);
      if (chainId === 56 || chainId === 97) {
        provider = bp;
        state.provider = bp;
        state.nativeSymbol = NETWORKS[chainId].native;
        setBadge("smNetworkBadge", NETWORKS[chainId].name, true);
      } else {
        setBadge("smNetworkBadge", `Chain ${chainId}`, false);
      }
    } catch { /* 忽略，走公共 RPC */ }
  }
  if (!provider) {
    state.provider = new ethers.JsonRpcProvider(RPC_URLS[56]);
    setBadge("smNetworkBadge", "BSC 主网 · 只读", true);
    $("smNetworkName").textContent = "BSC 主网 · 只读";
  } else {
    $("smNetworkName").textContent = state.nativeSymbol === "tBNB" ? "BSC 测试网" : "BNB Smart Chain";
  }

  try {
    // 若钱包已静默连接成功（signer 版合约已就绪），不覆盖
    if (!state.signer) {
      state.contract = new ethers.Contract(address, TOKEN_ABI, state.provider);
      await refreshContract();
    }
    const addrEl = $("smTokenAddr");
    if (addrEl) { addrEl.textContent = short(address); addrEl.title = address; }
    $("smAutoBadge").classList.add("done");
    $("smAutoBadge").textContent = "已自动读取";
    log("已自动读取合约公开信息（连接钱包后可查看个人数据）", "ok");
  } catch (err) {
    const msg = err.reason || err.shortMessage || err.message || String(err);
    $("smTokenTitle").textContent = "合约读取失败";
    $("smAutoBadge").classList.add("fail");
    $("smAutoBadge").textContent = "读取失败";
    const mn = $("smMintNow");
    if (mn) { mn.disabled = true; mn.innerHTML = `${ICONS.bell}<span>合约读取失败</span>`; }
    log(`自动读取失败：${msg}`, "error");
  }
}

/** 已授权钱包静默自动连接（不弹窗） */
async function silentConnect() {
  const eth = window.ethereum;
  if (!eth) return;
  try {
    const accounts = await eth.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return; // 未授权过，不打扰用户
    await connectWallet(); // 已授权，requestAccounts 不会弹窗
    const address = $("smContractAddress").value.trim();
    if (!isAddress(address)) return;
    if (state.contract) {
      // 将现有合约绑定到 signer 并刷新个人数据
      const contractAddress = await state.contract.getAddress();
      state.contract = new ethers.Contract(contractAddress, TOKEN_ABI, state.signer);
      state.readOnly = false;
      await refreshContract();
      log("钱包已自动连接，个人数据已加载", "ok");
    } else {
      await loadContract();
    }
  } catch (err) {
    console.warn("silent connect skipped:", err);
  }
}

/** 安全读取合约字段，失败返回默认值 */
async function safeRead(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    console.warn("contract read skipped:", err?.shortMessage || err?.message || err);
    return fallback;
  }
}

/** 读取合约数据（兼容只读/签名者两种模式） */
async function refreshContract() {
  if (!state.contract) return;

  // 核心字段独立读取，避免一个 view 失败导致整页不渲染
  const name = await safeRead(() => state.contract.name(), "Unknown");
  const symbol = await safeRead(() => state.contract.symbol(), "TOKEN");
  const decimals = await safeRead(() => state.contract.decimals(), 18n);
  const mode = await safeRead(() => state.contract.mintMode(), 0n);
  const mintPrice = await safeRead(() => state.contract.mintPrice(), 0n);
  const tokenPerMint = await safeRead(() => state.contract.tokenPerMint(), 0n);
  const mintedCount = await safeRead(() => state.contract.mintedCount(), 0n);
  const maxMintCount = await safeRead(() => state.contract.maxMintCount(), 0n);
  const mintEnabled = await safeRead(() => state.contract.mintEnabled(), false);
  const whitelistEnabled = await safeRead(() => state.contract.whitelistEnabled(), false);

  // 分红储备（公开数据，尽力读取）
  let dividendReserve = await safeRead(
    () => state.contract.dividendReserveView().catch(() => state.contract.dividendReserve()),
    null
  );
  let minTokenDividendBalance = await safeRead(
    () => state.contract.minTokenDividendBalanceView().catch(() => state.contract.minTokenDividendBalance()),
    null
  );

  state.tokenDecimals = Number(decimals) || 18;
  state.mode = Number(mode) || 0;
  state.rewardSymbol = state.mode === 0 ? state.nativeSymbol : "TOKEN";
  state.rewardDecimals = 18;
  state.mintPaySymbol = state.mode === 0 ? state.nativeSymbol : "TOKEN";
  state.mintPayDecimals = 18;
  state.mintEnabled = !!mintEnabled;
  state.mintedCount = Number(mintedCount) || 0;
  state.maxMintCount = Number(maxMintCount) || 0;

  let whitelistStatus = state.readOnly ? "连接钱包后查看" : "未开启";
  let hasMinted = state.readOnly ? null : false;
  let balance = null, pendingToken = null, pendingLP = null;

  if (!state.readOnly && state.signer) {
    try { balance = await state.contract.balanceOf(state.account); } catch { /* ignore */ }
    try { hasMinted = await state.contract.hasMinted(state.account); } catch { /* ignore */ }
    try { [pendingToken, pendingLP] = await Promise.all([state.contract.pendingTokenDividend(state.account), state.contract.pendingLPDividend(state.account)]); } catch { /* ignore */ }
    if (whitelistEnabled) {
      try {
        const allowed = await state.contract.whitelist(state.account);
        whitelistStatus = allowed ? "已在白名单" : "未在白名单";
      } catch { /* ignore */ }
    }
  }

  // 支付模式详情（mode=1 时读取支付代币）
  if (state.mode === 1) {
    try {
      const paymentAddress = await state.contract.usdtAddress();
      const reward = new ethers.Contract(paymentAddress, ERC20_ABI, state.provider);
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

  /* ---- 头部渲染 ---- */
  $("smTokenTitle").textContent = `${name} (${symbol})`;
  const [c1, c2] = logoColor(symbol);
  const logo = $("smTokenLogo");
  if (logo) {
    logo.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    logo.textContent = (symbol || "T").slice(0, 2).toUpperCase();
  }
  setBadge("smMintModeBadge", state.mode === 0 ? `${state.nativeSymbol} 模式` : `${state.mintPaySymbol} 模式`, true);
  setBadge("smRewardUnitBadge", state.rewardSymbol, true);

  /* ---- 环形进度 ---- */
  const pct = state.maxMintCount > 0 ? Math.min(100, (state.mintedCount / state.maxMintCount) * 100) : 0;
  updateRing(pct);

  /* ---- Mint 统计 ---- */
  const balanceText = balance === null ? "连接钱包后查看" : `${formatAmount(balance, state.tokenDecimals)} ${symbol}`;
  const statusText = mintEnabled
    ? '<span style="color:#3dd598">● 开启中</span>'
    : '<span style="color:#ff6b81">● 已关闭</span>';
  const qualifyText = hasMinted === null ? whitelistStatus : (hasMinted ? "已 Mint" : whitelistStatus);
  renderCards("smMintStats", [
    [ICONS.tag, "Mint 价格", `${formatAmount(mintPrice, state.mintPayDecimals)} ${state.mintPaySymbol}`],
    [ICONS.gift, "单次获得", `${formatAmount(tokenPerMint, state.tokenDecimals)} ${symbol}`],
    [ICONS.bell, "Mint 状态", statusText],
    [ICONS.wallet, "我的余额", balanceText],
    [ICONS.ticket, "我的资格", qualifyText],
    [ICONS.chart, "已 Mint", `${state.mintedCount} / ${state.maxMintCount}`]
  ]);

  /* ---- 分红统计 ---- */
  const pendingTokenText = pendingToken === null ? "连接钱包后查看" : `${formatAmount(pendingToken, state.rewardDecimals)} ${state.rewardSymbol}`;
  const pendingLPText = pendingLP === null ? "连接钱包后查看" : `${formatAmount(pendingLP, state.rewardDecimals)} ${state.rewardSymbol}`;
  renderCards("smRewardStats", [
    [ICONS.diamond, "持币可领", pendingTokenText],
    [ICONS.droplet, "LP 可领", pendingLPText],
    [ICONS.bank, "分红储备", dividendReserve === null ? "-" : `${formatAmount(dividendReserve, state.rewardDecimals)} ${state.rewardSymbol}`],
    [ICONS.chart, "最低持仓", minTokenDividendBalance === null ? "-" : `${formatAmount(minTokenDividendBalance, state.tokenDecimals)} ${symbol}`]
  ]);

  /* ---- Mint 按钮状态 ---- */
  const btn = $("smMintNow");
  const soldOut = state.maxMintCount > 0 && state.mintedCount >= state.maxMintCount;
  if (state.readOnly || !state.signer) {
    btn.disabled = false;
    btn.innerHTML = `${ICONS.wallet}<span>连接钱包参与 Mint</span>`;
  } else if (!mintEnabled) {
    btn.disabled = true;
    btn.innerHTML = `${ICONS.bell}<span>Mint 已关闭</span>`;
  } else if (hasMinted) {
    btn.disabled = true;
    btn.innerHTML = `${ICONS.ticket}<span>已 Mint 过</span>`;
  } else if (soldOut) {
    btn.disabled = true;
    btn.innerHTML = `${ICONS.chart}<span>Mint 已满</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `${ICONS.zap}<span>${state.mode === 0 ? "BNB Mint" : `${state.mintPaySymbol} Mint`}</span>`;
  }

  /* ---- 领取按钮 ---- */
  const claimBtn = $("smClaimDividends");
  if (state.readOnly || !state.signer) {
    claimBtn.disabled = false;
    claimBtn.innerHTML = `${ICONS.wallet}<span>连接钱包查看分红</span>`;
  } else {
    claimBtn.disabled = false;
    claimBtn.innerHTML = `${ICONS.diamond}<span>领取分红</span>`;
  }
}

/* ---------- 操作 ---------- */
async function mintNow() {
  await ensureContractWithSigner();
  if (!state.mintEnabled) throw new Error("Mint 已关闭，无法继续");
  const hasMinted = await state.contract.hasMinted(state.account);
  if (hasMinted) throw new Error("该钱包已经 Mint 过，每个地址限 Mint 一次");
  const mintedCount = Number(await state.contract.mintedCount());
  const maxMintCount = Number(await state.contract.maxMintCount());
  if (maxMintCount > 0 && mintedCount >= maxMintCount) throw new Error("Mint 已满/售罄");
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
  await ensureContractWithSigner();
  await txDone(await state.contract.claimDividends(), "领取分红");
  await refreshContract();
}

/* ---------- 错误翻译 ---------- */
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
  [/unknown\s*custom\s*error/i, "合约执行失败，请确认操作条件是否满足"]
];

function translateError(message) {
  for (const [pattern, translation] of ERROR_TRANSLATIONS) {
    if (pattern.test(message)) return translation;
  }
  return null;
}

async function run(button, fn) {
  const busyHTML = `${ICONS.refresh}<span>处理中...</span>`;
  try {
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = busyHTML;
    await fn();
    // 若业务逻辑已修改按钮文案（如连接后显示地址），保留修改；否则恢复原文案
    if (button.innerHTML === busyHTML) button.innerHTML = original;
  } catch (err) {
    console.error(err);
    const message = err.shortMessage || err.reason || err.message || String(err);
    const translated = translateError(message);
    if (translated) {
      log(translated, "error");
    } else if (message.includes("TRANSFER_FROM_FAILED")) {
      log("TRANSFER_FROM_FAILED：通常是授权不足、余额不足、USDT/Router/网络不匹配，或池子太浅导致路由失败。", "error");
    } else if (message.includes("insufficient funds")) {
      log("Gas 不足：请确认当前网络的钱包里有足够原生币支付手续费。", "error");
    } else {
      log(message, "error");
    }
  } finally {
    button.disabled = false;
  }
}

/* ---------- 启动 ---------- */
function bootAddress() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("contract");
  if (isAddress(fromUrl) && $("smContractAddress")) $("smContractAddress").value = fromUrl;
}

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
  // 输入框回车触发读取
  $("smContractAddress").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run(lc, loadContract);
  });

  window.ethereum?.on?.("accountsChanged", () => {
    state.signer = null;
    state.account = null;
    state.readOnly = true;
    connectWallet()
      .then(async () => {
        if (isAddress($("smContractAddress").value)) await loadContract();
      })
      .catch((err) => log(err.message || String(err), "error"));
  });

  window.ethereum?.on?.("chainChanged", () => location.reload());

  bootAddress();
  // 1) 自动只读读取（无需钱包，无弹窗）
  autoLoad();
  // 2) 已授权钱包静默连接（不弹窗，仅当用户以前授权过）
  setTimeout(silentConnect, 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMint);
} else {
  initMint();
}

/* ---------- 平台介绍面板：点击复制 QQ / 群号 ---------- */
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".sm-intro-chip[data-copy]");
  if (!chip) return;
  const copyText = chip.dataset.copy;
  const label = chip.dataset.label || chip.textContent.trim();
  navigator.clipboard?.writeText(copyText).then(() => {
    chip.textContent = "✓ 已复制 " + copyText;
    chip.classList.add("copied");
    setTimeout(() => {
      chip.textContent = label;
      chip.classList.remove("copied");
    }, 1600);
  }).catch(() => {});
});
