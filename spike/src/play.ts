/**
 * Terminal player for converted scenarios.
 * Usage: node spike/src/play.ts [--players N] [--start Passage] [--short] [dir] [id]
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { parseMarkup, resolveText, Story, StoryError, type Out, type StringTable } from '@chronicle/engine';
import { load, setupVars } from './load.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { players: { type: 'string', default: '3' }, start: { type: 'string' }, short: { type: 'boolean', default: false } },
});
const [dir = 'spike/out', id = 'cost-of-disease'] = positionals;
const { scenario, strings } = load(dir, id);
const mode = values.short ? 'short' : 'full';

const B = '\x1b[1m', I = '\x1b[3m', DIM = '\x1b[2m', CY = '\x1b[36m', YE = '\x1b[33m', R = '\x1b[0m';

function render(out: Out[], table: StringTable): string {
  let s = '';
  for (const o of out) {
    switch (o.t) {
      case 'text':
        for (const span of parseMarkup(resolveText(table, o.key, mode, o.kind), o.args)) {
          if (span.t === 'newline') s += '\n';
          else {
            const style = (span.bold ? B : '') + (span.italic ? I : '');
            s += style + (span.t === 'icon' ? `${YE}[${span.name.replace(/^S\d_/, '')}]` : span.text) + R;
          }
        }
        break;
      case 'br':
        s += '\n';
        break;
      case 'block': {
        const inner = render(o.children, table).trim();
        const label = o.style === 'setupEvent' ? `SETUP${o.image ? ` (${o.image})` : ''}` : o.style.toUpperCase();
        s += `\n${DIM}┌─ ${label}${R}\n` + inner.split('\n').map((l) => `${DIM}│${R} ${l}`).join('\n') + `\n${DIM}└─${R}\n`;
        break;
      }
      case 'group':
        s += render(o.children, table);
        break;
      case 'link':
        s += `${CY}[${o.id}] ${resolveText(table, o.key)}${R}`;
        break;
      case 'prompt':
        s += `${YE}? ${resolveText(table, o.key)}${R}\n`;
        break;
      case 'ui':
        s += `${DIM}⟨${o.ui}${Object.keys(o.args).length ? ' ' + JSON.stringify(o.args) : ''}⟩${R}\n`;
        break;
    }
  }
  return s;
}

const story = new Story(scenario, { vars: setupVars(Number(values.players)) });
const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on('close', () => process.exit(0));
let view = story.start(values.start);

for (;;) {
  console.log(`\n${DIM}════ ${view.passage} ════${R}`);
  console.log(render(view.output, strings).replace(/\n{3,}/g, '\n\n'));
  try {
    if (view.prompt) {
      view = story.answer((await rl.question(`${YE}> ${R}`)).trim());
      continue;
    }
    if (!view.links.length) {
      console.log(`${DIM}(no links – end)${R}`);
      break;
    }
    const cmd = (await rl.question(`${CY}link / v(ars) / q > ${R}`)).trim();
    if (cmd === 'q') break;
    if (cmd === 'v') {
      console.log(Object.fromEntries(Object.entries(story.vars).filter(([, v]) => v !== '' && v !== 0 && v !== null)));
      continue;
    }
    view = story.click(Number(cmd));
  } catch (e) {
    if (!(e instanceof StoryError)) throw e;
    console.log(`\x1b[31m${e.message}${R}`);
  }
}
rl.close();
