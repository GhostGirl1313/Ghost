// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

import '@mimic-fi/v2-bridge-connector/contracts/interfaces/IHopL2AMM.sol';
import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-helpers/contracts/utils/EnumerableMap.sol';

import './BaseHopBridger.sol';

contract L2HopBridger is BaseHopBridger {
    using FixedPoint for uint256;
    using EnumerableMap for EnumerableMap.AddressToAddressMap;

    // Base gas amount charged to cover gas payment
    uint256 public constant override BASE_GAS = 120e3;

    uint256 public maxBonderFeePct;
    EnumerableMap.AddressToAddressMap private tokenAmms;

    event MaxBonderFeePctSet(uint256 maxBonderFeePct);
    event TokenAmmSet(address indexed token, address indexed amm);

    struct HopAmmParams {
        address token;
        address amm;
    }

    struct Config {
        address admin;
        address registry;
        address smartVault;
        uint256 maxDeadline;
        uint256 maxSlippage;
        uint256 maxBonderFeePct;
        uint256 destinationChainId;
        HopAmmParams[] hopAmmParams;
        address thresholdToken;
        uint256 thresholdAmount;
        address relayer;
        uint256 gasPriceLimit;
    }

    constructor(Config memory config) BaseAction(config.admin, config.registry) {
        require(address(config.smartVault) != address(0), 'SMART_VAULT_ZERO');
        smartVault = ISmartVault(config.smartVault);
        emit SmartVaultSet(config.smartVault);

        if (config.maxDeadline > 0) _setMaxDeadline(config.maxDeadline);
        if (config.maxSlippage > 0) _setMaxSlippage(config.maxSlippage);
        if (config.maxBonderFeePct > 0) _setMaxBonderFeePct(config.maxBonderFeePct);
        if (config.destinationChainId > 0) _setDestinationChainId(config.destinationChainId);
        for (uint256 i = 0; i < config.hopAmmParams.length; i++) {
            _setTokenAmm(config.hopAmmParams[i].token, config.hopAmmParams[i].amm);
        }

        thresholdToken = config.thresholdToken;
        thresholdAmount = config.thresholdAmount;
        emit ThresholdSet(config.thresholdToken, config.thresholdAmount);

        isRelayer[config.relayer] = true;
        emit RelayerSet(config.relayer, true);

        gasPriceLimit = config.gasPriceLimit;
        emit LimitsSet(config.gasPriceLimit, 0);
    }

    function getTokensLength() external view override returns (uint256) {
        return tokenAmms.length();
    }

    function getTokenAmm(address token) external view returns (address amm) {
        (, amm) = tokenAmms.tryGet(token);
    }

    function getTokens() external view override returns (address[] memory tokens) {
        tokens = new address[](tokenAmms.length());
        for (uint256 i = 0; i < tokens.length; i++) {
            (address token, ) = tokenAmms.at(i);
            tokens[i] = token;
        }
    }

    function getTokenAmms() external view returns (address[] memory tokens, address[] memory amms) {
        tokens = new address[](tokenAmms.length());
        amms = new address[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            (address token, address amm) = tokenAmms.at(i);
            tokens[i] = token;
            amms[i] = amm;
        }
    }

    function setMaxBonderFeePct(uint256 newMaxBonderFeePct) external auth {
        _setMaxBonderFeePct(newMaxBonderFeePct);
    }

    function setTokenAmm(address token, address amm) external auth {
        _setTokenAmm(token, amm);
    }

    function call(address token, uint256 slippage, uint256 bonderFee) external auth nonReentrant {
        _initRelayedTx();
        uint256 balance = _balanceOf(token);
        bytes memory data = _prepareBridge(token, balance, slippage, bonderFee);
        uint256 gasRefund = _payRelayedTx(token);
        _bridge(token, balance - gasRefund, slippage, data);
    }

    function _prepareBridge(address token, uint256 amount, uint256 slippage, uint256 bonderFee)
        internal
        returns (bytes memory)
    {
        (bool existsAmm, address amm) = tokenAmms.tryGet(token);
        require(existsAmm, 'BRIDGER_TOKEN_AMM_NOT_SET');
        require(amount > 0, 'BRIDGER_AMOUNT_ZERO');
        require(destinationChainId != 0, 'BRIDGER_CHAIN_NOT_SET');
        require(slippage <= maxSlippage, 'BRIDGER_SLIPPAGE_ABOVE_MAX');
        require(bonderFee.divUp(amount) <= maxBonderFeePct, 'BRIDGER_BONDER_FEE_ABOVE_MAX');
        _validateThreshold(token, amount);

        bytes memory data = _bridgingToL1()
            ? abi.encode(amm, bonderFee)
            : abi.encode(amm, bonderFee, block.timestamp + maxDeadline);

        emit Executed();
        return data;
    }

    function _setMaxBonderFeePct(uint256 newMaxBonderFeePct) internal {
        require(newMaxBonderFeePct <= FixedPoint.ONE, 'BRIDGER_BONDER_FEE_PCT_ABOVE_ONE');
        maxBonderFeePct = newMaxBonderFeePct;
        emit MaxBonderFeePctSet(newMaxBonderFeePct);
    }

    function _setTokenAmm(address token, address amm) internal {
        require(token != address(0), 'BRIDGER_TOKEN_ZERO');
        require(!Denominations.isNativeToken(token), 'BRIDGER_NATIVE_TOKEN');
        amm == address(0) ? tokenAmms.remove(token) : tokenAmms.set(token, amm);
        emit TokenAmmSet(token, amm);
    }
}
