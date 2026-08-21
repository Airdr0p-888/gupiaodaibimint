// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IBurnToken {
    struct TaxPhase {
        uint32 endAfterSeconds;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
    }

    struct InitParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address dexPair;
        address taxProcessor;
        address pancakeV2Router;
        address poolQuoteToken;
        address stairTaxReceiver;
        uint8 launchType;
        uint256 tradingOpenTime;
        uint16 normalBuyTaxBps;
        uint16 normalSellTaxBps;
        uint16 poolBurnBpsPerHour;
        uint256 minPoolTokenBalance;
        TaxPhase[] taxPhases;
    }

    function initialize(InitParams calldata params, address tokenDeployer_) external;
    function tradingOpenTime() external view returns (uint256);
    function launchType() external view returns (uint8);
    function owner() external view returns (address);
    function setTradingOpenTime(uint256 newTradingOpenTime) external;
}

interface IPancakeRouterLike {
    function factory() external view returns (address);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IPancakeFactoryLike {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

contract DBurnMintLaunchpad {
    uint16 public constant BPS = 10_000;

    enum MintMode {
        BNB,
        QUOTE_TOKEN
    }

    enum UserReceiveMode {
        PROPORTIONAL,
        FIXED
    }

    enum LPTokenMode {
        REMAINING,
        FIXED_AMOUNT,
        FIXED_SHARE
    }

    enum LPReceiverMode {
        DEPLOYER,
        LAUNCH_OPERATOR,
        CUSTOM
    }

    enum LaunchStatus {
        UNINITIALIZED,
        PREPARED,
        MINT_LIVE,
        MINT_CLOSED,
        FINALIZED,
        LIQUIDITY_ADDED,
        TRADING_OPENED
    }

    struct MintConfig {
        MintMode mintMode;
        uint256 mintPrice;
        uint256 tokenPerMint;
        uint256 maxMintCount;
        uint256 maxMintPerWallet;
        uint256 mintStartTime;
        bool oneWalletOneMint;
        bool autoFinishOnSoldOut;
    }

    struct DeliveryConfig {
        UserReceiveMode userReceiveMode;
        uint16 userReceiveShareBps;
        uint256 userReceiveFixedAmount;
    }

    struct LiquidityConfig {
        uint16 lpFundShareBps;
        LPTokenMode lpTokenMode;
        uint16 lpTokenShareBps;
        uint256 lpTokenFixedAmount;
        LPReceiverMode lpReceiverMode;
        address customLpReceiver;
    }

    struct SettlementPreview {
        uint256 totalUserTokenAllocation;
        uint256 totalLiquidityFundAllocation;
        uint256 totalLiquidityTokenAllocation;
        uint256 totalReservedTokenAllocation;
    }

    address public owner;
    address public launchOperator;
    address public burnTokenImplementation;

    address public token;
    address public router;
    address public quoteToken;
    address public pair;

    LaunchStatus public launchStatus;

    MintConfig public mintConfig;
    DeliveryConfig public deliveryConfig;
    LiquidityConfig public liquidityConfig;
    IBurnToken.InitParams private _tokenInitParams;

    uint256 public totalRaised;
    uint256 public totalMintedCount;
    uint256 public totalUserTokenAllocation;
    uint256 public totalLiquidityFundAllocation;
    uint256 public totalLiquidityTokenAllocation;
    uint256 public totalReservedTokenAllocation;
    uint256 public configuredTradingOpenTime;

    bool public mintClosed;
    bool public settlementLocked;
    bool public liquidityAdded;
    bool public tradingOpened;
    bool public tokenInitialized;
    bool public mintWhitelistEnabled;

    mapping(address => uint256) public mintedCount;
    mapping(address => uint256) public mintedPaid;
    mapping(address => uint256) public mintedTokenEntitlement;
    mapping(address => bool) public tokenDelivered;
    mapping(address => bool) public mintWhitelist;

    error Unauthorized();
    error InvalidConfig();
    error InvalidPhase();
    error MintNotOpen();
    error MintClosedError();
    error WalletMintLimit();
    error GlobalMintLimit();
    error InvalidPayment();
    error TransferFailed();
    error MintWhitelistDenied();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LaunchConfigured(address indexed operator, address indexed router, address indexed quoteToken);
    event TokenDeployed(address indexed token, address indexed pair, uint256 tradingOpenTime);
    event PairResolved(address indexed pair, bool createdNew);
    event TokenInitialized(address indexed token, address indexed pair, uint256 tradingOpenTime);
    event MintParticipated(address indexed user, uint256 pricePaid, uint256 tokenEntitlement, uint256 mintCount);
    event MintClosed(uint256 totalRaised, uint256 totalMintedCount);
    event InstantLiquidityProcessed(
        address indexed user,
        uint256 userTokenAmount,
        uint256 lpTokenAmount,
        uint256 lpFundAmount,
        uint256 lpAmount,
        address lpReceiver
    );
    event LaunchFinalized(
        uint256 userTokens,
        uint256 lpFunds,
        uint256 lpTokens,
        uint256 reservedTokens
    );
    event UserTokensDelivered(address indexed user, uint256 amount);
    event LiquidityAdded(uint256 tokenAmount, uint256 quoteAmount, uint256 lpAmount, address lpReceiver);
    event TradingStatusSynced(uint256 tradingOpenTime, uint256 syncTime);
    event TokenInventorySeeded(address indexed from, uint256 amount);
    event RaisedFundsWithdrawn(address indexed to, uint256 amount);
    event RescueToken(address indexed token, address indexed to, uint256 amount);
    event RescueNative(address indexed to, uint256 amount);
    event MintWhitelistEnabled(bool enabled);
    event MintWhitelistUpdated(address indexed account, bool allowed);
    event TradingOpenTimeConfigured(uint256 previousOpenTime, uint256 newOpenTime, bool appliedToToken);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && msg.sender != launchOperator) revert Unauthorized();
        _;
    }

