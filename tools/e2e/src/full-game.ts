/**
 * Plays The Cost of Disease from the title screen to an ending in headless Chrome, against
 * the production build: setup flow, story with its dialogs (setup pop-ups, end of round,
 * bidding countdown), a tied final score through both tie-breakers, the ending and the
 * endings gallery. Fails on any page error or if the game cannot be finished.
 *
 * Usage: node tools/e2e/src/full-game.ts [--build build/web/browser] [--base /sub/path/] [--chrome /usr/bin/google-chrome] [--shots dir]
 */
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright-core';
import { serve } from './serve.ts';

const { values } = parseArgs({
  options: {
    build: { type: 'string', default: 'build/web/browser' },
    // The path the build was made for (its base href).
    base: { type: 'string', default: '/' },
    chrome: { type: 'string', default: process.env['CHROME_PATH'] ?? '/usr/bin/google-chrome' },
    shots: { type: 'string' },
    seed: { type: 'string', default: '3' },
  },
});

let seed = Number(values.seed);
const random = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
const failures: string[] = [];
const check = (ok: boolean, what: string) => (ok ? console.log(`  ✔ ${what}`) : (failures.push(what), console.log(`  ✖ ${what}`)));

async function shot(page: Page, name: string): Promise<void> {
  if (!values.shots) return;
  mkdirSync(values.shots, { recursive: true });
  await page.waitForTimeout(400); // let dialogs finish fading in
  await page.screenshot({ path: `${values.shots}/${name}.png` });
}

const { url, server } = await serve(values.build, values.base);
const browser = await chromium.launch({ executablePath: values.chrome, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const button = (name: RegExp | string) => page.getByRole('button', { name });

try {
  console.log('setup');
  await page.goto(url);
  await button(/new game/i).click();
  await page.waitForURL('**/setup');
  await button(/continue/i).click(); // voice
  await button('3 Players').click();
  await button(/continue/i).click(); // players
  await button(/continue/i).click(); // introduction
  for (const name of ['Ada', 'Bram', 'Cosima']) {
    await page.locator('input[type=text]').fill(name);
    await button(/continue/i).click(); // name
    await button(/continue/i).click(); // welcome letter
  }
  await page.locator('input[type=text]').fill('Ravensbrück');
  await button(/continue/i).click(); // village
  await button(/continue/i).click(); // village introduction
  await shot(page, '1-scenario');
  await button(/The Cost of Disease/).click();
  await page.waitForURL('**/play');
  await page.locator('article.passage').waitFor();
  check(true, 'setup flow leads into the story');

  console.log('story');
  const seen = { dialogs: 0, bidding: 0, prompts: 0, links: 0 };
  for (let step = 0; step < 2000; step++) {
    await page.waitForTimeout(15);
    const dialog = page.locator('dialog[open]').last();
    if (await dialog.count()) {
      // Dialogs queue up, so the one just counted may already be closing.
      const text = await dialog.innerText({ timeout: 2000 }).catch(() => undefined);
      if (text === undefined) continue;
      seen.dialogs++;
      if (/Secret (Bid|Vote)/.test(text)) {
        seen.bidding++;
        await dialog.getByRole('button', { name: /start/i }).click();
        await dialog.getByRole('button', { name: /accept/i }).click({ timeout: 6000 });
      } else {
        if (seen.dialogs === 1) await shot(page, '2-dialog');
        // The main button (Accept, Confirm, Continue …); undo sits below it as a plain link.
        await dialog.locator('button.btn').last().click({ timeout: 5000 }).catch(() => undefined);
      }
      continue;
    }
    if (await page.locator('form.prompt input').count()) {
      seen.prompts++;
      await page.locator('form.prompt input').fill(String(random(8)));
      await page.locator('form.prompt button[type=submit]').click();
      continue;
    }
    if (await button(/score entry/i).count()) {
      await button(/score entry/i).click();
      await page.waitForURL('**/score');
      break;
    }
    // Story links; a page's single way forward is shown as a button.
    const links = page.locator('button.story-link, button.continue-inline, button.setup-continue, button.panel.action');
    const n = await links.count();
    if (!n) break;
    seen.links++;
    await links.nth(random(n)).click({ timeout: 3000 }).catch(() => undefined);
  }
  console.log(`  ${seen.links} links, ${seen.dialogs} dialogs (${seen.bidding} bids), ${seen.prompts} prompts`);
  check(page.url().includes('/score'), 'the story reaches final scoring');

  console.log('scoring');
  const scores = page.locator('input[type=number]');
  await scores.nth(2).waitFor();
  await scores.nth(0).fill('42');
  await scores.nth(1).fill('42');
  await scores.nth(2).fill('30');
  await button(/continue/i).click();
  // Tie-breaker 1: both leaders completed their Masterwork.
  await page.locator('input[type=checkbox]').nth(1).waitFor();
  await page.locator('input[type=checkbox]').nth(0).check();
  await page.locator('input[type=checkbox]').nth(1).check();
  await button(/continue/i).click();
  // Tie-breaker 2: the same number of Estate Upgrades.
  await page.getByLabel('Estate Upgrades of Bram').waitFor();
  await page.getByLabel('Estate Upgrades of Ada').fill('3');
  await page.getByLabel('Estate Upgrades of Bram').fill('3');
  await button(/continue/i).click();
  await page.locator('.ranking').waitFor();
  await shot(page, '3-ranking');
  check((await page.locator('.family').count()) === 1, 'a tie that survives both tie-breakers is a family victory');
  await button(/continue/i).click();
  await page.waitForURL('**/play');
  await page.locator('footer.ending').waitFor({ timeout: 5000 });
  check((await page.locator('.unlocked').count()) === 1, 'the ending is reached and unlocked');
  await shot(page, '4-ending');

  console.log('endings gallery');
  await page.goto(url + 'endings');
  await page.locator('.slots li').first().waitFor();
  check((await page.locator('.slots li:not(.locked)').count()) === 1, 'the gallery shows the unlocked ending');
  check((await page.locator('.slots li.locked strong').allInnerTexts()).every((t) => t === '???'), 'locked endings stay hidden');
} catch (e) {
  const lines = String(e).split('\n');
  const message = [lines[0], lines.find((l) => l.includes('waiting for'))?.trim()].filter(Boolean).join(' – ');
  console.log(`  ✖ ${message} (at ${page.url()})`);
  failures.push(message);
  await shot(page, 'failure');
} finally {
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
