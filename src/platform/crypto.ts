/**
 * Envelope encryption for the things that must not be readable in a database
 * dump: M-Pesa channel credentials, and TOTP secrets.
 *
 * Every value gets its own random data key. The data key encrypts the payload,
 * the master key encrypts the data key, and both ciphertexts live together in
 * one blob. The reason is not theoretical. docs/06 gives recipients a right to
 * erasure, and docs/03 makes the payment rows append-only, so the two are only
 * reconcilable if erasure means destroying a key rather than deleting a row.
 * That requires per-value keys; a single key encrypting everything cannot be
 * destroyed for one person.
 *
 * AES-256-GCM throughout, so tampering is detected on decrypt rather than
 * producing plausible garbage. The key id travels in the header so a value
 * written before a master key rotation can still be found and re-wrapped.
 *
 * Layout, all big-endian:
 *
 *   magic    4 bytes   "VNT1"
 *   keyIdLen 1 byte
 *   keyId    keyIdLen bytes, utf8
 *   dkIv     12 bytes  iv for the wrapped data key
 *   dkTag    16 bytes  tag for the wrapped data key
 *   dkCt     32 bytes  the data key, encrypted under the master key
 *   ptIv     12 bytes  iv for the payload
 *   ptTag    16 bytes  tag for the payload
 *   ptCt     rest      the payload
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MasterKeyConfig } from './config.js';

const MAGIC = Buffer.from('VNT1', 'ascii');
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Thrown when a blob is not ours, is truncated, or has been tampered with. */
export class CiphertextError extends Error {
  override readonly name = 'CiphertextError';
}

function seal(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    // GCM's own failure message says nothing useful and varies by Node version.
    throw new CiphertextError(
      'The value could not be decrypted. Either it was altered, or it was written under a different master key.',
    );
  }
}

/** Encrypt a value under a fresh data key wrapped by the master key. */
export function encrypt(master: MasterKeyConfig, plaintext: Buffer | string): Buffer {
  if (master.key.length !== KEY_BYTES) {
    throw new CiphertextError(`The master key must be ${KEY_BYTES} bytes.`);
  }

  const keyId = Buffer.from(master.id, 'utf8');
  if (keyId.length === 0 || keyId.length > 255) {
    throw new CiphertextError('The master key id must be between 1 and 255 bytes.');
  }

  const dataKey = randomBytes(KEY_BYTES);
  const wrapped = seal(master.key, dataKey);
  const payload = seal(dataKey, Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8'));

  // The data key exists in this process for as long as it takes to use it. Zero
  // it rather than leaving it for the garbage collector to hand to whoever gets
  // the memory next.
  dataKey.fill(0);

  return Buffer.concat([
    MAGIC,
    Buffer.from([keyId.length]),
    keyId,
    wrapped.iv,
    wrapped.tag,
    wrapped.ct,
    payload.iv,
    payload.tag,
    payload.ct,
  ]);
}

/** The key id a blob was written under, without decrypting it. */
export function keyIdOf(blob: Buffer): string {
  if (blob.length < MAGIC.length + 1) throw new CiphertextError('The value is truncated.');
  if (!timingSafeEqual(blob.subarray(0, MAGIC.length), MAGIC)) {
    throw new CiphertextError('The value is not in the expected format.');
  }
  const keyIdLen = blob[MAGIC.length]!;
  const start = MAGIC.length + 1;
  if (blob.length < start + keyIdLen) throw new CiphertextError('The value is truncated.');
  return blob.subarray(start, start + keyIdLen).toString('utf8');
}

export function decrypt(master: MasterKeyConfig, blob: Buffer): Buffer {
  const keyId = keyIdOf(blob);
  if (keyId !== master.id) {
    throw new CiphertextError(
      `The value was written under master key "${keyId}" but this process holds "${master.id}".`,
    );
  }

  let at = MAGIC.length + 1 + Buffer.byteLength(keyId, 'utf8');
  const take = (n: number): Buffer => {
    if (blob.length < at + n) throw new CiphertextError('The value is truncated.');
    const slice = blob.subarray(at, at + n);
    at += n;
    return slice;
  };

  const dkIv = take(IV_BYTES);
  const dkTag = take(TAG_BYTES);
  const dkCt = take(KEY_BYTES);
  const ptIv = take(IV_BYTES);
  const ptTag = take(TAG_BYTES);
  const ptCt = blob.subarray(at);

  const dataKey = open(master.key, dkIv, dkTag, dkCt);
  try {
    return open(dataKey, ptIv, ptTag, ptCt);
  } finally {
    dataKey.fill(0);
  }
}

export function decryptToString(master: MasterKeyConfig, blob: Buffer): string {
  return decrypt(master, blob).toString('utf8');
}
