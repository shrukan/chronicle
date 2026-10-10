import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';

export interface Tab {
  id: string;
  label: string;
}

/**
 * A row of tabs (Endings, Help). The page shows the selected tab's content in an element with
 * `role="tabpanel"` and the id `panelId`. Arrow keys, Home and End move between tabs.
 */
@Component({
  selector: 'cr-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'tablist', '(keydown)': 'onKey($event)' },
  templateUrl: './tabs.html',
  styleUrl: './tabs.css',
})
export class Tabs {
  readonly tabs = input.required<readonly Tab[]>();
  readonly selected = model.required<string>();
  /** The id of the page's tab panel. */
  readonly panelId = input.required<string>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** A tab's element id; the panel is labelled by the selected one's. */
  tabId(tab: string): string {
    return `${this.panelId()}-${tab}`;
  }

  protected onKey(event: KeyboardEvent): void {
    const ids = this.tabs().map((t) => t.id);
    const i = ids.indexOf(this.selected());
    const next = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: ids.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = ids[(next + ids.length) % ids.length]!;
    this.selected.set(id);
    this.host.querySelector<HTMLElement>(`#${CSS.escape(this.tabId(id))}`)?.focus();
  }
}
