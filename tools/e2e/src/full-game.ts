/**
 * Plays each scenario from the title screen to an ending in headless Chrome, against the
 * production build, one game per scenario in a fresh browser profile: setup flow, story with
 * its dialogs (setup pop-ups, end of round and generation, special setups, bidding countdown),
 * a tied final score through both tie-breakers, the ending, the endings gallery and the saved
 * games. Fails on any page error or if a game cannot be finished.
 *
 * Usage: node tools/e2e/src/full-game.ts [--build build/web/browser] [--base /sub/path/] [--chrome /usr/bin/google-chrome] [--shots dir] [--scenario id]
 */
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright-core';
import { serve } from './serve.ts';

const { values } = parseArgs({
  options: {
    build: { type: 'string', default: 'build/web/browser' },
    // The path the build was made for (its base href).
    base: { type: 'string', default: '/' },
    chrome: { type: 'string', default: process.env['CHROME_PATH'] ?? '/usr/bin/google-chrome' },
    shots: { type: 'string' },
    seed: { type: 'string', default: '3' },
    scenario: { type: 'string' },
  },
});

/** The scenarios as setup and the endings page name them. */
const SCENARIOS = [
  { id: 'cost-of-disease', title: 'The Cost of Disease' },
  { id: 'fear-of-the-unknown', title: 'Fear of the Unknown' },
  { id: 'a-time-of-war', title: 'A Time of War' },
].filter((s) => !values.scenario || s.id === values.scenario);
if (!SCENARIOS.length) {
  console.error(`Unknown scenario ${values.scenario}`);
  process.exit(2);
}

let seed = Number(values.seed);
const random = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
const failures: string[] = [];
/** The scenario being played, to name it in failures. */
let current = '';
const check = (ok: boolean, what: string) =>
  ok ? console.log(`  ✔ ${what}`) : (failures.push(`${current}: ${what}`), console.log(`  ✖ ${what}`));

async function shot(page: Page, name: string): Promise<void> {
  if (!values.shots) return;
  mkdirSync(values.shots, { recursive: true });
  await page.waitForTimeout(400); // let dialogs finish fading in
  await page.screenshot({ path: `${values.shots}/${name}.png` });
}

const { url, server } = await serve(values.build, values.base);
const browser = await chromium.launch({ executablePath: values.chrome, args: ['--no-sandbox'] });
try {
  for (const scenario of SCENARIOS) await playGame(browser, scenario);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}

