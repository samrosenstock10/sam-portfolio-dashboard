import { readFile } from 'node:fs/promises';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const path = process.argv[2] ?? 'index.html';
const html = await readFile(path, 'utf8');
const result = validateDashboardHtml(html);
console.log(`Dashboard contract valid: ${JSON.stringify(result)}`);
