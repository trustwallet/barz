// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {UserOperation} from "../../../aa-4337/interfaces/UserOperation.sol";
import {ExecMode, CallType, ExecType, Execution, ValidationMode, ValidationId, ValidationType, PermissionId, PolicyData, PassFlag, ValidAfter, ValidUntil} from "./Types.sol";
import {VALIDATOR_VALIDATION_TYPE, PERMISSION_VALIDATION_TYPE, VALIDATOR_MODULE_TYPE, POLICY_MODULE_TYPE, SIGNER_MODULE_TYPE, SKIP_USEROP, SKIP_SIGNATURE, VALIDATION_FAILURE} from "./Constants.sol";
import {ModuleManager} from "./ModuleManager.sol";
import {IMMSAFacet} from "../interfaces/IMMSAFacet.sol";
import {IValidator} from "../interfaces/IValidator.sol";
import {IPolicy} from "../interfaces/IPolicy.sol";
import {ISigner} from "../interfaces/ISigner.sol";
import {LibMMSAStorage, MMSAStorage, PermissionConfig} from "../../../libraries/LibMMSAStorage.sol";
import {LibSentinelList} from "../../../libraries/LibSentinelList.sol";

/**
 * @title Validation Manager
 * @author David Yongjun Kim (@PowerStream3604)
 * @dev Barz implemented permission referencing ZeroDev Permission System. Thanks to ZeroDev team.
 *      We made updates/optimizations to better fit with the need and security model of Barz.
 */

