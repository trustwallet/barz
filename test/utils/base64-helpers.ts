import * as base64url from './base64url-arraybuffer';

export const bufferToString = (buff: any) => {
  const enc = new TextDecoder(); // always utf-8
  return enc.decode(buff);
};

export const getEndian = () => {
  const arrayBuffer = new ArrayBuffer(2);
  const uint8Array = new Uint8Array(arrayBuffer);
  const uint16array = new Uint16Array(arrayBuffer);
  uint8Array[0] = 0xaa; // set first byte
  uint8Array[1] = 0xbb; // set second byte

  if (uint16array[0] === 0xbbaa) return 'little';
  else return 'big';
};

export const readBE16 = (buffer: any) => {
  if (buffer.length !== 2) throw new Error('Only 2byte buffer allowed!');

  if (getEndian() !== 'big') buffer = buffer.reverse();

  return new Uint16Array(buffer.buffer)[0];
};

export const readBE32 = (counterBuf: any) => {
  if (counterBuf.length !== 4) throw new Error('Only 4byte buffers allowed!');

  if (getEndian() !== 'big') counterBuf = counterBuf.reverse();

  return new Uint32Array(counterBuf.buffer)[0];
};

export const bufToHex = (buffer: any) => {
  // buffer is an ArrayBuffer
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x) => ('00' + x.toString(16)).slice(-2))
    .join('');
};

export const hexToBuf = (hex: string) => {
    const byteLength = hex.length / 2;
    const byteArray = new Uint8Array(byteLength);

    for (let i = 0; i < byteLength; i++) {
    byteArray[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    return byteArray.buffer;
};

export const convertToHex = (buffer: any) => {
    const uint8View = new Uint8Array(buffer);
  let hexString = "";
  for (let i = 0; i < uint8View.length; i++) {
    const hex = uint8View[i].toString(16);
    hexString += hex.length === 1 ? "0" + hex : hex; // ensure two-digit hex
  }
  return hexString
}

// https://gist.github.com/herrjemand/dbeb2c2b76362052e5268224660b6fbc
export const parseAuthData = (buffer: any) => {
  const rpIdHash = buffer.slice(0, 32);
  buffer = buffer.slice(32);
  const flagsBuf = buffer.slice(0, 1);
  buffer = buffer.slice(1);
  const flagsInt = flagsBuf[0];
  const flags = {
    up: !!(flagsInt & 0x01),
    uv: !!(flagsInt & 0x04),
    at: !!(flagsInt & 0x40),
    ed: !!(flagsInt & 0x80),
    flagsInt,
  };

  const counterBuf = buffer.slice(0, 4);
  buffer = buffer.slice(4);
  const counter = readBE32(counterBuf);

  let aaguid = undefined;
  let credID = undefined;
  let COSEPublicKey = undefined;

  if (flags.at) {
    aaguid = buffer.slice(0, 16);
    buffer = buffer.slice(16);
    const credIDLenBuf = buffer.slice(0, 2);
    buffer = buffer.slice(2);
    const credIDLen = readBE16(credIDLenBuf);
    credID = buffer.slice(0, credIDLen);
    buffer = buffer.slice(credIDLen);
    COSEPublicKey = buffer;
  }

  return {
    rpIdHash,
    flagsBuf,
    flags,
    counter,
    counterBuf,
    aaguid,
    credID,
    COSEPublicKey,
  };
};

export const generateRandomBuffer = (length: any) => {
  if (!length) length = 32;

  const randomBuff = new Uint8Array(length);
  window.crypto.getRandomValues(randomBuff);
  return randomBuff;
};

export const publicKeyCredentialToJSON: any = (pubKeyCred: any) => {
  if (pubKeyCred instanceof Array) {
    const arr = [];
    for (const i of pubKeyCred) arr.push(publicKeyCredentialToJSON(i));

    return arr;
  }

  if (pubKeyCred instanceof ArrayBuffer) {
    return base64url.encode(pubKeyCred);
  }

  if (pubKeyCred instanceof Object) {
    const obj: any = {};

    for (const key in pubKeyCred) {
      obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
    }

    return obj;
  }

  return pubKeyCred;
};

export const preformatMakeCredReq = (makeCredReq: any) => {
  makeCredReq.challenge = base64url.decode(makeCredReq.challenge);
  makeCredReq.user.id = base64url.decode(makeCredReq.user.id);

  return makeCredReq;
};

export const preformatGetAssertReq = (getAssert: any) => {
  getAssert.challenge = base64url.decode(getAssert.challenge);

  if (getAssert.allowCredentials) {
    for (const allowCred of getAssert.allowCredentials) {
      allowCred.id = base64url.decode(allowCred.id);
    }
  }

  return getAssert;
};
