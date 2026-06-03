'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('./runtime');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isFalsey(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

function resolveWebwhatsRepoPath() {
  return path.resolve(repoRoot, 'Webwhats');
}

function isWebwhatsRepoAvailable(repoPath) {
  return Boolean(
    repoPath
    && fs.existsSync(path.join(repoPath, 'package.json'))
    && fs.existsSync(path.join(repoPath, 'src', 'main.ts')),
  );
}

module.exports = {
  isFalsey,
  isTruthy,
  isWebwhatsRepoAvailable,
  resolveWebwhatsRepoPath,
};
