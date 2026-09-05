/**
 * Routing and the small amount of session state the interface holds.
 *
 * There is still no API. What there is, now, is a real path through the
 * product: drop a CSV on the import screen, it is parsed here in the browser,
 * the real validation rules from src/domain run over it, and the exception
 * queue renders the findings those rules produced. Nothing on that path is
 * mocked.
 *
 * The screens that still read from fixtures are marked in the state switcher.
 * They are honest about what they are, which the dead nav items were not.
 */
import { useEffect, useState } from 'react';
import { AppShell, type NavItem } from '@web/components/AppShell';
import { Approval, APPROVER_USER, VIEWER_USER, type ApprovalVariant } from '@web/screens/Approval';
import { Batches, type BatchesVariant } from '@web/screens/Batches';
import { Import, type ImportedBatch } from '@web/screens/Import';
import { Packs, type PacksVariant } from '@web/screens/Packs';
import { Queue, type QueueVariant } from '@web/screens/Queue';
import { Reconciliation, type ReconciliationVariant } from '@web/screens/Reconciliation';
import { Recipients, type RecipientsVariant } from '@web/screens/Recipients';
import { Settings, type SettingsVariant } from '@web/screens/Settings';
import { SignIn, type SignInVariant } from '@web/screens/SignIn';
import { ADMIN_USER, CURRENT_USER } from '@web/data/fixtures';
import './styles/tokens.css';
import './styles/base.css';
import './styles/devbar.css';

const SCREENS = {
  batches: ['populated', 'empty', 'filtered'],
  import: ['live'],
  queue: ['blocking', 'warnings', 'acknowledged', 'clear', 'validating'],
  approval: ['ready', 'challenge', 'failed', 'approving', 'approved', 'preparer', 'norole'],
  reconciliation: ['clear', 'open'],
  packs: ['list', 'pack', 'superseded'],
  recipients: ['list', 'detail', 'erase'],
  settings: ['default', 'replace'],
  signin: ['default', 'invalid', 'locked', 'totp', 'totpwrong'],
} as const;

type ScreenKey = keyof typeof SCREENS;

/** Which nav item owns each screen, so the rail never highlights nothing. */
const OWNER: Record<ScreenKey, NavItem | null> = {
  batches: 'Batches',
  import: 'Batches',
  queue: 'Batches',
  approval: 'Batches',
  reconciliation: 'Reconciliation',
  packs: 'Packs',
  recipients: 'Recipients',
  settings: 'Settings',
  signin: null,
};

/** The screen each nav item lands on. Every item goes somewhere. */
const LANDING: Record<NavItem, ScreenKey> = {
  Batches: 'batches',
  Reconciliation: 'reconciliation',
  Recipients: 'recipients',
  Packs: 'packs',
  Settings: 'settings',
};

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
  /** The batch the user actually uploaded this session, if any. */
  const [imported, setImported] = useState<ImportedBatch | null>(null);

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

  const body = (() => {
    switch (screen) {
      case 'batches':
        return <Batches variant={variant as BatchesVariant} onNewBatch={() => go('import')} />;
      case 'import':
        return (
          <Import
            onValidate={(batch) => {
              setImported(batch);
              go('queue', 'blocking');
            }}
          />
        );
      case 'queue':
        return imported === null ? (
          <Queue key={variant} variant={variant as QueueVariant} />
        ) : (
          <Queue
            key={imported.fileName}
            variant="blocking"
            rows={imported.rows}
            batch={{
              reference: 'YCIC-2026-03',
              programme: 'YCIC March 2026 stipend',
              fileName: imported.fileName,
              uploadedAt: 'just now',
            }}
          />
        );
      case 'approval':
        return <Approval key={variant} variant={variant as ApprovalVariant} />;
      case 'reconciliation':
        return <Reconciliation key={variant} variant={variant as ReconciliationVariant} />;
      case 'packs':
        return <Packs key={variant} variant={variant as PacksVariant} />;
      case 'recipients':
        return <Recipients key={variant} variant={variant as RecipientsVariant} />;
      case 'settings':
        return <Settings key={variant} variant={variant as SettingsVariant} />;
      case 'signin':
        return <SignIn variant={variant as SignInVariant} />;
    }
  })();

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
          active={OWNER[screen] ?? 'Batches'}
          onNavigate={(item) => go(LANDING[item])}
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
          disabled={SCREENS[screen].length < 2}
        >
          {SCREENS[screen].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {imported !== null && (
          <button
            type="button"
            title={`Showing your uploaded ${imported.fileName}. Clear to return to the sample data.`}
            onClick={() => {
              setImported(null);
              go('import');
            }}
          >
            Clear upload
          </button>
        )}
        <button type="button" onClick={() => setDark((d) => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
    </>
  );
}
