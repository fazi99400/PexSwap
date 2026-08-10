// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Asset.sol";
import "./LifeloxDualPair.sol";

/// @title LifeloxDualFactory - deploys and tracks cross-lane pools.
/// @notice A pool is identified by its two assets (Solidity address or Rust id),
///         not by two addresses, so the registry is keyed by a hash of the sorted
///         asset pair. Pair addresses are deterministic (CREATE2).
contract LifeloxDualFactory {
    using AssetLib for Asset;

    address[] public allPairs;
    mapping(bytes32 => address) public getPairByHash;

    event PairCreated(Asset asset0, Asset asset1, address pair, uint256 index);

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// Canonical hash of an unordered asset pair.
    function pairHash(Asset memory a, Asset memory b) public pure returns (bytes32) {
        (Asset memory x, Asset memory y) = a.key() < b.key() ? (a, b) : (b, a);
        return keccak256(abi.encode(x.lane, x.token, x.id, y.lane, y.token, y.id));
    }

    function getPair(Asset calldata a, Asset calldata b) external view returns (address) {
        return getPairByHash[pairHash(a, b)];
    }

    function createPair(Asset calldata a, Asset calldata b) external returns (address pair) {
        require(!a.eq(b), "Lifelox: IDENTICAL_ASSETS");
        (Asset memory a0, Asset memory a1) = a.key() < b.key() ? (a, b) : (b, a);
        bytes32 h = pairHash(a, b);
        require(getPairByHash[h] == address(0), "Lifelox: PAIR_EXISTS");

        bytes memory bytecode = type(LifeloxDualPair).creationCode;
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), h)
        }
        LifeloxDualPair(payable(pair)).initialize(a0, a1);

        getPairByHash[h] = pair;
        allPairs.push(pair);
        emit PairCreated(a0, a1, pair, allPairs.length);
    }

    /// Init-code hash for off-chain CREATE2 address computation.
    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(LifeloxDualPair).creationCode);
    }
}
