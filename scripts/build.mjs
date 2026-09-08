import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const html = await readFile('index.html', 'utf8');
const result = validateDashboardHtml(html);

const mobileNavTarget = '@media(max-width:600px){.section-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;flex-wrap:nowrap;width:100%}.section-nav a{display:flex;align-items:center;justify-content:center;padding:7px 2px;font-size:10px;min-height:36px;white-space:nowrap;width:100%;min-width:0}}';

if (!html.includes(mobileNavTarget)) {
  throw new Error('Expected one-line mobile section-nav CSS was not found.');
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html, 'utf8');

console.log(`Built validated dashboard: ${JSON.stringify(result)}`);
