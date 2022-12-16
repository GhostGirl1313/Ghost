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
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';
import '@mimic-fi/v2-helpers/contracts/utils/EnumerableMap.sol';
import '@mimic-fi/v2-smart-vaults-base/contracts/actions/BaseAction.sol';
import '@mimic-fi/v2-smart-vaults-base/contracts/actions/TokenThresholdAction.sol';
import '@mimic-fi/v2-smart-vaults-base/contracts/actions/RelayedAction.sol';

contract L2HopSwapper is BaseAction, RelayedAction {
    using FixedPoint for uint256;
    using UncheckedMath for uint256;
    using EnumerableMap for EnumerableMap.AddressToAddressMap;

    // Base gas amount charged to cover gas payment
    uint256 public constant override BASE_GAS = 80e3;

    // Hop Exchange source number
    uint8 internal constant HOP_SOURCE = 5;

    uint256 public maxSlippage;
    EnumerableMap.AddressToAddressMap private tokenAmms;

    event MaxSlippageSet(uint256 maxSlippage);
    event TokenAmmSet(address indexed token, address indexed amm);

    constructor(address admin, address registry) BaseAction(admin, registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function getTokensLength() external view returns (uint256) {
        return tokenAmms.length();
    }

    function getTokenAmm(address token) external view returns (address amm) {
        (, amm) = tokenAmms.tryGet(token);
    }

    function getTokens() external view returns (address[] memory tokens) {
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

    function canExecute(address token, uint256 slippage) external view returns (bool) {
        return tokenAmms.contains(token) && slippage <= maxSlippage;
    }

    function setMaxSlippage(uint256 newMaxSlippage) external auth {
        require(newMaxSlippage <= FixedPoint.ONE, 'SWAPPER_SLIPPAGE_ABOVE_ONE');
        maxSlippage = newMaxSlippage;
        emit MaxSlippageSet(newMaxSlippage);
    }

    function setTokenAmm(address token, address amm) external auth {
        require(token != address(0), 'SWAPPER_TOKEN_ZERO');
        require(amm == address(0) || IHopL2AMM(amm).l2CanonicalToken() == token, 'SWAPPER_AMM_TOKEN_DOES_NOT_MATCH');
        amm == address(0) ? tokenAmms.remove(token) : tokenAmms.set(token, amm);
        emit TokenAmmSet(token, amm);
    }

    function call(address token, uint256 slippage) external auth {
        (isRelayer[msg.sender] ? _relayedCall : _call)(token, slippage);
    }

    function _relayedCall(address token, uint256 slippage) internal redeemGas {
        _call(token, slippage);
    }

    function _call(address token, uint256 slippage) internal {
        (bool existsAmm, address amm) = tokenAmms.tryGet(token);
        require(existsAmm, 'SWAPPER_TOKEN_AMM_NOT_SET');
        require(slippage <= maxSlippage, 'SWAPPER_SLIPPAGE_ABOVE_MAX');

        address hToken = IHopL2AMM(amm).hToken();
        uint256 balance = _balanceOf(hToken);
        bytes memory data = abi.encode(IHopL2AMM(amm).exchangeAddress());
        uint256 minAmountOut = balance.mulUp(FixedPoint.ONE.uncheckedSub(slippage));
        smartVault.swap(HOP_SOURCE, hToken, token, balance, ISmartVault.SwapLimit.MinAmountOut, minAmountOut, data);
        emit Executed();
    }
}
