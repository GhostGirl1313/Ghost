// SPDX-License-Identifier: MIT

// Based on the EnumerableMap library from OpenZeppelin Contracts

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

/**
 * @dev Library for managing an enumerable variant of Solidity's
 * https://solidity.readthedocs.io/en/latest/types.html#mapping-types[`mapping`]
 * type.
 *
 * Maps have the following properties:
 *
 * - Entries are added, removed, and checked for existence in constant time
 * (O(1)).
 * - Entries are enumerated in O(n). No guarantees are made on the ordering.
 *
 * ```
 * contract Example {
 *     // Add the library methods
 *     using EnumerableMap for EnumerableMap.AddressToAddressMap;
 *
 *     // Declare a set state variable
 *     EnumerableMap.AddressToAddressMap private myMap;
 * }
 * ```
 */

library EnumerableMap {
    using EnumerableSet for EnumerableSet.AddressSet;

    // To implement this library for multiple types with as little code
    // repetition as possible, we write it in terms of a generic Map type with
    // address keys and values.
    // The Map implementation uses private functions, and user-facing
    // implementations (such as AddressToAddressMap) are just wrappers around
    // the underlying Map.
    // This means that we can only create new EnumerableMaps for types that fit
    // in address.

    struct AddressToAddressMap {
        // Storage of keys
        EnumerableSet.AddressSet _keys;
        mapping (address => address) _values;
    }

    /**
     * @dev Adds a key-value pair to a map, or updates the value for an existing key. O(1).
     *
     * Returns true if the key was added to the map, that is if it was not
     * already present.
     */
    function set(AddressToAddressMap storage map, address key, address value) internal returns (bool) {
        map._values[key] = value;
        return map._keys.add(key);
    }

    /**
     * @dev Removes a key-value pair from a map. O(1).
     *
     * Returns true if the key was removed from the map, that is if it was present.
     */
    function remove(AddressToAddressMap storage map, address key) internal returns (bool) {
        delete map._values[key];
        return map._keys.remove(key);
    }

    /**
     * @dev Returns true if the key is in the map. O(1).
     */
    function contains(AddressToAddressMap storage map, address key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    /**
     * @dev Returns the number of key-value pairs in the map. O(1).
     */
    function length(AddressToAddressMap storage map) internal view returns (uint256) {
        return map._keys.length();
    }

    /**
     * @dev Returns the key-value pair stored at position `index` in the map. O(1).
     *
     * Note that there are no guarantees on the ordering of entries inside the
     * array, and it may change when more entries are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(AddressToAddressMap storage map, uint256 index) internal view returns (address, address) {
        address key = map._keys.at(index);
        return (key, map._values[key]);
    }

    /**
     * @dev Tries to returns the value associated with `key`.  O(1).
     * Does not revert if `key` is not in the map.
     */
    function tryGet(AddressToAddressMap storage map, address key) internal view returns (bool, address) {
        address value = map._values[key];
        if (value == address(0)) {
            return (contains(map, key), address(0));
        } else {
            return (true, value);
        }
    }

    /**
     * @dev Returns the value associated with `key`.  O(1).
     *
     * Requirements:
     *
     * - `key` must be in the map.
     */
    function get(AddressToAddressMap storage map, address key) internal view returns (address) {
        address value = map._values[key];
        require(value != address(0) || contains(map, key), 'EnumerableMap: nonexistent key');
        return value;
    }
}
