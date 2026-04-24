'use strict';

const { main } = require('./deploy-hostinger');

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
