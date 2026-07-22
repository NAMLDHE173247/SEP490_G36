import crypto from 'crypto';

export function oauthUserPrefix(userId: string): string {
  const secret = String(process.env.CLIPROXY_OWNERSHIP_SECRET || process.env.JWT_SECRET || '');
  if (!secret) throw new Error('CLIPROXY_OWNERSHIP_SECRET or JWT_SECRET is required.');
  return `u-${crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 20)}`;
}
