import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from './install';

/** Chrome's install offer, as far as the service uses it. */
function offer(outcome: 'accepted' | 'dismissed') {
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  dispatchEvent(e);
  return e;
}

describe('Install', () => {
  let standalone = false;

  beforeEach(() => {
    localStorage.clear();
    standalone = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)' && standalone,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers Chrome’s install dialog once the browser offers it', async () => {
    const install = TestBed.inject(Install);
    expect(install.hint()).toBeUndefined();
    const e = offer('accepted');
    expect(e.defaultPrevented).toBe(true);
    expect(install.hint()).toBe('prompt');

    await install.prompt();
    expect(e.prompt).toHaveBeenCalled();
    expect(install.hint()).toBeUndefined();
  });

  it('says nothing when already installed', () => {
    standalone = true;
    const install = TestBed.inject(Install);
    offer('accepted');
    expect(install.hint()).toBeUndefined();
  });

  it('stays away once dismissed, also next time', () => {
    const install = TestBed.inject(Install);
    offer('dismissed');
    install.dismiss();
    expect(install.hint()).toBeUndefined();
    TestBed.resetTestingModule();
    offer('dismissed');
    expect(TestBed.inject(Install).hint()).toBeUndefined();
  });
});
