// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.26;

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
// OpenZeppelin Contracts (last updated v5.5.0) (interfaces/draft-IERC6093.sol)


/**
 * @dev Standard ERC-20 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-20 tokens.
 */
interface IERC20Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC20InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC20InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `spender`鈥檚 `allowance`. Used in transfers.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     * @param allowance Amount of tokens a `spender` is allowed to operate with.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC20InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `spender` to be approved. Used in approvals.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC20InvalidSpender(address spender);
}

/**
 * @dev Standard ERC-721 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-721 tokens.
 */
interface IERC721Errors {
    /**
     * @dev Indicates that an address can't be an owner. For example, `address(0)` is a forbidden owner in ERC-721.
     * Used in balance queries.
     * @param owner Address of the current owner of a token.
     */
    error ERC721InvalidOwner(address owner);

    /**
     * @dev Indicates a `tokenId` whose `owner` is the zero address.
     * @param tokenId Identifier number of a token.
     */
    error ERC721NonexistentToken(uint256 tokenId);

    /**
     * @dev Indicates an error related to the ownership over a particular token. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param tokenId Identifier number of a token.
     * @param owner Address of the current owner of a token.
     */
    error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC721InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC721InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`鈥檚 approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param tokenId Identifier number of a token.
     */
    error ERC721InsufficientApproval(address operator, uint256 tokenId);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC721InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC721InvalidOperator(address operator);
}

/**
 * @dev Standard ERC-1155 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-1155 tokens.
 */
interface IERC1155Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     * @param tokenId Identifier number of a token.
     */
    error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC1155InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC1155InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`鈥檚 approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param owner Address of the current owner of a token.
     */
    error ERC1155MissingApprovalForAll(address operator, address owner);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC1155InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC1155InvalidOperator(address operator);

    /**
     * @dev Indicates an array length mismatch between ids and values in a safeBatchTransferFrom operation.
     * Used in batch transfers.
     * @param idsLength Length of the array of token identifiers
     * @param valuesLength Length of the array of token amounts
     */
    error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength);
}
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/extensions/IERC20Metadata.sol)

/**
 * @dev Interface for the optional metadata functions from the ERC-20 standard.
 */
interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/ERC20.sol)

/**
 * @dev Implementation of the {IERC20} interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using {_mint}.
 *
 * TIP: For a detailed writeup see our guide
 * https://forum.openzeppelin.com/t/how-to-implement-erc20-supply-mechanisms/226[How
 * to implement supply mechanisms].
 *
 * The default value of {decimals} is 18. To change this, you should override
 * this function so it returns a different value.
 *
 * We have followed general OpenZeppelin Contracts guidelines: functions revert
 * instead returning `false` on failure. This behavior is nonetheless
 * conventional and does not conflict with the expectations of ERC-20
 * applications.
 */
