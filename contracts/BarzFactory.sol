// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {Barz} from "./Barz.sol";
import {IBarzFactory} from "./interfaces/IBarzFactory.sol";

/**
 * @title Barz Factory
 * @dev Contract to easily deploy Barz to a pre-computed address with a single call
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract BarzFactory is IBarzFactory {
    address public immutable accountFacet;
    address public immutable entryPoint;
    address public immutable facetRegistry;
    address public immutable defaultFallback;

    /**
     * @notice Sets the initialization data for Barz contract initialization
     * @param _accountFacet Account Facet to be used to create Barz
     * @param _entryPoint Entrypoint contract to be used to create Barz. This uses canonical EntryPoint deployed by EF
     * @param _facetRegistry Facet Registry to be used to create Barz
     * @param _defaultFallback Default Fallback Handler to be used to create Barz
     */
    constructor(
        address _accountFacet,
        address _entryPoint,
        address _facetRegistry,
        address _defaultFallback
    ) {
        accountFacet = _accountFacet;
        entryPoint = _entryPoint;
        facetRegistry = _facetRegistry;
        defaultFallback = _defaultFallback;
    }

    /**
     * @notice Creates the Barz with a single call. It creates the Barz contract with the givent verification facet
     * @param _verificationFacet Address of verification facet used for creating the barz account
     * @param _owner Public Key of the owner to initialize barz account
     * @param _salt Salt used for deploying barz with create2
     * @return barz Instance of Barz contract deployed with the given parameters
     */
    function createAccount(
        address _verificationFacet,
        bytes calldata _owner,
        uint256 _salt
    ) external override returns (Barz barz) {
        address addr = getAddress(_verificationFacet, _owner, _salt);
        uint codeSize = addr.code.length;
        if (codeSize > 0) {
            return Barz(payable(addr));
        }
        barz = new Barz{salt: bytes32(_salt)}(
            accountFacet,
            _verificationFacet,
            entryPoint,
            facetRegistry,
            defaultFallback,
            _owner
        );
        emit BarzDeployed(address(barz));
    }

    /**
     * @notice Calculates the address of Barz with the given parameters
     * @param _verificationFacet Address of verification facet used for creating the barz account
     * @param _owner Public Key of the owner to initialize barz account
     * @param _salt Salt used for deploying barz with create2
     * @return barzAddress Precalculated Barz address
     */
    function getAddress(
        address _verificationFacet,
        bytes calldata _owner,
        uint256 _salt
    ) public view override returns (address barzAddress) {
        bytes memory bytecode = getBytecode(
            accountFacet,
            _verificationFacet,
            entryPoint,
            facetRegistry,
            defaultFallback,
            _owner
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                _salt,
                keccak256(bytecode)
            )
        );
        barzAddress = address(uint160(uint256(hash)));
    }

    /**
     * @notice Returns the bytecode of Barz with the given parameter
     * @param _accountFacet Account Facet to be used to create Barz
     * @param _verificationFacet Verification Facet to be used to create Barz
     * @param _entryPoint Entrypoint contract to be used to create Barz. This uses canonical EntryPoint deployed by EF
     * @param _facetRegistry Facet Registry to be used to create Barz
     * @param _defaultFallback Default Fallback Handler to be used to create Barz
     * @param _ownerPublicKey Public Key of owner to be used to initialize Barz ownership
     * @return barzBytecode Bytecode of Barz
     */
    function getBytecode(
        address _accountFacet,
        address _verificationFacet,
        address _entryPoint,
        address _facetRegistry,
        address _defaultFallback,
        bytes calldata _ownerPublicKey
    ) public pure override returns (bytes memory barzBytecode) {
        bytes memory bytecode = type(Barz).creationCode;
        barzBytecode = abi.encodePacked(
            bytecode,
            abi.encode(
                _accountFacet,
                _verificationFacet,
                _entryPoint,
                _facetRegistry,
                _defaultFallback,
                _ownerPublicKey
            )
        );
    }

    /**
     * @notice Returns the creation code of the Barz contract
     * @return creationCode Creation code of Barz
     */
    function getCreationCode()
        public
        pure
        override
        returns (bytes memory creationCode)
    {
        creationCode = type(Barz).creationCode;
    }
}
