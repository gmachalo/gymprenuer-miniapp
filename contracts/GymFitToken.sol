// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GymFitToken
 * @notice ERC-20 in-game currency for GymPrenuer on Base.
 *
 * Tokenomics (controlled emission):
 *   - Hard cap: 1,000,000,000 GYMFIT
 *   - Only addresses with MINTER_ROLE can mint (backend claimant)
 *   - Users can burn tokens (sink mechanic)
 *   - Owner can pause in emergencies
 *
 * Distribution plan (off-chain governance):
 *   40% — Game rewards (minted on-demand, never pre-minted)
 *   20% — Ecosystem fund (vested, multi-sig)
 *   20% — Liquidity (released at TGE)
 *   10% — Team (12-month cliff, 24-month vest)
 *   10% — Reserve
 */
contract GymFitToken is ERC20Burnable, ERC20Capped, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev Daily mint cap per address to prevent abuse (100,000 GYMFIT/day)
    uint256 public constant DAILY_MINT_CAP = 100_000 * 1e18;
    mapping(address => uint256) public lastMintDay;
    mapping(address => uint256) public dailyMinted;

    event TokensMinted(address indexed to, uint256 amount, string reason);

    constructor(address admin)
        ERC20("GymFit Token", "GYMFIT")
        ERC20Capped(1_000_000_000 * 1e18)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Mint tokens to a player address.
     * @param to      Recipient wallet
     * @param amount  Amount in wei (18 decimals)
     * @param reason  Human-readable reason (logged as event)
     */
    function mint(
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        // Daily cap reset
        uint256 today = block.timestamp / 1 days;
        if (lastMintDay[to] < today) {
            dailyMinted[to] = 0;
            lastMintDay[to] = today;
        }
        require(dailyMinted[to] + amount <= DAILY_MINT_CAP, "Daily mint cap exceeded");
        dailyMinted[to] += amount;

        _mint(to, amount);
        emit TokensMinted(to, amount, reason);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ERC20Capped + ERC20 override required
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
    {
        super._update(from, to, value);
    }
}
