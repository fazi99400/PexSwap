// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ILifeloxFactory.sol";
import "./LifeloxPair.sol";

/// @title LifeloxFactory - deploys deterministic Lifelox pairs and tracks the registry.
contract LifeloxFactory is ILifeloxFactory {
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @dev Deterministic address via CREATE2 so the router can compute pairs off-chain.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Lifelox: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Lifelox: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "Lifelox: PAIR_EXISTS");

        bytes memory bytecode = type(LifeloxPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        LifeloxPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "Lifelox: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "Lifelox: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }

    /// @notice Init code hash for off-chain CREATE2 pair address computation.
    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(LifeloxPair).creationCode);
    }
}
