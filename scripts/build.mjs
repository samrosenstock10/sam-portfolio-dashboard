import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const html = await readFile('index.html', 'utf8');
const result = validateDashboardHtml(html);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');

console.log(`Built validated dashboard: ${JSON.stringify(result)}`);
