/* 验证 deploy.html 股票代币快捷选择 → QuoteToken 自动填充 */
const path = require("path");
const { chromium } = require("C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = "http://localhost:7777/deploy.html";
const SPCXB = "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1";
const TSLAB = "0x5b1910eaad6450e50f816082aa078c41f10c292f";

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true
  });

  // ---------- 场景 1：正常加载（ethers CDN 可达） ----------
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } });
  let page = await ctx.newPage();
  const errors1 = [];
  page.on("pageerror", (e) => errors1.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500); // 等模块脚本加载

  // 选 SPCXB
  await page.selectOption("#lpQuoteTokenPreset", SPCXB);
  await page.waitForTimeout(300);
  const v1 = await page.inputValue("#lpQuoteToken");
  const mode1 = await page.inputValue("#lpMintMode");
  const flash1 = await page.evaluate(() => document.getElementById("lpQuoteToken").classList.contains("lp-flash"));
  console.log("[场景1 正常加载] quote=", v1, "| mintMode=", mode1, "| flash=", flash1);
  console.log("[场景1] 页面错误:", errors1.length ? errors1 : "无");

  // 再选 TSLAB 验证可重复
  await page.selectOption("#lpQuoteTokenPreset", TSLAB);
  await page.waitForTimeout(300);
  const v2 = await page.inputValue("#lpQuoteToken");
  console.log("[场景1 再选] quote=", v2);

  await page.screenshot({ path: "C:/Users/Administrator/WorkBuddy/2026-08-20-21-10-05/dburn-showcase/shot-preset-test.png", fullPage: false });
  await ctx.close();

  // ---------- 场景 2：ethers CDN 加载失败（模拟断网 jsdelivr） ----------
  ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } });
  page = await ctx.newPage();
  const errors2 = [];
  page.on("pageerror", (e) => errors2.push(String(e)));
  // 拦截 jsdelivr，模拟加载失败
  await ctx.route("**cdn.jsdelivr.net**", (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  await page.selectOption("#lpQuoteTokenPreset", SPCXB);
  await page.waitForTimeout(300);
  const v3 = await page.inputValue("#lpQuoteToken");
  const mode3 = await page.inputValue("#lpMintMode");
  const flash3 = await page.evaluate(() => document.getElementById("lpQuoteToken").classList.contains("lp-flash"));
  console.log("[场景2 CDN失败] quote=", v3, "| mintMode=", mode3, "| flash=", flash3);
  console.log("[场景2] 页面错误:", errors2.length ? errors2 : "无");

  await ctx.close();
  await browser.close();

  const pass1 = v1 === SPCXB && v2 === TSLAB && mode1 === "USDT" && flash1;
  const pass2 = v3 === SPCXB && mode3 === "USDT" && flash3;
  console.log(pass1 && pass2 ? "\n✅ 全部通过：两种场景都能自动填入" : "\n❌ 存在失败场景");
  process.exit(pass1 && pass2 ? 0 : 1);
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(2); });
