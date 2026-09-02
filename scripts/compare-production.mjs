import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const [expectedPath = 'index.html', actualPath] = process.argv.slice(2);
if (!actualPath) throw new Error('usage: node scripts/compare-production.mjs <expected> <actual>');

const [expected, actual] = await Promise.all([
  readFile(expectedPath, 'utf8'),
  readFile(actualPath, 'utf8'),
]);

validateDashboardHtml(expected);
validateDashboardHtml(actual);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const expectedHash = hash(expected);
const actualHash = hash(actual);
const matches = expected === actual;

if (process.env.GITHUB_OUTPUT) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `matches=${matches}\nexpected_hash=${expectedHash}\nactual_hash=${actualHash}\n`,
  );
}

console.log(JSON.stringify({ matches, expectedHash, actualHash }));
if (!matches) process.exitCode = 2;
