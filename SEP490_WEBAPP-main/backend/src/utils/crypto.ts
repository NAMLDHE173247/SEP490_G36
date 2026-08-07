import crypto from 'crypto';

// A dedicated encryption key is required. We deliberately refuse to fall back to
// a hardcoded literal: that would let anyone with repo access decrypt every
// stored API key. ENCRYPTION_KEY is preferred; JWT_SECRET is accepted only for
// backward compatibility with data that was encrypted before this split.
const RAW_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
if (!RAW_SECRET) {
  throw new Error(
    'ENCRYPTION_KEY (or JWT_SECRET) is required. Refusing to start without an encryption secret.',
  );
}

const GCM_ALGORITHM = 'aes-256-gcm';
const LEGACY_CBC_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 128-bit IV

// New data uses a properly derived 32-byte key (SHA-256 of the secret).
const GCM_KEY = crypto.createHash('sha256').update(RAW_SECRET, 'utf8').digest();

// Legacy CBC data was encrypted with the raw secret padded/truncated to 32
// bytes. Keep that derivation available purely so old ciphertext stays readable.
function getLegacyCbcKey(): Buffer {
  let key = RAW_SECRET;
  if (key.length < 32) {
    key = key.padEnd(32, '0');
  } else if (key.length > 32) {
    key = key.slice(0, 32);
  }
  return Buffer.from(key, 'utf-8');
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * Output format: `gcm:<iv-hex>:<authTag-hex>:<ciphertext-hex>`.
 * Fails closed: any error throws instead of leaking plaintext.
 */
export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, GCM_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptGcm(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed GCM ciphertext.');
  }
  const decipher = crypto.createDecipheriv(GCM_ALGORITHM, GCM_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function decryptLegacyCbc(payload: string): string {
  const parts = payload.split(':');
  const ivStr = parts.shift();
  if (!ivStr) throw new Error('Malformed CBC ciphertext.');
  const iv = Buffer.from(ivStr, 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(LEGACY_CBC_ALGORITHM, getLegacyCbcKey(), iv);
  let decrypted = decipher.update(encryptedText as any, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Decrypt a value produced by {@link encrypt}. Values with no separator are
 * treated as plaintext for backward compatibility with data stored before
 * encryption existed. Genuine decryption failures throw (fail closed).
 */
export function decrypt(text: string): string {
  if (!text) return text;

  // Values stored before encryption was introduced have no separator.
  if (!text.includes(':')) {
    return text;
  }

  if (text.startsWith('gcm:')) {
    return decryptGcm(text.slice(4));
  }

  // Legacy AES-256-CBC ciphertext: `<iv-hex>:<ciphertext-hex>`.
  return decryptLegacyCbc(text);
}

/** Re-encrypt legacy CBC values to GCM. Returns the value unchanged when already GCM or plaintext. */
export function upgradeCiphertext(text: string): string {
  if (!text || !text.includes(':') || text.startsWith('gcm:')) return text;
  return encrypt(decryptLegacyCbc(text));
}
