import {
  arrayify,
  defaultAbiCoder,
  keccak256,
  concat,
  hexZeroPad,
  hexlify,
  sha256,
  toUtf8Bytes,
  BytesLike
} from 'ethers/lib/utils'
import { BigNumber, Wallet } from 'ethers'
import { AddressZero } from './testutils'
import { ecsign, toRpcSig, keccak256 as keccak256_buffer } from 'ethereumjs-util'
import { UserOperation } from './UserOperation'
import base64url from 'base64url'
import { AccountFacet__factory } from '../../typechain-types'
import { ethers } from 'hardhat'
import { uint256 } from './solidityTypes'
import { EntryPoint } from '../../typechain-types/core'
import { callGasLimit, verificationGasLimit, maxFeePerGas } from './testutils'
import { getChainId } from './helpers'
import elliptic from 'elliptic'
import { getAccountBarz } from './setup'

const ec = new elliptic.ec('p256')

export function packUserOp (op: UserOperation, forSignature = true): string {
  if (forSignature) {
    return defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes32', 'bytes32',
        'uint256', 'uint256', 'uint256', 'uint256', 'uint256',
        'bytes32'],
      [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData),
        op.callGasLimit, op.verificationGasLimit, op.preVerificationGas, op.maxFeePerGas, op.maxPriorityFeePerGas,
        keccak256(op.paymasterAndData)])
  } else {
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes', 'bytes',
        'uint256', 'uint256', 'uint256', 'uint256', 'uint256',
        'bytes', 'bytes'],
      [op.sender, op.nonce, op.initCode, op.callData,
        op.callGasLimit, op.verificationGasLimit, op.preVerificationGas, op.maxFeePerGas, op.maxPriorityFeePerGas,
        op.paymasterAndData, op.signature])
  }
}

export function packUserOp1 (op: UserOperation): string {
  return defaultAbiCoder.encode([
    'address', // sender
    'uint256', // nonce
    'bytes32', // initCode
    'bytes32', // callData
    'uint256', // callGasLimit
    'uint256', // verificationGasLimit
    'uint256', // preVerificationGas
    'uint256', // maxFeePerGas
    'uint256', // maxPriorityFeePerGas
    'bytes32' // paymasterAndData
  ], [
    op.sender,
    op.nonce,
    keccak256(op.initCode),
    keccak256(op.callData),
    op.callGasLimit,
    op.verificationGasLimit,
    op.preVerificationGas,
    op.maxFeePerGas,
    op.maxPriorityFeePerGas,
    keccak256(op.paymasterAndData)
  ])
}


export function getUserOpHash(op: UserOperation, entryPoint: string, chainId: number): string {
  const userOpHash = keccak256(packUserOp(op, true))
  const enc = defaultAbiCoder.encode(
    ['bytes32', 'address', 'uint256'],
    [userOpHash, entryPoint, chainId])
  return keccak256(enc)
}

export const DefaultsForUserOp: UserOperation = {
  sender: AddressZero,
  nonce: 0,
  initCode: '0x',
  callData: '0x',
  callGasLimit: 0,
  verificationGasLimit: 1000000, // default verification gas. will add create2 cost (3200+200*length) if initCode exists
  preVerificationGas: 21000, // should also cover calldata cost.
  maxFeePerGas: 0,
  maxPriorityFeePerGas: 1e9,
  paymasterAndData: '0x',
  signature: '0x'
}

export function signUserOpK1Curve(op: UserOperation, signer: Wallet, entryPoint: string, chainId: number): UserOperation {
  const message = getUserOpHash(op, entryPoint, chainId)
  const msg1 = Buffer.concat([
    Buffer.from('\x19Ethereum Signed Message:\n32', 'ascii'),
    Buffer.from(arrayify(message))
  ])

  const sig = ecsign(keccak256_buffer(msg1), Buffer.from(arrayify(signer.privateKey)))
  // that's equivalent of:  await signer.signMessage(message);
  // (but without "async"
  const signedMessage1 = toRpcSig(sig.v, sig.r, sig.s)
  return {
    ...op,
    signature: signedMessage1
  }
}