    constructor(address owner_, address launchOperator_, address burnTokenImplementation_) {
        if (owner_ == address(0) || burnTokenImplementation_ == address(0)) revert InvalidConfig();
        owner = owner_;
        launchOperator = launchOperator_ == address(0) ? owner_ : launchOperator_;
        burnTokenImplementation = burnTokenImplementation_;
        launchStatus = LaunchStatus.UNINITIALIZED;
        emit OwnershipTransferred(address(0), owner_);
    }

    function configureLaunch(
        IBurnToken.InitParams calldata tokenParams,
        MintConfig calldata mintCfg,
        DeliveryConfig calldata deliveryCfg,
        LiquidityConfig calldata liquidityCfg
    ) external onlyOperator {
        _validateTokenParams(tokenParams);
        _validateMintConfig(mintCfg);
        _validateDeliveryConfig(deliveryCfg);
        _validateLiquidityConfig(liquidityCfg);

        _tokenInitParams = tokenParams;
        router = tokenParams.pancakeV2Router;
        quoteToken = tokenParams.poolQuoteToken;
        pair = tokenParams.dexPair;
        mintConfig = mintCfg;
        mintConfig.mintStartTime = block.timestamp;
        deliveryConfig = deliveryCfg;
        liquidityConfig = liquidityCfg;
        configuredTradingOpenTime = tokenParams.tradingOpenTime;

        if (launchStatus == LaunchStatus.UNINITIALIZED) {
            launchStatus = LaunchStatus.PREPARED;
        }

        emit LaunchConfigured(msg.sender, router, quoteToken);
    }

    function deployTokenClone() external onlyOperator returns (address deployedToken) {
        if (launchStatus != LaunchStatus.PREPARED || token != address(0)) revert InvalidPhase();

        deployedToken = _clone(burnTokenImplementation);
        token = deployedToken;
        emit TokenDeployed(deployedToken, pair, 0);
    }

    function attachExistingToken(address token_, address pair_) external onlyOperator {
        if (token_ == address(0)) revert InvalidConfig();
        token = token_;
        pair = pair_;
        tokenInitialized = pair_ != address(0);
        if (pair_ != address(0)) {
            _tokenInitParams.dexPair = pair_;
        }
        if (launchStatus == LaunchStatus.UNINITIALIZED) {
            launchStatus = LaunchStatus.PREPARED;
        }
        emit TokenDeployed(token_, pair_, pair_ == address(0) ? 0 : IBurnToken(token_).tradingOpenTime());
    }

