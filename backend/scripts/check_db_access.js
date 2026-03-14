const fs = require('fs');
try {
  fs.accessSync('prisma/dev_clean.db', fs.constants.R_OK | fs.constants.W_OK);
  console.log('accessible');
} catch (e) {
  console.error('not-accessible', e && e.message ? e.message : e);
  process.exit(2);
}
