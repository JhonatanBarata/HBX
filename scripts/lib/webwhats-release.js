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

function resolveWebwhatsRepoPath(env = process.env) {
  const configuredPath = String(env.WEBWHATS_REPO_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(repoRoot, configuredPath);
  }

  const localRepoPath = path.resolve(repoRoot, 'Webwhats');
  if (isWebwhatsRepoAvailable(localRepoPath)) {
    return localRepoPath;
  }

  return path.resolve(repoRoot, '..', 'Webwhats');
}

function isWebwhatsRepoAvailable(repoPath) {
  return Boolean(
    repoPath
    && fs.existsSync(path.join(repoPath, '.git'))
    && fs.existsSync(path.join(repoPath, 'package.json')),
  );
}

function shouldUseWebwhats(env, flagName, repoPath) {
  if (isFalsey(env[flagName])) {
    return false;
  }

  if (isTruthy(env[flagName])) {
    return true;
  }

  return isWebwhatsRepoAvailable(repoPath);
}

module.exports = {
  isFalsey,
  isTruthy,
  isWebwhatsRepoAvailable,
  resolveWebwhatsRepoPath,
  shouldUseWebwhats,
};