    function createOrUsePair() external onlyOperator returns (address resolvedPair) {
        if (token == address(0) || router == address(0) || quoteToken == address(0)) revert InvalidConfig();

        IPancakeFactoryLike factory = IPancakeFactoryLike(IPancakeRouterLike(router).factory());
        resolvedPair = factory.getPair(token, quoteToken);
        bool createdNew = false;

        if (resolvedPair == address(0)) {
            resolvedPair = factory.createPair(token, quoteToken);
            createdNew = true;
        }

        if (resolvedPair == address(0)) revert InvalidConfig();
        pair = resolvedPair;
        _tokenInitParams.dexPair = resolvedPair;
        emit PairResolved(resolvedPair, createdNew);
    }

    function initializeToken() external onlyOperator {
        if (token == address(0) || pair == address(0) || tokenInitialized) revert InvalidPhase();

        IBurnToken.InitParams memory params = _copyInitParams();
        params.dexPair = pair;
        params.tradingOpenTime = block.timestamp + 36500 days;
        IBurnToken(token).initialize(params, address(this));

        tokenInitialized = true;
        emit TokenInitialized(token, pair, params.tradingOpenTime);
        emit TokenDeployed(token, pair, params.tradingOpenTime);
    }

    function openMintEarly() external onlyOperator {
        if (launchStatus != LaunchStatus.PREPARED || !tokenInitialized) revert InvalidPhase();
        mintConfig.mintStartTime = block.timestamp;
        launchStatus = LaunchStatus.MINT_LIVE;
    }

    function mint() external payable {
        if (mintConfig.mintMode != MintMode.BNB) revert InvalidPhase();
        _consumeMint(msg.sender, msg.value);
    }

