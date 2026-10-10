import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { Story, type Node, type Out, type StringTable } from '@chronicle/engine';
import { convertScenario, type ConvertResult } from './convert.ts';
import type { ScenarioConfig } from './scenarios.ts';

/** A tiny story in the shape Cradle generates, including typical hand edits. */
const STORY = String.raw`
public partial class @Test : Cradle.StoryFormats.Harlowe.HarloweStory
{
    private bool ispopup = true;
    public class VarDefs : RuntimeVars
    {
        public StoryVar @players = 0;
        public StoryVar @meet;
        public StoryVar @total;
        public StoryVar @ally;
        public StoryVar @unused;
    }
    public void LoadData()
    {
        Vars.meet = mainData.meet;
        Vars.total = mainData.total;
    }

    void passage1_Init() { this.Passages[@"Start"] = new StoryPassage(@"Start", new string[] { "HUB", }, passage1_Main); }
    IStoryThread passage1_Main()
    {
        using (styleScope("bold", true)) { yield return text("A Title"); }
        yield return lineBreak();
        yield return text("Give the marker to ");
        using (styleScope("bold", true))
        {
            if (Vars.players == 2) { yield return text(macros1.either(Vars.nameA, Vars.nameB)); }
            yield return text(".");
        }
        yield return text(" Take a <sprite=\"S1_HeartToken\" index=0> tok" +
            "en.");
        yield return lineBreak();
        if (Vars.meet == 0 || Vars.meet == "") { Vars.meet = Vars.nameA; }
        using (styleScope("hook", "h1"))
            yield return link("Click to continue...", null, () => enchantHook("h1", HarloweEnchantCommand.Replace, passage1_Fragment_0));
        yield break;
    }
    IStoryThread passage1_Fragment_0()
    {
        ViewItemObtain.SetupPassagename = "Count";
        using (styleScope("setupStyleEvnt", true))
        {
            Vars._SetupImage = "Icon";
            if (Vars.players == 2) { using (styleScope("setupStyleEvnt", true)) { yield return text("Place two tokens."); } }
            else { yield return text("Place one token."); }
        }
        yield break;
    }
    IStoryThread passage1_Fragment_1()
    {
        yield return enchant("Click to continue...", HarloweEnchantCommand.Replace, passage1_Fragment_0);
        yield break;
    }

    void passage2_Init() { this.Passages[@"Count"] = new StoryPassage(@"Count", new string[] { }, passage2_Main); }
    IStoryThread passage2_Main()
    {
        if (ispopup)
        {
            ispopup = false;
            ViewPopupPanel.instance.Clear();
            ViewPopupPanel.instance.OnGenerationBtn("Count", "How many tokens does " + Vars.nameA + " have?", "number", 0.5f);
        }
        if (ViewPopupPanel.instance.PassageValueNumber() >= 0)
        {
            Vars.total = ViewPopupPanel.instance.PassageValueNumber();
            ispopup = true;
        }
        yield return text("Total: ");
        yield return text(Vars.total);
        yield return lineBreak();
        yield return link("Click to continue...", "Borrow", null);
        yield break;
    }

    void passage3_Init() { this.Passages[@"Borrow"] = new StoryPassage(@"Borrow", new string[] { }, passage03_Main); }
    IStoryThread passage03_Main()
    {
        using (styleScope("hook", "h2"))
            yield return link(Vars.nameA, null, () => enchantHook("h2", HarloweEnchantCommand.Replace, passage1_Fragment_0));
        yield return link("Click to continue...", "End", null);
        yield break;
    }

    void passage4_Init() { this.Passages[@"End"] = new StoryPassage(@"End", new string[] { }, passage4_Main); }
    IStoryThread passage4_Main()
    {
        yield return text("The end.");
        yield break;
    }

    void passage5_Init() { this.Passages[@"Notes"] = new StoryPassage(@"Notes", new string[] { }, passage5_Main); }
    IStoryThread passage5_Main()
    {
        yield return text("DEV NOTE: nobody links here.");
        yield break;
    }
}`;