export function signUserOpR1Curve(op: UserOperation, keyPair: any, entryPoint: string, chainId: number): UserOperation {
  const opHash = getUserOpHash(op, entryPoint, chainId)
  const opHashBase64 = base64url.encode(concat([opHash]))

  const clientDataJSONPre = '{"type":"webauthn.get","challenge":"';
  const clientDataJSONPost = '","origin":"https://webauthn.me","crossOrigin":false}';
  const authenticatorData = concat([
    hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
    hexlify("0x0500000000")
  ])
  const clientDataJSON = clientDataJSONPre + opHashBase64 + clientDataJSONPost
  const clientHash = sha256(toUtf8Bytes(clientDataJSON)).toString()
  const authenticatorDataHEX = hexlify(authenticatorData)
  const sigHash = sha256(concat([authenticatorDataHEX, clientHash])).slice(2)
  const signature = keyPair.sign(sigHash);

  signature.s = adjustS(signature.s, ec.n)

  const signedMessage = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'bytes', 'string', 'string'],
    [
      BigNumber.from("0x" + signature.r.toString('hex')),
      BigNumber.from("0x" + signature.s.toString('hex')),
      authenticatorData,
      clientDataJSONPre,
      clientDataJSONPost
    ]
  );
  return {
    ...op,
    signature: signedMessage
  }
}

export function signMsgOnR1Curve(hash: string, keyPair: any): string {
  const opHashBase64 = base64url.encode(concat([hash]))

  const clientDataJSONPre = '{"type":"webauthn.get","challenge":"';
  const clientDataJSONPost = '","origin":"https://webauthn.me","crossOrigin":false}';
  const authenticatorData = concat([
    hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
    hexlify("0x0500000000")
  ])
  const clientDataJSON = clientDataJSONPre + opHashBase64 + clientDataJSONPost
  const clientHash = sha256(toUtf8Bytes(clientDataJSON)).toString()
  const authenticatorDataHEX = hexlify(authenticatorData)
  const sigHash = sha256(concat([authenticatorDataHEX, clientHash])).slice(2)
  const signature = keyPair.sign(sigHash);

  signature.s = adjustS(signature.s, ec.n)

  const signedMessage = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'bytes', 'string', 'string'],
    [
      BigNumber.from("0x" + signature.r.toString('hex')),
      BigNumber.from("0x" + signature.s.toString('hex')),
      authenticatorData,
      clientDataJSONPre,
      clientDataJSONPost
    ]
  );
  return signedMessage
}

export function adjustS(s: any, n: any) {
    // Ensure that 's' and 'n' are BN instances
    const halfN = n.divn(2);
    // Compare 's' with half of 'n'
    if (s.cmp(halfN) > 0) {
        // Subtract 's' from 'n' only if 's' is greater than 'n/2'
        return n.sub(s);
    }
    return s;}

export function fillUserOpDefaults(op: Partial<UserOperation>, defaults = DefaultsForUserOp): UserOperation {
  const partial: any = { ...op }
  // we want "item:undefined" to be used from defaults, and not override defaults, so we must explicitly
  // remove those so "merge" will succeed.
  for (const key in partial) {
    if (partial[key] == null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete partial[key]
    }
  }
  const filled = { ...defaults, ...partial }
  return filled
}

export function executeCallData(dest: BytesLike, value: uint256, callData: BytesLike): BytesLike {
  const accountInterface = new ethers.utils.Interface(AccountFacet__factory.abi)
  return accountInterface.encodeFunctionData("execute", [dest, value, callData])
}

export function executeBatchCallData(dest: BytesLike[], values: uint256[], callData: BytesLike[]): BytesLike {
  const accountInterface = new ethers.utils.Interface(AccountFacet__factory.abi)
  return accountInterface.encodeFunctionData("executeBatch", [dest, values, callData])
}

export async function callFromEntryPointOnK1(entryPoint: EntryPoint, sender: string, signer: Wallet, callData: BytesLike) {
  const accountBarz = await getAccountBarz(sender)
  const userOp = signUserOpK1Curve(fillUserOpDefaults({
    sender: sender,
    nonce: await accountBarz.getNonce(),
    callData,
    callGasLimit,
    verificationGasLimit,
    maxFeePerGas,
  }), signer, entryPoint.address, await getChainId())

  return entryPoint.handleOps([userOp], sender)
}

export async function callFromEntryPointOnR1(entryPoint: EntryPoint, sender: string, signer: any, callData: BytesLike) {
  const accountBarz = await getAccountBarz(sender)
  const userOp = signUserOpR1Curve(fillUserOpDefaults({
    sender: sender,
    nonce: await accountBarz.getNonce(),
    callData,
    callGasLimit,
    verificationGasLimit,
    maxFeePerGas,
  }), signer, entryPoint.address, await getChainId())

  return entryPoint.handleOps([userOp], sender)
}