abstract contract ERC20 is Context, IERC20, IERC20Metadata, IERC20Errors {
    mapping(address account => uint256) private _balances;

    mapping(address account => mapping(address spender => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /**
     * @dev Sets the values for {name} and {symbol}.
     *
     * Both values are immutable: they can only be set once during construction.
     */
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the default value returned by this function, unless
     * it's overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    /// @inheritdoc IERC20
    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    /// @inheritdoc IERC20
    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `value`.
     */
    function transfer(address to, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, value);
        return true;
    }

    /// @inheritdoc IERC20
    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `value` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, value);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Skips emitting an {Approval} event indicating an allowance update. This is not
     * required by the ERC. See {xref-ERC20-_approve-address-address-uint256-bool-}[_approve].
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `value`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `value`.
     */
    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(from, to, value);
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                // Overflow not possible: value <= fromBalance <= totalSupply.
                _balances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            unchecked {
                // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
                _totalSupply -= value;
            }
        } else {
            unchecked {
                // Overflow not possible: balance + value is at most totalSupply, which we know fits into a uint256.
                _balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }

    /**
     * @dev Creates a `value` amount of tokens and assigns them to `account`, by transferring it from address(0).
     * Relies on the `_update` mechanism
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _mint(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(address(0), account, value);
    }

    /**
     * @dev Destroys a `value` amount of tokens from `account`, lowering the total supply.
     * Relies on the `_update` mechanism.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead
     */
    function _burn(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        _update(account, address(0), value);
    }

    /**
     * @dev Sets `value` as the allowance of `spender` over the `owner`'s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     *
     * Overrides to this logic should be done to the variant with an additional `bool emitEvent` argument.
     */
    function _approve(address owner, address spender, uint256 value) internal {
        _approve(owner, spender, value, true);
    }

    /**
     * @dev Variant of {_approve} with an optional flag to enable or disable the {Approval} event.
     *
     * By default (when calling {_approve}) the flag is set to true. On the other hand, approval changes made by
     * `_spendAllowance` during the `transferFrom` operation sets the flag to false. This saves gas by not emitting any
     * `Approval` event during `transferFrom` operations.
     *
     * Anyone who wishes to continue emitting `Approval` events on the `transferFrom` operation can force the flag to
     * true using the following override:
     *
     * ```solidity
     * function _approve(address owner, address spender, uint256 value, bool) internal virtual override {
     *     super._approve(owner, spender, value, true);
     * }
     * ```
     *
     * Requirements are the same as {_approve}.
     */
    function _approve(address owner, address spender, uint256 value, bool emitEvent) internal virtual {
        if (owner == address(0)) {
            revert ERC20InvalidApprover(address(0));
        }
        if (spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[owner][spender] = value;
        if (emitEvent) {
            emit Approval(owner, spender, value);
        }
    }

    /**
     * @dev Updates `owner`'s allowance for `spender` based on spent `value`.
     *
     * Does not update the allowance value in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Does not emit an {Approval} event.
     */
    function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance < type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(spender, currentAllowance, value);
            }
            unchecked {
                _approve(owner, spender, currentAllowance - value, false);
            }
        }
    }
}
interface ITaxProcessor {
    function registerToken(
        address token,
        address pair,
        bytes32 marketId,
        address quoteToken,
        address vaultTarget,
        uint8 vaultType,
        bytes32 poolVersion,
        uint16 buyTaxBps,
        uint16 sellTaxBps
    ) external;
    function processTax(address token, bool isBuy, uint256 quoteAmount) external payable;

    function tokenState(address token)
        external
        view
        returns (
            bool registered,
            address pair,
            bytes32 marketId,
            address quoteToken,
            address vaultTarget,
            address deployer,
            bytes32 poolVersion,
            uint8 vaultType,
            uint256 pendingQuoteAmount,
            uint16 buyTaxBps,
            uint16 sellTaxBps
        );
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(uint256, uint256, address[] calldata, address, uint256) external returns (uint256[] memory);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256, uint256, address[] calldata, address, uint256) external;
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) external returns (uint256,uint256,uint256);
    function factory() external view returns (address);
    function WETH() external view returns (address);
}



interface IV2PairSync {
    function sync() external;
}

