const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isString = (v: unknown): v is string => typeof v === 'string';

export const normalizeEmail = (v: unknown): string | null => {
  if (!isString(v)) return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
};

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive exact email match that is safe against regex injection (legacy mixed-case rows). */
export const emailQuery = (email: string) => ({
  email: { $regex: new RegExp(`^${escapeRegExp(email)}$`, 'i') },
});

export const isValidRole = (v: unknown): v is 'editor' | 'viewer' => v === 'editor' || v === 'viewer';
