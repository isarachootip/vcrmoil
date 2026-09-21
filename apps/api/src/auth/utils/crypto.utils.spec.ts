import { CryptoUtils } from './crypto.utils';

describe('CryptoUtils', () => {
  it('hashes password and verifies successfully with correct password', async () => {
    const password = 'mySecretPassword123!';
    const hash = await CryptoUtils.hashPassword(password);

    expect(hash).toContain(':');
    expect(await CryptoUtils.verifyPassword(password, hash)).toBe(true);
  });

  it('fails verification when incorrect password is provided', async () => {
    const password = 'mySecretPassword123!';
    const wrongPassword = 'wrongPassword456!';
    const hash = await CryptoUtils.hashPassword(password);

    expect(await CryptoUtils.verifyPassword(wrongPassword, hash)).toBe(false);
  });

  it('generates random hex token with expected length', () => {
    const token = CryptoUtils.generateRandomToken(32);
    expect(token).toHaveLength(64); // 32 bytes = 64 hex characters
  });

  it('hashes token deterministically using SHA-256', () => {
    const token = 'sample-refresh-token';
    const hash1 = CryptoUtils.hashToken(token);
    const hash2 = CryptoUtils.hashToken(token);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });
});
