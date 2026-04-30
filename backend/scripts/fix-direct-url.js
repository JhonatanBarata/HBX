// Runtime guard: if DIRECT_URL points to a private db.* hostname that is not
// resolvable from the current container, keep Prisma runtime on DATABASE_URL.
// Hostinger production normally points both URLs to hbx-postgres.

'use strict';

try {
  const direct = process.env.DIRECT_URL || '';
  const dbPattern = /:\/\/db\./i; // matches scheme://db....

  // If DIRECT_URL uses a db.* host that may not resolve in the environment, fallback
  // to using DATABASE_URL for runtime to avoid startup failure.
  if (direct && dbPattern.test(direct) && process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.log('fix-direct-url: DIRECT_URL appears to use a db.* host; overriding DIRECT_URL with DATABASE_URL');
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('fix-direct-url: unexpected error', e && e.message ? e.message : e);
}

module.exports = {};
