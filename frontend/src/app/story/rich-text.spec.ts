import { TestBed } from '@angular/core/testing';
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
    expect(el.querySelector('.icon')?.getAttribute('title')).toBe('S1_HeartToken');
  });
});
