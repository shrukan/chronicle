import { TestBed } from '@angular/core/testing';
import { Library } from '../../../../core/services/library';
import { RichText } from './rich-text';

describe('RichText', () => {
  it('renders bold, italic, icons and placeholders', async () => {
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', 'Give **{0}** a {icon:S1_HeartToken} *now*');
    fixture.componentRef.setInput('args', ['Ada']);
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.replace(/\s+/g, ' ').trim()).toBe('Give Ada a Heart Token now');
    expect(el.querySelector('.font-semibold')?.textContent).toBe('Ada');
    expect(el.querySelector('.italic')?.textContent).toBe('now');
    // Without extracted assets the icon shows as a label.
    expect(el.querySelector('.icon-label')?.getAttribute('title')).toBe('S1_HeartToken');
  });

  it('shows the original icon image when assets are available', async () => {
    TestBed.inject(Library).assets.set({
      icons: { S1_HeartToken: 'icons/s1-heart-token.webp' },
      setup: {},
      ui: {},
      music: { title: '', scenario: {} },
      effects: {},
      voiceOver: {},
      missing: [],
    });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', 'A {icon:S1_HeartToken}');
    await fixture.whenStable();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img.icon');
    expect(img?.getAttribute('src')).toBe('content/assets/icons/s1-heart-token.webp');
    expect(img?.getAttribute('alt')).toBe('Heart Token');
  });
});
