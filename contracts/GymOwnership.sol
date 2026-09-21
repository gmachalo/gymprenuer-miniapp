// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GymOwnership
 * @notice ERC-721 representing gym ownership on Base.
 *         Each token = one gym. Supports co-ownership revenue splitting.
 *
 * Revenue flow:
 *   1. Off-chain backend calls distributeRevenue() with GYMFIT amount
 *   2. Contract splits to co-owners per their share %
 *   3. Co-owners call release() to withdraw their balance
 */
contract GymOwnership is ERC721URIStorage, Ownable2Step, ReentrancyGuard {
    IERC20 public immutable gymFitToken;

    struct CoOwner {
        address wallet;
        uint256 sharePercent; // out of 100
    }

    struct GymData {
        string  name;
        uint256 createdAt;
        bool    active;
    }

    uint256 private _nextTokenId;

    mapping(uint256 => GymData)      public gymData;
    mapping(uint256 => CoOwner[])    public gymCoOwners;
    mapping(uint256 => mapping(address => uint256)) public pendingRelease;

    event GymCreated(uint256 indexed gymId, address indexed owner, string name);
    event RevenueDistributed(uint256 indexed gymId, uint256 totalAmount);
    event RevenueReleased(uint256 indexed gymId, address indexed recipient, uint256 amount);

    constructor(address gymFitToken_, address initialOwner)
        ERC721("GymPrenuer Ownership", "GYMOWN")
        Ownable(initialOwner)
    {
        gymFitToken = IERC20(gymFitToken_);
    }

    /**
     * @notice Create a new gym, minting an ownership NFT.
     * @param to         Initial owner wallet
     * @param name       Gym name
     * @param coOwners   Array of co-owner wallets
     * @param shares     Matching array of share percentages (must sum <= 100)
     */
    function createGym(
        address to,
        string calldata name,
        address[] calldata coOwners,
        uint256[] calldata shares
    ) external onlyOwner returns (uint256 gymId) {
        require(coOwners.length == shares.length, "Length mismatch");

        uint256 totalShares;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShares += shares[i];
        }
        require(totalShares <= 100, "Shares exceed 100%");

        gymId = _nextTokenId++;
        _safeMint(to, gymId);
        gymData[gymId] = GymData({ name: name, createdAt: block.timestamp, active: true });

        for (uint256 i = 0; i < coOwners.length; i++) {
            gymCoOwners[gymId].push(CoOwner({ wallet: coOwners[i], sharePercent: shares[i] }));
        }

        emit GymCreated(gymId, to, name);
    }

    /**
     * @notice Distribute GYMFIT revenue to co-owners.
     *         Caller must have pre-approved this contract for `amount`.
     */
    function distributeRevenue(uint256 gymId, uint256 amount)
        external
        nonReentrant
    {
        require(gymData[gymId].active, "Gym not active");
        require(
            gymFitToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        CoOwner[] storage owners = gymCoOwners[gymId];
        uint256 distributed;
        for (uint256 i = 0; i < owners.length; i++) {
            uint256 cut = (amount * owners[i].sharePercent) / 100;
            pendingRelease[gymId][owners[i].wallet] += cut;
            distributed += cut;
        }

        // Remainder (from rounding or unallocated %) stays claimable by NFT owner
        address nftOwner = ownerOf(gymId);
        if (distributed < amount) {
            pendingRelease[gymId][nftOwner] += (amount - distributed);
        }

        emit RevenueDistributed(gymId, amount);
    }

    /**
     * @notice Co-owner withdraws their pending GYMFIT balance for a gym.
     */
    function release(uint256 gymId) external nonReentrant {
        uint256 amount = pendingRelease[gymId][msg.sender];
        require(amount > 0, "Nothing to release");
        pendingRelease[gymId][msg.sender] = 0;
        require(gymFitToken.transfer(msg.sender, amount), "Transfer failed");
        emit RevenueReleased(gymId, msg.sender, amount);
    }

    function getCoOwners(uint256 gymId) external view returns (CoOwner[] memory) {
        return gymCoOwners[gymId];
    }
}