const MAIN_DATA = `public class MainData { public string meet; public int total; }`;

const CONFIG: ScenarioConfig = { id: 'test', source: 'Test.cs', start: 'Start', entries: [], screens: {} };

function texts(out: Out[], strings: StringTable): string[] {
  return out.flatMap((o): string[] =>
    o.t === 'text' ? [strings[o.key]!.full.replace(/\{(\d+)\}/g, (_, i: string) => o.args[Number(i)]!)]
    : o.t === 'block' || o.t === 'group' ? texts(o.children, strings)
    : []);
}

describe('convertScenario', () => {
  let r: ConvertResult;
  before(async () => {
    r = await convertScenario({ config: CONFIG, story: STORY, mainData: MAIN_DATA, file: 'Test.cs' });
  });

  it('converts everything without manual work', () => {
    assert.deepEqual(r.report.manual, []);
    assert.deepEqual(r.report.unknownExpressions, []);
    assert.deepEqual(r.report.typing.issues, []);
  });

  it('drops unreachable passages, dead fragments and unused variables', () => {
    assert.deepEqual(Object.keys(r.scenario.passages).sort(), ['Borrow', 'Count', 'End', 'Start']);
    assert.deepEqual(r.report.unreachable, ['Notes']);
    assert.deepEqual(r.report.deadFragments, ['Start#1']);
    assert.ok(!('unused' in r.scenario.variables));
    assert.ok(!('ispopup' in r.scenario.variables), 'pop-up flags are plumbing');
  });

  it('keeps a sentence with inline styles, icons and a conditional value as one string', () => {
    const start = r.scenario.passages['Start']!;
    const sentence = start.body.find((n): n is Extract<Node, { t: 'text' }> => n.t === 'text' && n.kind !== 'title')!;
    assert.equal(r.strings[sentence.key]!.full, 'Give the marker to **{0}.** Take a {icon:S1_HeartToken} token.');
    assert.equal(sentence.kind, 'instruction');
    assert.equal(r.strings['Start.1']!.full, '**A Title**');
  });

  it('types variables from their use and rewrites unset checks', () => {
    assert.equal(r.scenario.variables['meet'], '');
    assert.equal(r.scenario.variables['total'], 0);
    assert.ok(!JSON.stringify(r.scenario).includes('null'));
  });

  it('shares repeated link labels', () => {
    assert.equal(r.strings['common.click-to-continue']!.full, 'Click to continue...');
  });

  it('plays: reveal, setup pop-up, prompt with placeholder, borrowed fragment', () => {
    const s = new Story(r.scenario, { vars: { players: 2, nameA: 'Ada', nameB: 'Bram' }, chooser: { choose: () => 1 } });
    let v = s.start();
    assert.ok(texts(v.output, r.strings).includes('Give the marker to **Bram.** Take a {icon:S1_HeartToken} token.'));
    assert.equal(s.vars['meet'], 'Ada');

    // Revealing the fragment shows the setup pop-up; its continue button leads to "Count".
    v = s.click(v.links[0]!);
    assert.ok(texts(v.output, r.strings).includes('Place two tokens.'));
    v = s.click(v.links[0]!);
    assert.equal(v.passage, 'Count');

    assert.equal(r.strings[v.prompt!.key]!.full, 'How many tokens does {0} have?');
    assert.deepEqual(v.prompt!.args, ['Ada']);
    v = s.answer('7');
    assert.ok(texts(v.output, r.strings).includes('Total: 7'));

    // "Borrow" reveals a fragment that belongs to "Start" (a hand edit in the original).
    v = s.click(v.links[0]!);
    assert.equal(v.passage, 'Borrow');
    v = s.click(v.links[0]!);
    assert.ok(texts(v.output, r.strings).includes('Place two tokens.'));
  });
});

