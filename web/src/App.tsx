/**
 * The screens from ScreensBoard.dc.html, with the variant switcher the board
 * used as its `screen` and `variant` props.
 *
 * There is no API yet, so every screen renders from web/src/data/fixtures.ts.
 * That module is the seam: when the HTTP layer lands, those become queries and
 * nothing in a screen has to change.
 *
 * The variant switcher is a development affordance. It reads the state from the
 * URL so a particular state can be linked to and reviewed, and it is not part of
 * the product.
 */
import { useEffect, useState } from 'react';
import { AppShell, type NavItem } from '@web/components/AppShell';
import { Approval, APPROVER_USER, VIEWER_USER, type ApprovalVariant } from '@web/screens/Approval';
import { Batches, type BatchesVariant } from '@web/screens/Batches';
import { Import, type ImportVariant } from '@web/screens/Import';
import { Queue, type QueueVariant } from '@web/screens/Queue';
import { Recipients, type RecipientsVariant } from '@web/screens/Recipients';
import { Settings, type SettingsVariant } from '@web/screens/Settings';
import { SignIn, type SignInVariant } from '@web/screens/SignIn';
import { ADMIN_USER, CURRENT_USER } from '@web/data/fixtures';
import './styles/tokens.css';
import './styles/base.css';
import './styles/devbar.css';

const SCREENS = {
  batches: ['populated', 'empty', 'filtered'],
  import: ['waiting', 'parsing', 'preview', 'unreadable', 'columns', 'emptyfile', 'large'],
  queue: ['blocking', 'warnings', 'acknowledged', 'clear', 'validating'],
  approval: ['ready', 'challenge', 'failed', 'approving', 'approved', 'preparer', 'norole'],
  recipients: ['list', 'detail', 'erase'],
  settings: ['default', 'replace'],
  signin: ['default', 'invalid', 'locked', 'totp', 'totpwrong'],
} as const;

type ScreenKey = keyof typeof SCREENS;

function readHash(): { screen: ScreenKey; variant: string } {
  const [rawScreen, rawVariant] = window.location.hash.replace(/^#\/?/, '').split('/');
  const screen = (rawScreen ?? '') in SCREENS ? (rawScreen as ScreenKey) : 'batches';
  const variants: readonly string[] = SCREENS[screen];
  const variant = rawVariant !== undefined && variants.includes(rawVariant) ? rawVariant : variants[0]!;
  return { screen, variant };
}

export function App() {
  const [{ screen, variant }, setRoute] = useState(readHash);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  }, [dark]);

  const go = (nextScreen: ScreenKey, nextVariant?: string) => {
    const v = nextVariant ?? SCREENS[nextScreen][0];
    window.location.hash = `/${nextScreen}/${v}`;
  };

  const navigate = (item: NavItem) => {
    if (item === 'Batches') go('batches');
    else if (item === 'Recipients') go('recipients');
    else if (item === 'Settings') go('settings');
    // Reconciliation and Packs are on later boards and not built yet.
  };

  const body = (() => {
    switch (screen) {
      case 'batches':
        return <Batches variant={variant as BatchesVariant} />;
      case 'import':
        return <Import variant={variant as ImportVariant} />;
      case 'queue':
        return <Queue key={variant} variant={variant as QueueVariant} />;
      case 'approval':
        return <Approval key={variant} variant={variant as ApprovalVariant} />;
      case 'recipients':
        return <Recipients key={variant} variant={variant as RecipientsVariant} />;
      case 'settings':
        return <Settings key={variant} variant={variant as SettingsVariant} />;
      case 'signin':
        return <SignIn variant={variant as SignInVariant} />;
    }
  })();

  const activeNav: NavItem =
    screen === 'recipients' ? 'Recipients' : screen === 'settings' ? 'Settings' : 'Batches';

  // Approval is seen by an approver, except in the two blocked states, where
  // the point is who is looking: the preparer, or somebody without the role.
  const user =
    screen === 'settings'
      ? ADMIN_USER
      : screen === 'approval'
        ? variant === 'preparer'
          ? CURRENT_USER
          : variant === 'norole'
            ? VIEWER_USER
            : APPROVER_USER
        : CURRENT_USER;

  return (
    <>
      {screen === 'signin' ? (
        body
      ) : (
        <AppShell
          active={activeNav}
          onNavigate={navigate}
          user={user}
        >
          {body}
        </AppShell>
      )}

      <div className="devbar" role="region" aria-label="State switcher, development only">
        <span className="devbar-tag">States</span>
        <select
          aria-label="Screen"
          value={screen}
          onChange={(event) => go(event.target.value as ScreenKey)}
        >
          {Object.keys(SCREENS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Variant"
          value={variant}
          onChange={(event) => go(screen, event.target.value)}
        >
          {SCREENS[screen].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setDark((d) => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
    </>
  );
}