/// @notice Tax token for BurnDeployer markets.
/// @dev Pool burning is public, but its rate and balance floor are immutable.
/// The owner configures whitelist entries during deployment and then renounces ownership.
/// Tax phases themselves are immutable after initialize.
contract BurnToken is ERC20, Ownable {
    uint16 public constant BPS = 10_000;
    uint8 public constant MAX_TAX_PHASES = 3;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    struct TaxPhase {
        /// @notice This phase applies until this many seconds have elapsed after tradingOpenTime.
        uint32 endAfterSeconds;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
    }

    enum LaunchType {
        Direct,
        Curve
    }

    struct InitParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address dexPair;
        address taxProcessor;
        address pancakeV2Router;
        address poolQuoteToken;
        /// @notice Receives the quote currency converted from every stair-tax phase.
        address stairTaxReceiver;
        LaunchType launchType;
        uint256 tradingOpenTime;
        uint16 normalBuyTaxBps;
        uint16 normalSellTaxBps;
        uint16 poolBurnBpsPerHour;
        uint256 minPoolTokenBalance;
        TaxPhase[] taxPhases;
    }

    string private _tokenName;
    string private _tokenSymbol;
    bool private _initialized;
    bool public isMigrate;
    address public tokenDeployer;
    address public dexPair;
    address public taxProcessor;
    address public pancakeV2Router;
    address public poolQuoteToken;
    /// @notice Receives quote currency after accrued stair-tax tokens are swapped on a sell.
    address public stairTaxReceiver;
    LaunchType public launchType;
    uint256 public tradingOpenTime;
    uint16 public normalBuyTaxBps;
    uint16 public normalSellTaxBps;
    /// @notice Fixed burn rate per accumulated hour, calculated from the current BurnToken balance in the Pair.
    uint16 public poolBurnBpsPerHour;
    uint256 public minPoolTokenBalance;
    uint40 public lastPoolBurnAt;
    mapping(address => bool) public taxWhitelist;
    TaxPhase[] private _taxPhases;
    bool private _swappingStairTax;

    error AlreadyInitialized();
    error InvalidConfig();
    error NotTokenDeployer();
    error TransferLocked();
    error AlreadyMigrated();
    error InvalidTaxPhase(uint256 index);

    event Migrated();
    event TaxWhitelistUpdated(address indexed account, bool allowed);
    event PoolTokensBurned(uint256 amount, uint256 pairBalanceBefore);
    event StairTaxAccrued(address indexed receiver, bool indexed isBuy, uint256 amount, uint256 phaseIndex);
    event StairTaxSwapped(address indexed receiver, address indexed quoteToken, uint256 tokenAmount, uint256 quoteAmount);
    event StairTaxSwapFailed(address indexed receiver, uint256 tokenAmount, bytes reason);
    event TaxProcessFailed(address indexed taxProcessor, bool isBuy, bytes reason);
    event RescueToken(address indexed token, address indexed to, uint256 amount);
    event RescueNative(address indexed to, uint256 amount);
    event TradingOpenTimeUpdated(uint256 previousOpenTime, uint256 newOpenTime);

    constructor() ERC20("", "") Ownable(msg.sender) {}

    function initialize(InitParams memory params, address tokenDeployer_) external {
        if (_initialized) revert AlreadyInitialized();
        if (
            tokenDeployer_ == address(0) || params.dexPair == address(0) || params.totalSupply == 0
                || params.taxPhases.length > MAX_TAX_PHASES
                || params.normalBuyTaxBps > BPS || params.normalSellTaxBps > BPS
                || params.poolBurnBpsPerHour > BPS
                || (params.poolBurnBpsPerHour != 0 && params.minPoolTokenBalance == 0)
        ) revert InvalidConfig();
        if ((params.normalBuyTaxBps != 0 || params.normalSellTaxBps != 0) && params.taxProcessor == address(0)) revert InvalidConfig();

        bool hasStairTax;
        uint32 previousEnd;
        for (uint256 i; i < params.taxPhases.length; ++i) {
            TaxPhase memory phase = params.taxPhases[i];
            if (
                phase.endAfterSeconds == 0 || phase.buyTaxBps > BPS || phase.sellTaxBps > BPS
                    || phase.endAfterSeconds <= previousEnd
                    || ((phase.buyTaxBps != 0 || phase.sellTaxBps != 0) && params.stairTaxReceiver == address(0))
            ) {
                revert InvalidTaxPhase(i);
            }
            if (phase.buyTaxBps != 0 || phase.sellTaxBps != 0) hasStairTax = true;
            previousEnd = phase.endAfterSeconds;
            _taxPhases.push(phase);
        }
        if (hasStairTax && (params.pancakeV2Router == address(0) || params.poolQuoteToken == address(0))) revert InvalidConfig();

        _initialized = true;
        _tokenName = params.name;
        _tokenSymbol = params.symbol;
        tokenDeployer = tokenDeployer_;
        taxWhitelist[tokenDeployer_] = true;
        if (params.taxProcessor != address(0)) {
            taxWhitelist[params.taxProcessor] = true;
        }
        dexPair = params.dexPair;
        taxProcessor = params.taxProcessor;
        pancakeV2Router = params.pancakeV2Router;
        poolQuoteToken = params.poolQuoteToken;
        stairTaxReceiver = params.stairTaxReceiver;
        launchType = params.launchType;
        tradingOpenTime = params.tradingOpenTime;
        normalBuyTaxBps = params.normalBuyTaxBps;
        normalSellTaxBps = params.normalSellTaxBps;
        poolBurnBpsPerHour = params.poolBurnBpsPerHour;
        minPoolTokenBalance = params.minPoolTokenBalance;
        lastPoolBurnAt = uint40(params.tradingOpenTime);
        _mint(tokenDeployer_, params.totalSupply);
        emit TaxWhitelistUpdated(tokenDeployer_, true);
        if (params.taxProcessor != address(0)) {
            emit TaxWhitelistUpdated(params.taxProcessor, true);
        }
    }

    function name() public view override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }

    function markMigrated() external {
        if (msg.sender != tokenDeployer) revert NotTokenDeployer();
        if (launchType != LaunchType.Curve) revert InvalidConfig();
        if (isMigrate) revert AlreadyMigrated();
        isMigrate = true;
        emit Migrated();
    }

    function setTradingOpenTime(uint256 newTradingOpenTime) external {
        if (msg.sender != tokenDeployer && msg.sender != owner()) revert NotTokenDeployer();
        uint256 previousOpenTime = tradingOpenTime;
        tradingOpenTime = newTradingOpenTime;
        if (uint256(lastPoolBurnAt) < newTradingOpenTime) {
            lastPoolBurnAt = uint40(newTradingOpenTime);
        }
        emit TradingOpenTimeUpdated(previousOpenTime, newTradingOpenTime);
    }

    function setTaxWhitelist(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert InvalidConfig();
        taxWhitelist[account] = allowed;
        emit TaxWhitelistUpdated(account, allowed);
    }

    function rescueToken(address token_, address to, uint256 amount) external onlyOwner {
        if (token_ == address(0) || to == address(0)) revert InvalidConfig();
        uint256 rescueAmount = amount == 0 ? IERC20(token_).balanceOf(address(this)) : amount;
        if (rescueAmount == 0) revert InvalidConfig();
        bool ok = IERC20(token_).transfer(to, rescueAmount);
        if (!ok) revert InvalidConfig();
        emit RescueToken(token_, to, rescueAmount);
    }

    function rescueNative(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidConfig();
        uint256 rescueAmount = amount == 0 ? address(this).balance : amount;
        if (rescueAmount == 0) revert InvalidConfig();
        (bool ok, ) = payable(to).call{value: rescueAmount}("");
        if (!ok) revert InvalidConfig();
        emit RescueNative(to, rescueAmount);
    }

    /// @notice An approval can lazily advance a due pool burn without depending on a keeper.
    function approve(address spender, uint256 value) public override returns (bool) {
        bool approved = super.approve(spender, value);
        _executePoolBurn();
        return approved;
    }

    function taxPhaseCount() external view returns (uint256) {
        return _taxPhases.length;
    }

    function taxPhaseAt(uint256 index) external view returns (TaxPhase memory) {
        return _taxPhases[index];
    }

    function currentTaxBps() public view returns (uint16 buyTaxBps, uint16 sellTaxBps, uint256 phaseIndex) {
        uint256 length = _taxPhases.length;
        if (block.timestamp < tradingOpenTime) return (0, 0, 0);
        uint256 elapsedSeconds = block.timestamp - tradingOpenTime;
        for (uint256 i; i < length; ++i) {
            TaxPhase memory phase = _taxPhases[i];
            if (elapsedSeconds < phase.endAfterSeconds) return (phase.buyTaxBps, phase.sellTaxBps, i);
        }
        return (normalBuyTaxBps, normalSellTaxBps, length);
    }

    /// @notice Publicly burns a fixed percentage of the Pair's BurnToken balance for every fully elapsed hour.
    /// @dev Callers do not need to execute this every hour: missed hours are settled together.
    function executePoolBurn() external returns (uint256 amount) {
        return _executePoolBurn();
    }

    function _executePoolBurn() private returns (uint256 amount) {
        if (block.timestamp < tradingOpenTime) return 0;
        if (launchType == LaunchType.Curve && !isMigrate) return 0;
        uint256 nextExecutionTime = uint256(lastPoolBurnAt) + 1 hours;
        if (poolBurnBpsPerHour == 0 || block.timestamp < nextExecutionTime) return 0;
        uint256 elapsedHours = (block.timestamp - uint256(lastPoolBurnAt)) / 1 hours;
        lastPoolBurnAt += uint40(elapsedHours * 1 hours);
        uint256 pairBalance = balanceOf(dexPair);
        if (pairBalance <= minPoolTokenBalance) return 0;
        amount = ((pairBalance * poolBurnBpsPerHour) / BPS) * elapsedHours;
        uint256 maximum = pairBalance - minPoolTokenBalance;
        if (amount > maximum) amount = maximum;
        if (amount == 0) return 0;
        super._update(dexPair, DEAD, amount);
        IV2PairSync(dexPair).sync();
        emit PoolTokensBurned(amount, pairBalance);
    }

    function _update(address from, address to, uint256 value) internal override {
        // Router pulls the accrued tax tokens from this contract during the sell-side swap.
        // That internal transfer must not be taxed again.
        if (_swappingStairTax) {
            super._update(from, to, value);
            return;
        }
        if (from != address(0) && to != address(0)) {
            if (taxWhitelist[from] || taxWhitelist[to]) {
                super._update(from, to, value);
                _afterNonPairTransfer(from, to);
                return;
            }
            if (block.timestamp < tradingOpenTime) revert TransferLocked();
            (uint16 taxBps, address taxReceiver, bool isBuy, uint256 phaseIndex, bool useTaxProcessor) = _transferTaxConfig(from, to);
            if (useTaxProcessor) {
                uint256 taxAmount = (value * taxBps) / BPS;
                if (taxAmount != 0) super._update(from, taxProcessor, taxAmount);
                if (!isBuy) _swapAccruedStairTax();
                try ITaxProcessor(taxProcessor).processTax(address(this), isBuy, 0) {} catch (bytes memory reason) {
                    emit TaxProcessFailed(taxProcessor, isBuy, reason);
                }
                super._update(from, to, value - taxAmount);
                _afterNonPairTransfer(from, to);
                return;
            }
            if (taxReceiver != address(0) && taxBps != 0) {
                uint256 taxAmount = (value * taxBps) / BPS;
                if (taxAmount != 0) {
                    // Buy-side tax cannot be swapped while the Pair is in its swap lock, so it is held here.
                    super._update(from, address(this), taxAmount);
                    emit StairTaxAccrued(taxReceiver, isBuy, taxAmount, phaseIndex);
                }
                if (!isBuy) _swapAccruedStairTax();
                super._update(from, to, value - taxAmount);
                _afterNonPairTransfer(from, to);
                return;
            }
        }
        super._update(from, to, value);
        if (to == dexPair) _swapAccruedStairTax();
        _afterNonPairTransfer(from, to);
    }

    /// @dev Sells high-tax tokens only on a sell-side transfer, after they were accumulated from buys.
    ///      The quote proceeds are paid directly to the configured receiver (WBNB remains WBNB).
    function _swapAccruedStairTax() private {
        if (_swappingStairTax || stairTaxReceiver == address(0) || pancakeV2Router == address(0)) return;
        uint256 tokenAmount = balanceOf(address(this));
        if (tokenAmount == 0) return;

        _swappingStairTax = true;
        _approve(address(this), pancakeV2Router, 0);
        _approve(address(this), pancakeV2Router, tokenAmount);
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = poolQuoteToken;
        try IUniswapV2Router(pancakeV2Router).swapExactTokensForTokens(
            tokenAmount, 0, path, stairTaxReceiver, block.timestamp
        ) returns (uint256[] memory amounts) {
            _approve(address(this), pancakeV2Router, 0);
            if (amounts.length < 2) {
                emit StairTaxSwapFailed(stairTaxReceiver, tokenAmount, bytes("invalid swap result"));
            } else {
                uint256 quoteAmount = amounts[amounts.length - 1];
                emit StairTaxSwapped(stairTaxReceiver, poolQuoteToken, tokenAmount, quoteAmount);
            }
        } catch (bytes memory reason) {
            _approve(address(this), pancakeV2Router, 0);
            emit StairTaxSwapFailed(stairTaxReceiver, tokenAmount, reason);
        }
        _swappingStairTax = false;
    }

    function _afterNonPairTransfer(address from, address to) private {
        if (from == address(0) || to == address(0) || from == dexPair || to == dexPair) return;
        _executePoolBurn();
    }

    function _transferTaxConfig(address from, address to)
        internal
        view
        returns (uint16 taxBps, address taxReceiver, bool isBuy, uint256 phaseIndex, bool useTaxProcessor)
    {
        uint256 length = _taxPhases.length;
        if (block.timestamp < tradingOpenTime) return (0, address(0), false, 0, false);
        uint256 elapsedSeconds = block.timestamp - tradingOpenTime;
        for (uint256 i; i < length; ++i) {
            TaxPhase memory phase = _taxPhases[i];
            if (elapsedSeconds >= phase.endAfterSeconds) continue;
            if (from == dexPair) return (phase.buyTaxBps, stairTaxReceiver, true, i, false);
            if (to == dexPair) return (phase.sellTaxBps, stairTaxReceiver, false, i, false);
            return (0, address(0), false, i, false);
        }
        bool shouldProcess = taxProcessor != address(0) && (normalBuyTaxBps != 0 || normalSellTaxBps != 0);
        if (from == dexPair) return (normalBuyTaxBps, taxProcessor, true, length, shouldProcess);
        if (to == dexPair) return (normalSellTaxBps, taxProcessor, false, length, shouldProcess);
    }

    receive() external payable {}
}