/** One whole game of a scenario, in a fresh profile (no saves, unlocks or settings). */
async function playGame(browser: Browser, scenario: (typeof SCENARIOS)[number]): Promise<void> {
  console.log(`\n${scenario.title}`);
  current = scenario.id;
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const button = (name: RegExp | string) => page.getByRole('button', { name });
  const shotOf = (name: string) => shot(page, `${scenario.id}-${name}`);

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
    await shotOf('1-scenario');
    await button(scenario.title).click();
    await page.waitForURL('**/play');
    await page.locator('article.passage').waitFor();
    check(true, 'setup flow leads into the story');

    console.log('story');
    const seen = { dialogs: 0, bidding: 0, prompts: 0, links: 0, handovers: 0 };
    const handoverProblems = new Set<string>();
    let lastNotice = '';
    for (let step = 0; step < 4000; step++) {
      await page.waitForTimeout(15);
      const dialog = page.locator('dialog[open]').last();
      if (await dialog.count()) {
        // Dialogs queue up, so the one just counted may already be closing.
        const text = await dialog.innerText({ timeout: 2000 }).catch(() => undefined);
        if (text === undefined) continue;
        seen.dialogs++;
        const fullscreen = await dialog.evaluate((d) => d.classList.contains('fullscreen'), undefined, { timeout: 2000 }).catch(() => false);
        if (fullscreen) {
          // The hand-over hides the next player's page: nothing of it may show through.
          seen.handovers++;
          const alpha = await dialog.evaluate((d) => {
            const c = getComputedStyle(d).backgroundColor.match(/[\d.]+/g) ?? [];
            return c.length < 4 ? 1 : Number(c[3]);
          }, undefined, { timeout: 2000 }).catch(() => 1);
          if (alpha < 1) handoverProblems.add('see-through');
          // Confirming a notice shows its page; the same notice right after costs a second tap.
          if (text === lastNotice) handoverProblems.add(`shown twice: ${text.slice(0, 60)}`);
          lastNotice = text;
        } else {
          lastNotice = '';
          if (/hand (this|the) storybook( device)? to (?!the player)/i.test(text) && !/Ada|Bram|Cosima/.test(text)) handoverProblems.add(`no name: ${text.slice(0, 60)}`);
        }
        if (/Secret (Bid|Vote)/.test(text)) {
          // The dialog may already be past its start (a countdown begun in the last round).
          const start = dialog.getByRole('button', { name: /start/i });
          if (await start.count()) {
            seen.bidding++;
            await start.click();
          }
          await dialog.getByRole('button', { name: /accept/i }).click({ timeout: 6000 });
        } else {
          if (seen.dialogs === 1) await shotOf('2-dialog');
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
      lastNotice = '';
      const links = page.locator('button.story-link, button.continue-inline, button.setup-continue, button.panel.action, button.round-link');
      const n = await links.count();
      if (!n) break;
      seen.links++;
      await links.nth(random(n)).click({ timeout: 3000 }).catch(() => undefined);
      // Taps right after a page change count as a double tap and are ignored (Game.tap).
      await page.waitForTimeout(360);
    }
    console.log(`  ${seen.links} links, ${seen.dialogs} dialogs (${seen.bidding} bids, ${seen.handovers} hand-overs), ${seen.prompts} prompts`);
    check(page.url().includes('/score'), 'the story reaches final scoring');
    check(seen.handovers > 0 && !handoverProblems.size, `hand-overs are opaque and name the player (${[...handoverProblems].join('; ') || `${seen.handovers} checked`})`);

    console.log('scoring');
    const scores = page.locator('input[type=number]');
    await scores.nth(2).waitFor();
    // Scores, then the tie-breakers below them, on one page: typed with Enter only.
    check(await scores.nth(0).evaluate((e) => e === document.activeElement), 'the first score field has the focus');
    for (const [i, v] of ['42', '42', '30'].entries()) {
      await page.keyboard.type(v);
      if (i < 2) await page.keyboard.press('Enter');
    }
    // Tie-breaker 1: both leaders completed their Masterwork.
    await page.getByRole('checkbox', { name: 'Ada' }).check();
    await page.getByRole('checkbox', { name: 'Bram' }).check();
    // Tie-breaker 2: the same number of Estate Upgrades.
    await page.getByLabel('Estate Upgrades of Ada').fill('3');
    await page.getByLabel('Estate Upgrades of Bram').fill('3');
    await button('Show ranking').click();
    await page.locator('.ranking').waitFor();
    await shotOf('3-ranking');
    check((await page.locator('.family').count()) === 1, 'a tie that survives both tie-breakers is a family victory');
    await button('To the ending').click();
    await page.waitForURL('**/play');
    await page.locator('footer.ending').waitFor({ timeout: 5000 });
    check((await page.locator('.unlocked').count()) === 1, 'the ending is reached and unlocked');
    await shotOf('4-ending');

    console.log('endings gallery');
    await page.goto(url + 'endings');
    // A reload starts on the first scenario; the switcher shows the others.
    await button(scenario.title).click();
    await page.locator('h1', { hasText: scenario.title }).waitFor();
    await page.locator('.slots li').first().waitFor();
    check((await page.locator('.slots li:not(.locked)').count()) === 1, 'the gallery shows the unlocked ending');
    check((await page.locator('.slots li.locked strong').allInnerTexts()).every((t) => t === '???'), 'locked endings stay hidden');

    console.log('saved games');
    await page.goto(url);
    await page.getByRole('link', { name: 'Saved games' }).click();
    await page.locator('.games > li').first().waitFor();
    const saved = (await page.locator('.games > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    check(
      saved.length === 1 && saved[0]!.includes('Ravensbrück') && saved[0]!.includes(scenario.title) && saved[0]!.includes('Finished'),
      'the finished game is in the saved games',
    );
  } catch (e) {
    const lines = String(e).split('\n');
    const message = [lines[0], lines.find((l) => l.includes('waiting for'))?.trim()].filter(Boolean).join(' – ');
    console.log(`  ✖ ${message} (at ${page.url()})`);
    failures.push(`${current}: ${message}`);
    await shotOf('failure');
  } finally {
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await context.close();
  }
}
