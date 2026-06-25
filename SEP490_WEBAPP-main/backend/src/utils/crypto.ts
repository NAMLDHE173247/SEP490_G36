import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production'; // Must be 32 bytes for aes-256
const IV_LENGTH = 16; // For AES, this is always 16

function getValidKey(): Buffer {
  let key = ENCRYPTION_KEY;
  if (key.length < 32) {
    key = key.padEnd(32, '0');
  } else if (key.length > 32) {
    key = key.slice(0, 32);
  }
  return Buffer.from(key, 'utf-8');
}

export function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getValidKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Fallback to plain text if error (or throw?)
  }
}

export function decrypt(text: string): string {
  if (!text) return text;
  if (!text.includes(':')) {
    // If it doesn't have an IV, it might be plain text (backward compatibility)
    return text;
  }
  try {
    const textParts = text.split(':');
    const ivStr = textParts.shift();
    if (!ivStr) return text;
    const iv = Buffer.from(ivStr, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    // Using any to fix ts error if needed, but buffer should be fine
    const decipher = crypto.createDecipheriv(ALGORITHM, getValidKey(), iv);
    
    // Fixed: 'utf8' vs 'utf-8' and proper update
    // Note: Node crypto Decipher uses decipher.update(data, inputEncoding, outputEncoding)
    let decrypted = decipher.update(encryptedText as any, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return text;
  }
}
