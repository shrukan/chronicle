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
  template: `
    @for (tab of tabs(); track tab.id) {
      <button
        type="button"
        role="tab"
        [id]="tabId(tab.id)"
        [attr.aria-selected]="selected() === tab.id"
        [attr.aria-controls]="panelId()"
        [tabindex]="selected() === tab.id ? 0 : -1"
        (click)="selected.set(tab.id)"
      >
        {{ tab.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.35rem;
    }
    button {
      padding: 0.3rem 0.8rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
      background: transparent;
      color: var(--color-muted);
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      color: var(--color-ink);
    }
    /* Filled, so the choice is plain on light and dark paper alike. */
    button[aria-selected='true'] {
      border-color: var(--color-accent);
      background: var(--color-accent);
      color: var(--color-on-accent);
    }
    button:focus-visible {
      outline: 2px solid var(--color-accent-text);
      outline-offset: 2px;
    }
  `,
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
