// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {ExecMode, ValidationId} from "../utils/Types.sol";

interface IMMSAFacet {
    error MMSAFacet__NotFromEntryPoint();
    error MMSAFacet__NotfromEntryPointOrSelf();
    error MMSAFacet__ModuleAlreadyInstalled();
    error MMSAFacet__InvalidModuleType();
    error MMSAFacet__InvalidModule(uint256 moduleType, address module);
    error MMSAFacet__ModuleNotInstalled(uint256 moduleType, address module);
    error MMSAFacet__InvalidFallbackHandler(bytes4);
    error MMSAFacet__InvalidCallType();
    error MMSAFacet__InvalidExecutor();
    error MMSAFacet__InvalidValidator(address validator);
    error MMSAFacet__UnsupportedCallType();

    event ModuleInstalled(uint256 moduleTypeId, address module);
    event ModuleUninstalled(uint256 moduleTypeId, address module);

    function initMMSA(
        address registry,
        address[] memory attesters,
        uint8 threshold
    ) external;

    function installModule(
        uint256 moduleTypeId,
        address module,
        bytes calldata initData
    ) external payable;

    function uninstallModule(
        uint256 moduleTypeId,
        address module,
        bytes calldata _uninitData
    ) external;

    function installValidations(
        ValidationId[] calldata validationIds,
        bytes[] calldata validationData
    ) external;

    function execute(
        ExecMode mode,
        bytes calldata executionCalldata
    ) external payable;

    function executeFromExecutor(
        ExecMode mode,
        bytes calldata executionCalldata
    ) external payable returns (bytes[] memory returnData);

    function accountId() external pure returns (string memory);

    function supportsExecutionMode(ExecMode mode) external pure returns (bool);

    function supportsModule(uint256 moduleTypeId) external pure returns (bool);

    function getModulesPaginated(
        uint256 moduleTypeId,
        address start,
        uint256 pageSize
    ) external view returns (address[] memory, address);

    function isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata additionalContext
    ) external view returns (bool);

    function mmsaFallback(
        bytes calldata fallbackData
    ) external payable returns (bytes memory);

    function mmsaStaticFallback(
        bytes calldata fallbackData
    ) external view returns (bytes memory);

    function mmsaIsValidSignature(
        bytes32 msgHash,
        bytes calldata signature
    ) external view returns (bytes4);
}
