// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IRouterLike {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

contract BuybackBurnProcessor {
    uint16 public constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    struct TokenConfig {
        bool registered;
        address pair;
        address quoteToken;
        bool onlyOnSell;
        uint32 intervalSeconds;
        uint256 buybackSpendAmount;
        uint256 maxTaxSwapAmount;
        uint256 lastBuybackAt;
    }

    address public owner;
    address public immutable router;
    mapping(address => TokenConfig) public tokenConfigs;

    error Unauthorized();
    error InvalidConfig();
    error InvalidToken();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenRegistered(address indexed token, address indexed pair, address indexed quoteToken);
    event TokenConfigUpdated(
        address indexed token,
        bool onlyOnSell,
        uint32 intervalSeconds,
        uint256 buybackSpendAmount,
        uint256 maxTaxSwapAmount
    );
    event TaxSwapped(address indexed token, uint256 tokenAmount, uint256 quoteAmount);
    event BuybackBurned(address indexed token, address indexed quoteToken, uint256 quoteSpent, uint256 burnAmount);
    event RescueToken(address indexed token, address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyRegistered(address token) {
        if (!tokenConfigs[token].registered) revert InvalidToken();
        _;
    }

    constructor(address owner_, address router_) {
        if (owner_ == address(0) || router_ == address(0)) revert InvalidConfig();
        owner = owner_;
        router = router_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfig();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function registerToken(
        address token,
        address pair,
        bytes32,
        address quoteToken,
        address,
        uint8,
        bytes32,
        uint16,
        uint16
    ) external onlyOwner {
        if (token == address(0) || pair == address(0) || quoteToken == address(0)) revert InvalidConfig();
        TokenConfig storage cfg = tokenConfigs[token];
        cfg.registered = true;
        cfg.pair = pair;
        cfg.quoteToken = quoteToken;
        if (cfg.intervalSeconds == 0) cfg.intervalSeconds = 60;
        emit TokenRegistered(token, pair, quoteToken);
    }

    function configureToken(
        address token,
        bool onlyOnSell,
        uint32 intervalSeconds,
        uint256 buybackSpendAmount,
        uint256 maxTaxSwapAmount
    ) external onlyOwner onlyRegistered(token) {
        if (intervalSeconds == 0) revert InvalidConfig();
        TokenConfig storage cfg = tokenConfigs[token];
        cfg.onlyOnSell = onlyOnSell;
        cfg.intervalSeconds = intervalSeconds;
        cfg.buybackSpendAmount = buybackSpendAmount;
        cfg.maxTaxSwapAmount = maxTaxSwapAmount;
        emit TokenConfigUpdated(token, onlyOnSell, intervalSeconds, buybackSpendAmount, maxTaxSwapAmount);
    }

    function processTax(address token, bool isBuy, uint256) external {
        if (msg.sender != token) revert Unauthorized();
        TokenConfig storage cfg = tokenConfigs[token];
        if (!cfg.registered) return;
        if (cfg.onlyOnSell && isBuy) return;

        uint256 tokenBalance = IERC20Like(token).balanceOf(address(this));
        uint256 taxSwapAmount = tokenBalance;
        if (cfg.maxTaxSwapAmount != 0 && taxSwapAmount > cfg.maxTaxSwapAmount) {
            taxSwapAmount = cfg.maxTaxSwapAmount;
        }

        if (taxSwapAmount > 0) {
            uint256 quoteBefore = IERC20Like(cfg.quoteToken).balanceOf(address(this));
            _approveMax(token, router, taxSwapAmount);
            address[] memory sellPath = new address[](2);
            sellPath[0] = token;
            sellPath[1] = cfg.quoteToken;
            IRouterLike(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                taxSwapAmount,
                0,
                sellPath,
                address(this),
                block.timestamp
            );
            uint256 quoteAfter = IERC20Like(cfg.quoteToken).balanceOf(address(this));
            if (quoteAfter > quoteBefore) {
                emit TaxSwapped(token, taxSwapAmount, quoteAfter - quoteBefore);
            }
        }

        if (cfg.buybackSpendAmount == 0) return;
        if (block.timestamp < cfg.lastBuybackAt + cfg.intervalSeconds) return;

        uint256 quoteBalance = IERC20Like(cfg.quoteToken).balanceOf(address(this));
        if (quoteBalance < cfg.buybackSpendAmount) return;

        uint256 burnBefore = IERC20Like(token).balanceOf(DEAD);
        _approveMax(cfg.quoteToken, router, cfg.buybackSpendAmount);
        address[] memory buyPath = new address[](2);
        buyPath[0] = cfg.quoteToken;
        buyPath[1] = token;
        IRouterLike(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            cfg.buybackSpendAmount,
            0,
            buyPath,
            DEAD,
            block.timestamp
        );
        cfg.lastBuybackAt = block.timestamp;
        uint256 burnAfter = IERC20Like(token).balanceOf(DEAD);
        emit BuybackBurned(token, cfg.quoteToken, cfg.buybackSpendAmount, burnAfter > burnBefore ? burnAfter - burnBefore : 0);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert InvalidConfig();
        uint256 rescueAmount = amount == 0 ? IERC20Like(token).balanceOf(address(this)) : amount;
        if (rescueAmount == 0) revert InvalidConfig();
        bool ok = IERC20Like(token).transfer(to, rescueAmount);
        if (!ok) revert InvalidConfig();
        emit RescueToken(token, to, rescueAmount);
    }

    function _approveMax(address token, address spender, uint256 amount) internal {
        IERC20Like(token).approve(spender, 0);
        IERC20Like(token).approve(spender, amount);
    }
}
