/**
 * Envelope encryption.
 *
 * The properties worth pinning are not "it round-trips". They are the ones that
 * make crypto-shredding work: two encryptions of the same value must not be
 * identical, tampering must be detected rather than producing plausible
 * garbage, and a blob must say which master key it was written under so a
 * rotation does not orphan it.
 */
import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { CiphertextError, decrypt, decryptToString, encrypt, keyIdOf } from '@platform/crypto';
import type { MasterKeyConfig } from '@platform/config';

const master: MasterKeyConfig = { id: 'test-1', key: Buffer.alloc(32, 7) };
const other: MasterKeyConfig = { id: 'test-2', key: Buffer.alloc(32, 9) };

describe('round trip', () => {
  it('returns exactly what went in', () => {
    const blob = encrypt(master, 'consumer-secret-value');
    expect(decryptToString(master, blob)).toBe('consumer-secret-value');
  });

  it('handles arbitrary bytes, not only text', () => {
    const payload = randomBytes(512);
    expect(decrypt(master, encrypt(master, payload)).equals(payload)).toBe(true);
  });

  it('handles an empty payload', () => {
    expect(decrypt(master, encrypt(master, Buffer.alloc(0))).length).toBe(0);
  });

  it('handles a payload larger than one AES block by a long way', () => {
    const payload = randomBytes(100_000);
    expect(decrypt(master, encrypt(master, payload)).equals(payload)).toBe(true);
  });
});

describe('the properties that make erasure work', () => {
  it('never produces the same ciphertext twice for the same input', () => {
    // Each value gets its own data key and its own iv. If this failed, equal
    // plaintexts would be visible as equal ciphertexts in a database dump.
    const a = encrypt(master, 'same');
    const b = encrypt(master, 'same');
    expect(a.equals(b)).toBe(false);
  });

  it('does not contain the plaintext anywhere in the blob', () => {
    const blob = encrypt(master, 'NEEDLE-IN-THE-HAYSTACK');
    expect(blob.toString('latin1')).not.toContain('NEEDLE');
  });

  it('does not contain the master key', () => {
    const blob = encrypt(master, 'anything');
    expect(blob.includes(master.key)).toBe(false);
  });

  it('names the key it was written under without decrypting', () => {
    expect(keyIdOf(encrypt(master, 'x'))).toBe('test-1');
  });
});

describe('what it refuses', () => {
  it('refuses to decrypt under a different master key', () => {
    const blob = encrypt(master, 'x');
    expect(() => decrypt(other, blob)).toThrow(CiphertextError);
  });

  it('says which key the value was written under, which is what a rotation needs', () => {
    const blob = encrypt(master, 'x');
    expect(() => decrypt(other, blob)).toThrow(/test-1/);
  });

  it('detects a flipped bit in the payload', () => {
    const blob = encrypt(master, 'a value worth protecting');
    blob[blob.length - 1] ^= 0x01;
    expect(() => decrypt(master, blob)).toThrow(CiphertextError);
  });

  it('detects a flipped bit in the wrapped data key', () => {
    const blob = encrypt(master, 'a value worth protecting');
    // Inside the wrapped key region: past magic, length byte and the key id.
    blob[4 + 1 + master.id.length + 2] ^= 0x01;
    expect(() => decrypt(master, blob)).toThrow(CiphertextError);
  });

  it('rejects a truncated blob rather than reading past the end', () => {
    const blob = encrypt(master, 'x');
    expect(() => decrypt(master, blob.subarray(0, blob.length - 8))).toThrow(/truncated/);
  });

  it('rejects something that is not one of ours', () => {
    expect(() => keyIdOf(Buffer.from('definitely not a vantage blob'))).toThrow(
      /not in the expected format/,
    );
  });

  it('rejects an empty buffer', () => {
    expect(() => keyIdOf(Buffer.alloc(0))).toThrow(CiphertextError);
  });

  it('refuses to encrypt under a master key of the wrong size', () => {
    const short: MasterKeyConfig = { id: 'short', key: Buffer.alloc(16, 1) };
    expect(() => encrypt(short, 'x')).toThrow(/32 bytes/);
  });

  it('refuses a master key with no id, because a rotation could not find it', () => {
    const nameless: MasterKeyConfig = { id: '', key: Buffer.alloc(32, 1) };
    expect(() => encrypt(nameless, 'x')).toThrow(/id/);
  });
});
