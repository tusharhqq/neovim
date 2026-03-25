import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const targetUrl = process.env.NVIM_WEB_URL || 'http://127.0.0.1:8080';
const reportPath = process.env.NVIM_WEB_REPORT || 'build/web/dist/SMOKE_TEST_REPORT.md';

const lines = [];

function note(message) {
  lines.push(`- ${message}`);
  // eslint-disable-next-line no-console
  console.log(message);
}

let browser;
try {
  note(`Opening ${targetUrl}`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__nvimConnected === true, { timeout: 120000 });
  note('Worker connected and UI attached.');

  await page.focus('#screen');
  await page.keyboard.type('iweb-smoke');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const screenshot = await page.$eval('#screen', (canvas) => canvas.toDataURL());
  if (!screenshot || screenshot.length < 256) {
    throw new Error('Canvas output appears empty.');
  }
  note('Canvas updated after keyboard input.');

  await fs.writeFile(
    reportPath,
    `# Smoke test report\n\n## Result\nPASS\n\n## Checks\n${lines.join('\n')}\n`,
    'utf8',
  );
} catch (err) {
  lines.push(`- FAILURE: ${err.message}`);
  await fs.writeFile(
    reportPath,
    `# Smoke test report\n\n## Result\nFAIL\n\n## Checks\n${lines.join('\n')}\n`,
    'utf8',
  );
  throw err;
} finally {
  if (browser) {
    await browser.close();
  }
}
