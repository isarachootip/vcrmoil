import { randomBytes, scrypt, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export class CryptoUtils {
  /**
   * Hashes a password using scrypt with a cryptographically secure salt.
   * Format: salt:derivedKey (hex)
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verifies a password against a stored salt:derivedKey using timingSafeEqual.
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
      return false;
    }

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }

    return timingSafeEqual(keyBuffer, derivedKey);
  }

  /**
   * Generates a cryptographically secure random token string.
   */
  static generateRandomToken(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
  }

  /**
   * Computes SHA-256 hash of a token for storage and lookup.
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
