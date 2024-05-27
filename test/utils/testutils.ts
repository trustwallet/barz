import { ethers } from 'hardhat'
import {
    arrayify,
    keccak256,
    parseEther
} from 'ethers/lib/utils'
import { BigNumber, Contract, Wallet } from 'ethers'


export const AddressZero = ethers.constants.AddressZero
export const AddressOne = "0x0000000000000000000000000000000000000001"
export const HashZero = ethers.constants.HashZero
export const ONE_ETH = parseEther('1')
export const TWO_ETH = parseEther('2')
export const FIVE_ETH = parseEther('5')
export const callGasLimit = 2000000
export const verificationGasLimit = 1000000
export const maxFeePerGas = 1

const panicCodes: { [key: number]: string } = {
    // from https://docs.soliditylang.org/en/v0.8.0/control-structures.html
    0x01: 'assert(false)',
    0x11: 'arithmetic overflow/underflow',
    0x12: 'divide by zero',
    0x21: 'invalid enum value',
    0x22: 'storage byte array that is incorrectly encoded',
    0x31: '.pop() on an empty array.',
    0x32: 'array sout-of-bounds or negative index',
    0x41: 'memory overflow',
    0x51: 'zero-initialized variable of internal function type'
}
export function callDataCost(data: string): number {
    return ethers.utils.arrayify(data)
        .map(x => x === 0 ? 4 : 16)
        .reduce((sum, x) => sum + x)
}
export function rethrow(): (e: Error) => void {
    const callerStack = new Error().stack!.replace(/Error.*\n.*at.*\n/, '').replace(/.*at.* \(internal[\s\S]*/, '')

    if (arguments[0] != null) {
        throw new Error('must use .catch(rethrow()), and NOT .catch(rethrow)')
    }
    return function (e: Error) {
        const solstack = e.stack!.match(/((?:.* at .*\.sol.*\n)+)/)
        const stack = (solstack != null ? solstack[1] : '') + callerStack
        // const regex = new RegExp('error=.*"data":"(.*?)"').compile()
        const found = /error=.*?"data":"(.*?)"/.exec(e.message)
        let message: string
        if (found != null) {
            const data = found[1]
            message = decodeRevertReason(data) ?? e.message + ' - ' + data.slice(0, 100)
        } else {
            message = e.message
        }
        const err = new Error(message)
        err.stack = 'Error: ' + message + '\n' + stack
        throw err
    }
}

// just throw 1eth from account[0] to the given address (or contract instance)
export async function fund(contractOrAddress: string | Contract, amountEth = '1'): Promise<void> {
    let address: string
    if (typeof contractOrAddress === 'string') {
        address = contractOrAddress
    } else {
        address = contractOrAddress.address
    }
    await ethers.provider.getSigner().sendTransaction({ to: address, value: parseEther(amountEth) })
}
export function decodeRevertReason(data: string, nullIfNoMatch = true): string | null {
    const methodSig = data.slice(0, 10)
    const dataParams = '0x' + data.slice(10)

    if (methodSig === '0x08c379a0') {
        const [err] = ethers.utils.defaultAbiCoder.decode(['string'], dataParams)
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `Error(${err})`
    } else if (methodSig === '0x00fa072b') {
        const [opindex, paymaster, msg] = ethers.utils.defaultAbiCoder.decode(['uint256', 'address', 'string'], dataParams)
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `FailedOp(${opindex}, ${paymaster !== AddressZero ? paymaster : 'none'}, ${msg})`
    } else if (methodSig === '0x4e487b71') {
        const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataParams)
        return `Panic(${panicCodes[code] ?? code} + ')`
    }
    if (!nullIfNoMatch) {
        return data
    }
    return null
}

// create non-random account, so gas calculations are deterministic
export function createAccountOwner(seed = 3): Wallet {
    const privateKey = keccak256(Buffer.from(arrayify(BigNumber.from(seed))))
    return new ethers.Wallet(privateKey, ethers.provider)
    // return new ethers.Wallet('0x'.padEnd(66, privkeyBase), ethers.provider);
}
// keccak256(
//     "EIP712Domain(uint256 chainId,address verifyingContract)"
// );
const DOMAIN_SEPARATOR_TYPEHASH = '0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218'

// keccak256("BarzMessage(bytes message)")
const BARZ_MSG_HASH = '0xb1bcb804a4a3a1af3ee7920d949bdfd417ea1b736c3552c8d6563a229a619100'
export async function domainSeparator(chainId: any, contractAddress: any) {
    return ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "uint256", "address"],
            [DOMAIN_SEPARATOR_TYPEHASH, chainId, contractAddress]
        )
    );
}

export async function encodeMessageData(message: any, chainId: any, contractAddress: any) {
    const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes32"],
            [BARZ_MSG_HASH, ethers.utils.keccak256(message)]
        )
    );
    const _domainSeparator = await domainSeparator(chainId, contractAddress);
    return ethers.utils.solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", _domainSeparator, messageHash]);
}

export async function getMessageHash(message: any, chainId: any, contractAddress: any) {
    const encodedMessage = ethers.utils.defaultAbiCoder.encode(["bytes32"], [message]);
    const encodedMessageData = await encodeMessageData(encodedMessage, chainId, contractAddress);
    return ethers.utils.keccak256(encodedMessageData);
}

export function generateExampleMsgHash() {
    const enc = ethers.utils.defaultAbiCoder.encode(['string'], ["LOGIN to TW Wallet Timestamp:1683119999"])
    return ethers.utils.keccak256(enc)
}

export function sortSignatures(mapping: any): string {
    let signatures = ""
    Object.keys(mapping)
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
        signatures += mapping[key]
    });
    return "0x" + signatures.replace("undefined", "")
}

export function removePrefix(bytes: string): string {
    return bytes.replace("0x", "")
}

export function addPrefix(bytes: string): string {
    return "0x" + bytes
}