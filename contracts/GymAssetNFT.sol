// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title GymAssetNFT
 * @notice ERC-1155 multi-token for all GymPrenuer in-game assets.
 *
 * Token ID ranges:
 *   0    – 9,999   : Character types (body type + stage combos)
 *   10,000 – 19,999: Equipment NFTs
 *   20,000 – 29,999: Workout Plan NFTs
 *   30,000 – 39,999: Trainer card NFTs
 */
contract GymAssetNFT is ERC1155Supply, AccessControl {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER   = keccak256("URI_SETTER");

    string public name   = "GymPrenuer Assets";
    string public symbol = "GYMFT";

    string private _baseURI;
    mapping(uint256 => string) private _tokenURIs;

    // ID range labels for events
    uint256 public constant CHARACTERS_MAX   = 9_999;
    uint256 public constant EQUIPMENT_MIN    = 10_000;
    uint256 public constant EQUIPMENT_MAX    = 19_999;
    uint256 public constant PLANS_MIN        = 20_000;
    uint256 public constant PLANS_MAX        = 29_999;
    uint256 public constant TRAINERS_MIN     = 30_000;
    uint256 public constant TRAINERS_MAX     = 39_999;

    event AssetMinted(address indexed to, uint256 id, uint256 amount, string assetType);

    constructor(address admin, string memory baseURI_) ERC1155(baseURI_) {
        _baseURI = baseURI_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(URI_SETTER, admin);
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
        emit AssetMinted(to, id, amount, _assetType(id));
    }

    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        _mintBatch(to, ids, amounts, data);
    }

    function setTokenURI(uint256 id, string calldata tokenURI_)
        external onlyRole(URI_SETTER)
    {
        _tokenURIs[id] = tokenURI_;
    }

    function uri(uint256 id) public view override returns (string memory) {
        string memory custom = _tokenURIs[id];
        if (bytes(custom).length > 0) return custom;
        return string(abi.encodePacked(_baseURI, id.toString(), ".json"));
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _assetType(uint256 id) internal pure returns (string memory) {
        if (id <= CHARACTERS_MAX) return "character";
        if (id <= EQUIPMENT_MAX) return "equipment";
        if (id <= PLANS_MAX) return "plan";
        if (id <= TRAINERS_MAX) return "trainer";
        return "unknown";
    }
}
