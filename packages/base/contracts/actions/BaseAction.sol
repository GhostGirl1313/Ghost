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

import '@mimic-fi/v2-wallet/contracts/IWallet.sol';
import '@mimic-fi/v2-helpers/contracts/auth/Authorizer.sol';

import './IAction.sol';

/**
 * @title BaseAction
 * @dev Action holding a wallet reference and using the Authorizer mixin
 */
contract BaseAction is IAction, Authorizer {
    // Mimic Wallet reference
    IWallet public immutable override wallet;

    /**
     * @dev Creates a new Base Action
     * @param _admin Address of the account that will be granted with admin rights
     * @param _wallet Address of the wallet to be set
     */
    constructor(address _admin, IWallet _wallet) {
        wallet = _wallet;
        _authorize(_admin, Authorizer.authorize.selector);
        _authorize(_admin, Authorizer.unauthorize.selector);
    }
}
