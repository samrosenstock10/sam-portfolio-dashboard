import { companyConcentration } from '../lib/company-concentration.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { buildBusinessExposure } from '../lib/business-exposure.mjs';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

const [inputPath, htmlPath = 'index.html'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node scripts/update-business-exposure.mjs <verified-percentage-export.json> [index.html]');
const html = await readFile(htmlPath, 'utf8');
const pattern = /(<script id="dashboard-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const match = html.match(pattern);
if (!match) throw new Error('Missing dashboard-data');
const data = JSON.parse(match[2]);
data.businessExposure = buildBusinessExposure(JSON.parse(await readFile(inputPath, 'utf8')));
Object.assign(data.stats, companyConcentration(data.businessExposure));
const candidate = html.replace(pattern, (_, open, old, end) => open + JSON.stringify(data).replaceAll('<', '\\u003c') + end);
validateDashboardHtml(candidate);
await writeFile(htmlPath, candidate);
console.log(`Updated ${data.businessExposure.categories.length} verified business categories for ${data.businessExposure.portfolioAsOf}`);
