
import elliptic from 'elliptic';
const EC = elliptic.ec;
const ec = new EC('p256');
import * as cbor from './cbor';
import { hexToBuf, parseAuthData } from './base64-helpers';
import { AsnParser } from '@peculiar/asn1-schema';
import { ECDSASigValue } from '@peculiar/asn1-ecc';

enum COSEKEYS {
    kty = 1,
    alg = 3,
    crv = -1,
    x = -2,
    y = -3,
    n = -1,
    e = -2,
  }

export const getPublicKey = async (attestationObjectHex: string) => {
    const attestationObject = hexToBuf(attestationObjectHex)
    const authData = cbor.decode(attestationObject, undefined, undefined)
      .authData as Uint8Array;
  
    const authDataParsed = parseAuthData(authData);

    const pubk = cbor.decode(
      authDataParsed.COSEPublicKey.buffer,
      undefined,
      undefined
    );
  
    const x = pubk[COSEKEYS.x];
    const y = pubk[COSEKEYS.y];

    const pk = ec.keyFromPublic({ x, y });

    return [
      '0x' + pk.getPublic('hex').slice(2, 66),
      '0x' + pk.getPublic('hex').slice(-64),
    ];  
  };

  export const getRSValues = async (signature: string) => {
    const parsedSignature = AsnParser.parse(
      hexToBuf(signature),
      ECDSASigValue
    );
  
    let rBytes = new Uint8Array(parsedSignature.r);
    let sBytes = new Uint8Array(parsedSignature.s);
  
    if (shouldRemoveLeadingZero(rBytes)) {
      rBytes = rBytes.slice(1);
    }
  
    if (shouldRemoveLeadingZero(sBytes)) {
      sBytes = sBytes.slice(1);
    }
  
    return [
      '0x' + Buffer.from(rBytes).toString('hex'),
      '0x' + Buffer.from(sBytes).toString('hex'),
    ];
  }

  export function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
    return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
  }