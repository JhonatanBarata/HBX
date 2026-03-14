// Heuristic fix: when DIRECT_URL points to a "db." hostname that may not
// be resolvable from some environments (e.g. Render), fallback to
// using DATABASE_URL (pooler) to avoid startup failures caused by DNS
// resolution issues. This is a conservative, opt-in override to allow
// the runtime to start when the direct host is unreachable.

'use strict';

try {
  const direct = process.env.DIRECT_URL || '';
  const dbPattern = /:\/\/db\./i; // matches scheme://db....
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
