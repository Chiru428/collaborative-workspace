import test from 'node:test';
import assert from 'node:assert/strict';
import { emailQuery, escapeRegExp, isValidRole, normalizeEmail } from './validate';
import { canWrite, getRole } from './access';

test('normalizeEmail lowercases/trims and rejects non-emails and non-strings', () => {
  assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail({ $ne: '' }), null); // NoSQL-injection shaped input
  assert.equal(normalizeEmail(undefined), null);
});

test('escapeRegExp neutralises regex metacharacters', () => {
  const re = new RegExp(`^${escapeRegExp('.*@x.com')}$`, 'i');
  assert.equal(re.test('.*@x.com'), true);
  assert.equal(re.test('anything@x.com'), false);
  assert.equal(escapeRegExp('a+b(c)[d]\\'), 'a\\+b\\(c\\)\\[d\\]\\\\');
});

test('emailQuery matches case-insensitively but exactly', () => {
  const { email } = emailQuery('a.b@x.com');
  assert.equal(email.$regex.test('A.B@X.COM'), true);
  assert.equal(email.$regex.test('aXb@x.com'), false); // "." is literal
});

test('isValidRole only accepts editor/viewer', () => {
  assert.equal(isValidRole('editor'), true);
  assert.equal(isValidRole('viewer'), true);
  assert.equal(isValidRole('owner'), false);
  assert.equal(isValidRole('admin'), false);
});

test('getRole / canWrite resolve document permissions', () => {
  const doc = {
    ownerId: 'u1',
    collaborators: [
      { userId: 'u2', role: 'editor' as const },
      { userId: 'u3', role: 'viewer' as const },
    ],
  };
  assert.equal(getRole(doc, 'u1'), 'owner');
  assert.equal(getRole(doc, 'u2'), 'editor');
  assert.equal(getRole(doc, 'u3'), 'viewer');
  assert.equal(getRole(doc, 'u9'), null);
  assert.equal(canWrite('owner'), true);
  assert.equal(canWrite('editor'), true);
  assert.equal(canWrite('viewer'), false);
  assert.equal(canWrite(null), false);
});