    function mintWithQuoteToken(uint256 amount) external {
        if (mintConfig.mintMode != MintMode.QUOTE_TOKEN) revert InvalidPhase();
        if (quoteToken == address(0)) revert InvalidConfig();
        if (!IERC20Minimal(quoteToken).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        _consumeMint(msg.sender, amount);
    }

    function closeMint() external onlyOperator {
        if (mintClosed) revert MintClosedError();
        mintClosed = true;
        launchStatus = LaunchStatus.MINT_CLOSED;
        emit MintClosed(totalRaised, totalMintedCount);
    }

    function setMintWhitelistEnabled(bool enabled) external onlyOperator {
        mintWhitelistEnabled = enabled;
        emit MintWhitelistEnabled(enabled);
    }

    function setMintWhitelist(address account, bool allowed) external onlyOperator {
        if (account == address(0)) revert InvalidConfig();
        mintWhitelist[account] = allowed;
        emit MintWhitelistUpdated(account, allowed);
    }

    function batchSetMintWhitelist(address[] calldata accounts, bool allowed) external onlyOperator {
        for (uint256 i; i < accounts.length; i++) {
            address account = accounts[i];
            if (account == address(0)) revert InvalidConfig();
            mintWhitelist[account] = allowed;
            emit MintWhitelistUpdated(account, allowed);
        }
    }

    function setTradingOpenTime(uint256 newOpenTime) external onlyOperator {
        uint256 previousOpenTime = configuredTradingOpenTime;
        configuredTradingOpenTime = newOpenTime;
        bool appliedToToken = false;

        if (tokenInitialized && mintClosed) {
            IBurnToken(token).setTradingOpenTime(newOpenTime);
            appliedToToken = true;
            tradingOpened = block.timestamp >= newOpenTime;
            if (tradingOpened) {
                launchStatus = LaunchStatus.TRADING_OPENED;
            }
        }

        emit TradingOpenTimeConfigured(previousOpenTime, newOpenTime, appliedToToken);
    }

    function applyTradingOpenTime() external onlyOperator {
        if (!tokenInitialized || token == address(0) || !mintClosed) revert InvalidPhase();
        IBurnToken(token).setTradingOpenTime(configuredTradingOpenTime);
        tradingOpened = block.timestamp >= configuredTradingOpenTime;
        if (tradingOpened) {
            launchStatus = LaunchStatus.TRADING_OPENED;
        }
        emit TradingOpenTimeConfigured(configuredTradingOpenTime, configuredTradingOpenTime, true);
    }

    function finalizeMint() external onlyOperator returns (SettlementPreview memory preview) {
        if (!mintClosed) revert InvalidPhase();
        if (settlementLocked) revert InvalidPhase();

        preview = previewSettlement();
        settlementLocked = true;
        launchStatus = LaunchStatus.FINALIZED;

        emit LaunchFinalized(
            preview.totalUserTokenAllocation,
            preview.totalLiquidityFundAllocation,
            preview.totalLiquidityTokenAllocation,
            preview.totalReservedTokenAllocation
        );
    }

    function seedTokenInventory(uint256 amount) external onlyOperator {
        if (token == address(0) || !tokenInitialized || amount == 0) revert InvalidConfig();
        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit TokenInventorySeeded(msg.sender, amount);
    }

    function deliverUserTokens(address[] calldata users) external onlyOperator {
        if (token == address(0)) revert InvalidConfig();

        for (uint256 i; i < users.length; i++) {
            address user = users[i];
            if (tokenDelivered[user]) continue;

            uint256 amount = mintedTokenEntitlement[user];
            if (amount > 0) {
                if (!IERC20Minimal(token).transfer(user, amount)) revert TransferFailed();
            }
            tokenDelivered[user] = true;
            emit UserTokensDelivered(user, amount);
        }
    }

    function addLiquidity() external onlyOperator {
        if (!settlementLocked || liquidityAdded || !tokenInitialized) revert InvalidPhase();
        if (token == address(0) || router == address(0) || pair == address(0)) revert InvalidConfig();

        address receiver = resolvedLpReceiver();
        uint256 lpAmount;

        if (mintConfig.mintMode == MintMode.BNB) {
            if (!IERC20Minimal(token).approve(router, totalLiquidityTokenAllocation)) revert TransferFailed();
            (, , lpAmount) = IPancakeRouterLike(router).addLiquidityETH{value: totalLiquidityFundAllocation}(
                token,
                totalLiquidityTokenAllocation,
                0,
                0,
                receiver,
                block.timestamp
            );
        } else {
            if (quoteToken == address(0)) revert InvalidConfig();
            if (!IERC20Minimal(token).approve(router, totalLiquidityTokenAllocation)) revert TransferFailed();
            if (!IERC20Minimal(quoteToken).approve(router, totalLiquidityFundAllocation)) revert TransferFailed();
            (, , lpAmount) = IPancakeRouterLike(router).addLiquidity(
                token,
                quoteToken,
                totalLiquidityTokenAllocation,
                totalLiquidityFundAllocation,
                0,
                0,
                receiver,
                block.timestamp
            );
        }

        liquidityAdded = true;
        launchStatus = LaunchStatus.LIQUIDITY_ADDED;
        emit LiquidityAdded(totalLiquidityTokenAllocation, totalLiquidityFundAllocation, lpAmount, receiver);
    }

    function withdrawRaisedExcess(address to) external onlyOperator {
        if (!settlementLocked) revert InvalidPhase();
        if (to == address(0)) revert InvalidConfig();

        uint256 amount;
        if (mintConfig.mintMode == MintMode.BNB) {
            uint256 bal = address(this).balance;
            amount = bal > totalLiquidityFundAllocation ? bal - totalLiquidityFundAllocation : 0;
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            uint256 bal2 = IERC20Minimal(quoteToken).balanceOf(address(this));
            amount = bal2 > totalLiquidityFundAllocation ? bal2 - totalLiquidityFundAllocation : 0;
            if (amount > 0 && !IERC20Minimal(quoteToken).transfer(to, amount)) revert TransferFailed();
        }

        emit RaisedFundsWithdrawn(to, amount);
    }

    function rescueToken(address token_, address to, uint256 amount) external onlyOwner {
        if (token_ == address(0) || to == address(0)) revert InvalidConfig();
        uint256 rescueAmount = amount == 0 ? IERC20Minimal(token_).balanceOf(address(this)) : amount;
        if (rescueAmount == 0) revert InvalidConfig();
        if (!IERC20Minimal(token_).transfer(to, rescueAmount)) revert TransferFailed();
        emit RescueToken(token_, to, rescueAmount);
    }

    function rescueNative(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidConfig();
        uint256 rescueAmount = amount == 0 ? address(this).balance : amount;
        if (rescueAmount == 0) revert InvalidConfig();
        (bool ok, ) = payable(to).call{value: rescueAmount}("");
        if (!ok) revert TransferFailed();
        emit RescueNative(to, rescueAmount);
    }

    function syncTradingStatus() external onlyOperator {
        if (!mintClosed || token == address(0)) revert InvalidPhase();
        uint256 openTime = IBurnToken(token).tradingOpenTime();
        if (block.timestamp < openTime) revert InvalidPhase();
        tradingOpened = true;
        launchStatus = LaunchStatus.TRADING_OPENED;
        emit TradingStatusSynced(openTime, block.timestamp);
    }

    function previewSettlement() public view returns (SettlementPreview memory preview) {
        preview.totalUserTokenAllocation = totalUserTokenAllocation;
        preview.totalLiquidityFundAllocation = totalLiquidityFundAllocation;
        preview.totalLiquidityTokenAllocation = totalLiquidityTokenAllocation;
        preview.totalReservedTokenAllocation = _currentReservedTokenBalance(
            totalUserTokenAllocation,
            totalLiquidityTokenAllocation
        );
    }

    function resolvedLpReceiver() public view returns (address) {
        if (liquidityConfig.lpReceiverMode == LPReceiverMode.DEPLOYER) return owner;
        if (liquidityConfig.lpReceiverMode == LPReceiverMode.LAUNCH_OPERATOR) return launchOperator;
        return liquidityConfig.customLpReceiver;
    }

    function tokenInitPreview()
        external
        view
        returns (
            string memory name,
            string memory symbol,
            uint256 totalSupply,
            address dexPair,
            address taxProcessor,
            address pancakeV2Router,
            address poolQuoteToken,
            address stairTaxReceiver,
            uint8 launchType,
            uint256 tradingOpenTime,
            uint16 normalBuyTaxBps,
            uint16 normalSellTaxBps,
            uint16 poolBurnBpsPerHour,
            uint256 minPoolTokenBalance,
            uint256 taxPhaseCount
        )
    {
        IBurnToken.InitParams storage p = _tokenInitParams;
        return (
            p.name,
            p.symbol,
            p.totalSupply,
            p.dexPair,
            p.taxProcessor,
            p.pancakeV2Router,
            p.poolQuoteToken,
            p.stairTaxReceiver,
            p.launchType,
            p.tradingOpenTime,
            p.normalBuyTaxBps,
            p.normalSellTaxBps,
            p.poolBurnBpsPerHour,
            p.minPoolTokenBalance,
            p.taxPhases.length
        );
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfig();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _consumeMint(address user, uint256 payment) internal {
        if (launchStatus == LaunchStatus.PREPARED && block.timestamp >= mintConfig.mintStartTime) {
            launchStatus = LaunchStatus.MINT_LIVE;
        }
        if (launchStatus != LaunchStatus.MINT_LIVE) revert MintNotOpen();
        if (mintClosed) revert MintClosedError();
        if (mintWhitelistEnabled && !mintWhitelist[user]) revert MintWhitelistDenied();
        if (payment != mintConfig.mintPrice) revert InvalidPayment();
        if (mintedCount[user] >= mintConfig.maxMintPerWallet) revert WalletMintLimit();
        if (mintConfig.oneWalletOneMint && mintedCount[user] > 0) revert WalletMintLimit();
        if (totalMintedCount >= mintConfig.maxMintCount) revert GlobalMintLimit();

        mintedCount[user] += 1;
        mintedPaid[user] += payment;
        totalRaised += payment;
        totalMintedCount += 1;

        uint256 entitlement = _userAmountPerMint();
        mintedTokenEntitlement[user] += entitlement;
        totalUserTokenAllocation += entitlement;

        uint256 lpFundAmount = _lpFundsForCurrentMint(payment);
        uint256 lpTokenAmount = _lpTokensForCurrentMint();

        totalLiquidityFundAllocation += lpFundAmount;
        totalLiquidityTokenAllocation += lpTokenAmount;
        totalReservedTokenAllocation = _currentReservedTokenBalance(
            totalUserTokenAllocation,
            totalLiquidityTokenAllocation
        );

        uint256 lpAmount = _deliverAndAddLiquidity(user, entitlement, lpTokenAmount, lpFundAmount);

        emit MintParticipated(user, payment, entitlement, mintedCount[user]);
        emit InstantLiquidityProcessed(
            user,
            entitlement,
            lpTokenAmount,
            lpFundAmount,
            lpAmount,
            lpTokenAmount > 0 && lpFundAmount > 0 ? resolvedLpReceiver() : address(0)
        );

        if (mintConfig.autoFinishOnSoldOut && totalMintedCount >= mintConfig.maxMintCount) {
            mintClosed = true;
            launchStatus = LaunchStatus.MINT_CLOSED;
            emit MintClosed(totalRaised, totalMintedCount);
        }
    }

    function _userAmountPerMint() internal view returns (uint256) {
        if (deliveryConfig.userReceiveMode == UserReceiveMode.FIXED) {
            return deliveryConfig.userReceiveFixedAmount;
        }
        return (mintConfig.tokenPerMint * deliveryConfig.userReceiveShareBps) / BPS;
    }

    function _validateTokenParams(IBurnToken.InitParams calldata p) internal pure {
        if (
            bytes(p.name).length == 0 ||
            bytes(p.symbol).length == 0 ||
            p.totalSupply == 0 ||
            p.taxProcessor == address(0) ||
            p.pancakeV2Router == address(0) ||
            p.poolQuoteToken == address(0) ||
            p.stairTaxReceiver == address(0)
        ) revert InvalidConfig();
    }

    function _validateMintConfig(MintConfig calldata cfg) internal pure {
        if (cfg.mintPrice == 0 || cfg.tokenPerMint == 0) revert InvalidConfig();
        if (cfg.maxMintCount == 0 || cfg.maxMintPerWallet == 0) revert InvalidConfig();
    }

    function _validateDeliveryConfig(DeliveryConfig calldata cfg) internal pure {
        if (cfg.userReceiveMode == UserReceiveMode.FIXED) {
            if (cfg.userReceiveFixedAmount == 0) revert InvalidConfig();
        } else {
            if (cfg.userReceiveShareBps == 0 || cfg.userReceiveShareBps > BPS) revert InvalidConfig();
        }
    }

    function _validateLiquidityConfig(LiquidityConfig calldata cfg) internal pure {
        if (cfg.lpFundShareBps > BPS) revert InvalidConfig();
        if (cfg.lpTokenMode == LPTokenMode.FIXED_AMOUNT && cfg.lpTokenFixedAmount == 0) revert InvalidConfig();
        if (cfg.lpTokenMode == LPTokenMode.FIXED_SHARE && (cfg.lpTokenShareBps == 0 || cfg.lpTokenShareBps > BPS)) {
            revert InvalidConfig();
        }
        if (cfg.lpReceiverMode == LPReceiverMode.CUSTOM && cfg.customLpReceiver == address(0)) revert InvalidConfig();
    }

    function _deliverAndAddLiquidity(
        address user,
        uint256 entitlement,
        uint256 lpTokenAmount,
        uint256 lpFundAmount
    ) internal returns (uint256 lpAmount) {
        if (token == address(0) || !tokenInitialized) revert InvalidPhase();

        if (entitlement > 0) {
            if (!IERC20Minimal(token).transfer(user, entitlement)) revert TransferFailed();
            tokenDelivered[user] = true;
            emit UserTokensDelivered(user, entitlement);
        }

        if (lpTokenAmount == 0 || lpFundAmount == 0) {
            return 0;
        }

        address receiver = resolvedLpReceiver();
        _ensureAllowance(token, router, lpTokenAmount);

        if (mintConfig.mintMode == MintMode.BNB) {
            (, , lpAmount) = IPancakeRouterLike(router).addLiquidityETH{value: lpFundAmount}(
                token,
                lpTokenAmount,
                0,
                0,
                receiver,
                block.timestamp
            );
        } else {
            if (quoteToken == address(0)) revert InvalidConfig();
            _ensureAllowance(quoteToken, router, lpFundAmount);
            (, , lpAmount) = IPancakeRouterLike(router).addLiquidity(
                token,
                quoteToken,
                lpTokenAmount,
                lpFundAmount,
                0,
                0,
                receiver,
                block.timestamp
            );
        }

        liquidityAdded = true;
        emit LiquidityAdded(lpTokenAmount, lpFundAmount, lpAmount, receiver);
    }

    function _plannedLiquidityTokenAllocationForMaxMints() internal view returns (uint256) {
        uint256 supply = token == address(0) ? _tokenInitParams.totalSupply : IERC20Minimal(token).totalSupply();

        if (liquidityConfig.lpTokenMode == LPTokenMode.FIXED_AMOUNT) {
            return liquidityConfig.lpTokenFixedAmount;
        }
        if (liquidityConfig.lpTokenMode == LPTokenMode.FIXED_SHARE) {
            return (supply * liquidityConfig.lpTokenShareBps) / BPS;
        }

        uint256 plannedUserTokens = mintConfig.maxMintCount * _userAmountPerMint();
        return supply > plannedUserTokens ? supply - plannedUserTokens : 0;
    }

    function _plannedLiquidityFundAllocationForMaxMints() internal view returns (uint256) {
        return (mintConfig.mintPrice * mintConfig.maxMintCount * liquidityConfig.lpFundShareBps) / BPS;
    }

    function _lpFundsForCurrentMint(uint256 payment) internal view returns (uint256) {
        if (liquidityConfig.lpFundShareBps == 0) return 0;

        uint256 base = (payment * liquidityConfig.lpFundShareBps) / BPS;
        if (totalMintedCount >= mintConfig.maxMintCount) {
            uint256 plannedTotal = _plannedLiquidityFundAllocationForMaxMints();
            return plannedTotal > totalLiquidityFundAllocation ? plannedTotal - totalLiquidityFundAllocation : 0;
        }
        return base;
    }

    function _lpTokensForCurrentMint() internal view returns (uint256) {
        uint256 plannedTotal = _plannedLiquidityTokenAllocationForMaxMints();
        if (plannedTotal == 0) return 0;

        if (totalMintedCount >= mintConfig.maxMintCount) {
            return plannedTotal > totalLiquidityTokenAllocation ? plannedTotal - totalLiquidityTokenAllocation : 0;
        }

        return plannedTotal / mintConfig.maxMintCount;
    }

    function _currentReservedTokenBalance(uint256 userAllocated, uint256 lpAllocated) internal view returns (uint256) {
        uint256 supply = token == address(0) ? _tokenInitParams.totalSupply : IERC20Minimal(token).totalSupply();
        uint256 used = userAllocated + lpAllocated;
        return supply > used ? supply - used : 0;
    }

    function _ensureAllowance(address token_, address spender, uint256 amount) internal {
        if (amount == 0) return;
        uint256 allowance = IERC20Minimal(token_).allowance(address(this), spender);
        if (allowance >= amount) return;
        if (!IERC20Minimal(token_).approve(spender, type(uint256).max)) revert TransferFailed();
    }

    function _clone(address implementation) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        if (instance == address(0)) revert InvalidConfig();
    }

    function _copyInitParams() internal view returns (IBurnToken.InitParams memory params) {
        IBurnToken.InitParams storage source = _tokenInitParams;
        params.name = source.name;
        params.symbol = source.symbol;
        params.totalSupply = source.totalSupply;
        params.dexPair = source.dexPair;
        params.taxProcessor = source.taxProcessor;
        params.pancakeV2Router = source.pancakeV2Router;
        params.poolQuoteToken = source.poolQuoteToken;
        params.stairTaxReceiver = source.stairTaxReceiver;
        params.launchType = source.launchType;
        params.tradingOpenTime = source.tradingOpenTime;
        params.normalBuyTaxBps = source.normalBuyTaxBps;
        params.normalSellTaxBps = source.normalSellTaxBps;
        params.poolBurnBpsPerHour = source.poolBurnBpsPerHour;
        params.minPoolTokenBalance = source.minPoolTokenBalance;
        params.taxPhases = new IBurnToken.TaxPhase[](source.taxPhases.length);

        for (uint256 i; i < source.taxPhases.length; i++) {
            params.taxPhases[i] = source.taxPhases[i];
        }
    }

    receive() external payable {}
}
