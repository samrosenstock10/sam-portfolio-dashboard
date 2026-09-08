import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const html = await readFile('index.html', 'utf8');
const result = validateDashboardHtml(html);

const mobileNavSource = '@media(max-width:430px){.section-nav{gap:4px}.section-nav a{padding:10px 11px;font-size:12px}}';
const mobileNavTarget = '@media(max-width:430px){.section-nav{gap:3px;flex-wrap:nowrap}.section-nav a{padding:9px 8px;font-size:12px;min-height:42px;white-space:nowrap}}';

if (!html.includes(mobileNavSource)) {
  throw new Error('Expected mobile section-nav CSS was not found; refusing to build without applying the phone navigation fix.');
}

const builtHtml = html.replace(mobileNavSource, mobileNavTarget);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', builtHtml, 'utf8');

console.log(`Built validated dashboard: ${JSON.stringify(result)}`);
