// Heuristic fix: when DIRECT_URL points to a "db." hostname that may not
// be resolvable from some server environments, fallback to
// using DATABASE_URL (pooler) to avoid startup failures caused by DNS
// resolution issues. This is a conservative, opt-in override to allow
// the runtime to start when the direct host is unreachable.

'use strict';

try {
  const direct = process.env.DIRECT_URL || '';
  const dbPattern = /:\/\/db\./i; // matches scheme://db....
  // Try to extract Supabase project ref from DIRECT_URL host: db.<ref>.supabase.co
  const projectRefMatch = (direct.match(/db\.([a-z0-9]+)\.supabase\.co/i) || []);
  const projectRef = projectRefMatch[1];

  // If we can detect a project ref and DATABASE_URL exists, ensure the pooler username
  // includes the project ref (Supabase requires usernames like postgres.<projectref>). 
  if (projectRef && process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      const username = parsed.username || '';
      if (username && !username.includes(`.${projectRef}`)) {
        parsed.username = `${username}.${projectRef}`;
        process.env.DATABASE_URL = parsed.toString();
        // eslint-disable-next-line no-console
        console.log(`fix-direct-url: adjusted DATABASE_URL username to include project ref: ${projectRef}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('fix-direct-url: failed parsing DATABASE_URL', e && e.message ? e.message : e);
    }
  }

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