/** Page openings that the original writes in bold, and an end-of-round link inside a section. */
const OPENINGS = String.raw`
public partial class @Openings : Cradle.StoryFormats.Harlowe.HarloweStory
{
    public class VarDefs : RuntimeVars { public StoryVar @players = 0; public StoryVar @case = 0; }

    void passage1_Init() { this.Passages[@"Hand"] = new StoryPassage(@"Hand", new string[] { }, passage1_Main); }
    IStoryThread passage1_Main()
    {
        using (styleScope("bold", true))
        {
            yield return text("Carefully hand the Storybook to ");
            yield return text(Vars.nameA);
            yield return text(". This choice is read within view of all players.");
        }
        yield return lineBreak();
        yield return text("The story goes on.");
        yield return lineBreak();
        yield return link("Click to continue...", "Case", null);
        yield break;
    }

    void passage2_Init() { this.Passages[@"Case"] = new StoryPassage(@"Case", new string[] { }, passage2_Main); }
    IStoryThread passage2_Main()
    {
        using (styleScope("bold", true))
        {
            yield return text("Statement - Case ");
            yield return text(Vars.case);
        }
        yield return text(" It began at the pub.");
        yield return lineBreak();
        yield return link("Click to continue...", "Recipe", null);
        yield break;
    }

    void passage3_Init() { this.Passages[@"Recipe"] = new StoryPassage(@"Recipe", new string[] { }, passage3_Main); }
    IStoryThread passage3_Main()
    {
        using (styleScope("bold", true)) { yield return text("Click on your name below to view the recipe:"); }
        yield return lineBreak();
        yield return link("Click to continue...", "Hub", null);
        yield break;
    }

    void passage4_Init() { this.Passages[@"Hub"] = new StoryPassage(@"Hub", new string[] { "HUB", }, passage4_Main); }
    IStoryThread passage4_Main()
    {
        using (styleScope("hubTitle", true)) { yield return text("Market"); }
        yield return lineBreak();
        using (styleScope("hubDetails", true)) { yield return text("Buy a token."); }
        yield return lineBreak();
        using (styleScope("hubTitle", true)) { yield return text("Second round Event"); }
        yield return lineBreak();
        using (styleScope("hubDetails", true))
        {
            yield return link("Click here at the end of the round to continue...", "Hand", null);
        }
        yield break;
    }
}`;

describe('convertScenario: page openings and sections', () => {
  let r: ConvertResult;
  const node = (passage: string, kind?: string) =>
    r.scenario.passages[passage]!.body.find((n): n is Extract<Node, { t: 'text' }> => n.t === 'text' && (!kind || n.kind === kind));
  before(async () => {
    r = await convertScenario({
      config: { id: 'openings', source: 'Openings.cs', start: 'Hand', entries: [], screens: {} },
      story: OPENINGS,
      mainData: MAIN_DATA,
      file: 'Openings.cs',
    });
  });

  it('keeps a hand-over with the player name in it as one command', () => {
    const first = node('Hand')!;
    assert.equal(first.kind, 'command');
    assert.equal(r.strings[first.key]!.full, '**Carefully hand the Storybook to {0}. This choice is read within view of all players.**');
  });

  it('keeps a value that is part of the heading in the title', () => {
    assert.equal(r.strings[node('Case', 'title')!.key]!.full, '**Statement - Case {0}**');
  });

  it('does not make an instruction the page title', () => {
    assert.equal(node('Recipe', 'title'), undefined);
    assert.equal(node('Recipe')!.kind, 'instruction');
  });

  it('drops a section left empty once its end-of-round link moves below it', () => {
    const hub = r.scenario.passages['Hub']!.body;
    const titles = hub.filter((n) => n.t === 'block' && n.style === 'hubTitle');
    assert.equal(titles.length, 1);
    assert.ok(!hub.some((n) => n.t === 'block' && n.style === 'hubDetails' && n.body.length === 0));
    assert.ok(hub.some((n) => n.t === 'link'));
  });
});
