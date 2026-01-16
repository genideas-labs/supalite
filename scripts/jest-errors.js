#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, unlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const outputFile = join(tmpdir(), `jest-results-${process.pid}.json`);
const extraArgs = process.argv.slice(2);
const args = [
  'jest',
  '--passWithNoTests',
  '--json',
  `--outputFile=${outputFile}`,
  ...extraArgs,
];

const result = spawnSync(bin, args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

const failureMessages = [];
if (existsSync(outputFile)) {
  try {
    const data = JSON.parse(readFileSync(outputFile, 'utf8'));
    for (const test of data.testResults || []) {
      if (test.failureMessage) failureMessages.push(test.failureMessage);
      if (Array.isArray(test.failureMessages)) {
        failureMessages.push(...test.failureMessages);
      }
    }
  } catch (err) {
    const fallback = (result.stderr || '').trim();
    failureMessages.push(fallback || String(err));
  }

  try {
    unlinkSync(outputFile);
  } catch {
    // Ignore cleanup errors.
  }
}

const seen = new Set();
const unique = failureMessages.filter((message) => {
  const trimmed = (message || '').trim();
  if (!trimmed || seen.has(trimmed)) {
    return false;
  }
  seen.add(trimmed);
  return true;
});

if (unique.length > 0) {
  process.stdout.write(`${unique.join('\n\n')}\n`);
} else if (result.status && result.status !== 0) {
  const stderr = (result.stderr || '').trim();
  if (stderr) {
    process.stdout.write(`${stderr}\n`);
  }
}

process.exit(result.status || 0);