contract ValidationManager {
    using LibSentinelList for LibSentinelList.SentinelList;

    event PermissionUninstallCallFailed(address module, bytes data);

    error ValidationManager__InvalidValidationType();
    error ValidationManager__InvalidValidatorAddress();
    error ValidationManager__InvalidPolicyDataLength();
    error ValidationManager__PolicyFailed(address policy);
    error ValidationManager__PermissionNotAllowedForPermission();

    function _installValidation(
        ValidationId _validationId,
        bytes calldata _validatorData
    ) internal {
        ValidationType validationType = getValidationType(_validationId);

        if (validationType == VALIDATOR_VALIDATION_TYPE) {
            address validator = getValidator(_validationId);

            if (validator.code.length == 0) {
                revert ValidationManager__InvalidValidatorAddress();
            }
            LibMMSAStorage.mmsaStorage().validators.push(validator);

            IValidator(validator).onInstall(_validatorData);
            emit IMMSAFacet.ModuleInstalled(VALIDATOR_MODULE_TYPE, validator);
        } else if (validationType == PERMISSION_VALIDATION_TYPE) {
            PermissionId permission = getPermissionId(_validationId);
            _installPermission(permission, _validatorData);
        } else {
            revert ValidationManager__InvalidValidationType();
        }
    }

    function _installPermission(PermissionId _permission, bytes calldata _permissionData) internal {
        MMSAStorage storage mmsaStorage = LibMMSAStorage.mmsaStorage();
        bytes[] calldata permissionInstallationData;
        assembly {
            permissionInstallationData.offset := add(add(_permissionData.offset, 32), calldataload(_permissionData.offset))
            permissionInstallationData.length := calldataload(sub(permissionInstallationData.offset, 32))
        }
        if (permissionInstallationData.length > 254 || permissionInstallationData.length == 0) {
            revert ValidationManager__InvalidPolicyDataLength();
        }

        if (mmsaStorage.permissionConfig[_permission].policyData.length > 0) {
            delete mmsaStorage.permissionConfig[_permission].policyData;
        }
        uint256 signerIndex = permissionInstallationData.length - 1;

        for (uint256 i = 0; i < signerIndex; ++i) {
            mmsaStorage.permissionConfig[_permission].policyData.push(
                PolicyData.wrap(bytes22(permissionInstallationData[i][0:22]))
            );
            IPolicy(address(bytes20(permissionInstallationData[i][2:22]))).onInstall(
                abi.encodePacked(bytes32(PermissionId.unwrap(_permission)), permissionInstallationData[i][22:])
            );

            emit IMMSAFacet.ModuleInstalled(POLICY_MODULE_TYPE, address(bytes20(permissionInstallationData[i][2:22])));
        }
        
        ISigner signer = ISigner(address(bytes20(permissionInstallationData[signerIndex][2:22])));
        mmsaStorage.permissionConfig[_permission].signer = signer;
        mmsaStorage.permissionConfig[_permission].permissionFlag = PassFlag.wrap(bytes2(permissionInstallationData[signerIndex][0:22]));
        signer.onInstall(
            abi.encodePacked(
                bytes32(PermissionId.unwrap(_permission)), permissionInstallationData[signerIndex][22:]
            )
        );
        emit IMMSAFacet.ModuleInstalled(SIGNER_MODULE_TYPE, address(signer));
    }

    function _uninstallPermission(PermissionId _permission, bytes calldata _permissionData) internal {
        bytes[] calldata permissionUninstallData;
        assembly {
            permissionUninstallData.offset := add(add(_permissionData.offset, 32), calldataload(_permissionData.offset))
            permissionUninstallData.length := calldataload(sub(permissionUninstallData.offset, 32))
        }
        PermissionConfig storage permissionConfig = LibMMSAStorage.mmsaStorage().permissionConfig[_permission];

        if (permissionUninstallData.length != permissionConfig.policyData.length + 1) {
            revert ValidationManager__InvalidPolicyDataLength();
        }
        PolicyData[] storage policyData = permissionConfig.policyData;
        for (uint256 i = 0; i < policyData.length; ++i) {
            (, IPolicy policy) = decodePolicyData(policyData[i]);

            try policy.onUninstall(abi.encodePacked(bytes32(PermissionId.unwrap(_permission)), permissionUninstallData[i])) {} catch {
                emit PermissionUninstallCallFailed(address(policy), permissionUninstallData[i]);
            }

            emit IMMSAFacet.ModuleUninstalled(POLICY_MODULE_TYPE, address(policy));
        }
        delete LibMMSAStorage.mmsaStorage().permissionConfig[_permission];

        try permissionConfig.signer.onUninstall(abi.encodePacked(PermissionId.unwrap(_permission), permissionUninstallData[permissionUninstallData.length - 1])) {} catch {
            emit PermissionUninstallCallFailed(address(permissionConfig.signer), permissionUninstallData[permissionUninstallData.length - 1]);
        }
        emit IMMSAFacet.ModuleUninstalled(SIGNER_MODULE_TYPE, address(permissionConfig.signer));
    }

    function _validate(ValidationId _validation, UserOperation calldata _userOp, bytes32 _userOpHash) internal returns (uint256 validationData) {
        ValidationType validationType = getValidationType(_validation);

        if (validationType == VALIDATOR_VALIDATION_TYPE) {
            address validator = getValidator(_validation);

            if (!LibMMSAStorage.mmsaStorage().validators.contains(validator)) {
                return VALIDATION_FAILURE;
            }
            validationData = IValidator(validator).validateUserOp(_userOp, _userOpHash);
        } else {
            PermissionId permissionId = getPermissionId(_validation);

            if (PassFlag.unwrap(LibMMSAStorage.mmsaStorage().permissionConfig[permissionId].permissionFlag) & PassFlag.unwrap(SKIP_USEROP) != 0) {
                revert ValidationManager__PermissionNotAllowedForPermission();
            }

            (uint256 policyValidationData, ISigner signer) = _validateUserOpPolicy(permissionId, _userOp, _userOp.signature);
            validationData = _mergeValidationData(uint256(0), policyValidationData);
            validationData = _mergeValidationData(validationData, signer.checkUserOpSignature(bytes32(PermissionId.unwrap(permissionId)), _userOp, _userOpHash));
        }
    }

    function _validateUserOpPolicy(PermissionId _permission, UserOperation memory _userOp, bytes calldata _userOpSig) internal returns (uint256 validationData, ISigner signer) {
        PermissionConfig storage permissionStorage = LibMMSAStorage.mmsaStorage().permissionConfig[_permission];
        PolicyData[] storage policyData = permissionStorage.policyData;
        for (uint256 i = 0; i < policyData.length; i++) {
            (PassFlag passFlag, IPolicy policy) = decodePolicyData(policyData[i]);
            if (PassFlag.unwrap(passFlag) & PassFlag.unwrap(SKIP_USEROP) == 0) {
                validationData = policy.checkUserOpPolicy(bytes32(PermissionId.unwrap(_permission)), _userOp);
                address result = getValidationData(validationData);
                if (result != address(0)) {
                    revert ValidationManager__PolicyFailed(address(policy));
                }
            }
        }
        return (validationData, permissionStorage.signer);
    }

    function _mergeValidationData(uint256 a, uint256 b) internal pure returns (uint256 validationData) {
        assembly {
            // xor(a,b) == shows only matching bits
            // and(xor(a,b), 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff) == filters out the validAfter and validUntil bits
            // if the result is not zero, then aggregator part is not matching
            // validCase :
            // a == 0 || b == 0 || xor(a,b) == 0
            // invalidCase :
            // a mul b != 0 && xor(a,b) != 0
            let sum := shl(96, add(a, b))
            switch or(
                iszero(and(xor(a, b), 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff)),
                or(eq(sum, shl(96, a)), eq(sum, shl(96, b)))
            )
            case 1 {
                validationData := and(or(a, b), 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff)
                // validAfter
                let a_vd := and(0xffffffffffff0000000000000000000000000000000000000000000000000000, a)
                let b_vd := and(0xffffffffffff0000000000000000000000000000000000000000000000000000, b)
                validationData := or(validationData, xor(a_vd, mul(xor(a_vd, b_vd), gt(b_vd, a_vd))))
                // validUntil
                a_vd := and(0x000000000000ffffffffffff0000000000000000000000000000000000000000, a)
                if iszero(a_vd) { a_vd := 0x000000000000ffffffffffff0000000000000000000000000000000000000000 }
                b_vd := and(0x000000000000ffffffffffff0000000000000000000000000000000000000000, b)
                if iszero(b_vd) { b_vd := 0x000000000000ffffffffffff0000000000000000000000000000000000000000 }
                let until := xor(a_vd, mul(xor(a_vd, b_vd), lt(b_vd, a_vd)))
                if iszero(until) { until := 0x000000000000ffffffffffff0000000000000000000000000000000000000000 }
                validationData := or(validationData, until)
            }
            default { validationData := VALIDATION_FAILURE }
        }
    }

    function decodePolicyData(PolicyData _policyData) internal pure returns (PassFlag passFlag, IPolicy policy) {
        assembly {
            passFlag := _policyData
            policy := shr(80, _policyData)
        }
    }

    function getValidationType(ValidationId _validationId) internal pure returns (ValidationType validationType) {
        assembly {
            validationType := _validationId
        }
    }

    function getValidator(ValidationId _validationId) internal pure returns (address validator) {
        assembly {
            validator := shr(88, _validationId)
        }
    }

    function getPermissionId(ValidationId _validationId) internal pure returns (PermissionId permissionId) {
        assembly {
            permissionId := shl(8, _validationId)
        }
    }

    function getValidationData(uint256 _validationData) internal pure returns (address data) {
        assembly {
            data := _validationData
        }
    }
}
