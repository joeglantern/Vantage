/**
 * The shell every signed-in screen sits inside: left rail, top bar, main.
 *
 * The environment banner is here and is deliberately hard to miss. docs/09:
 * somebody will eventually approve a real batch believing they are in staging,
 * and the only defence against that is that it looks nothing like production.
 */
import type { ReactNode } from 'react';
import { ORGANISATION } from '@web/data/fixtures';
import './appShell.css';

export const NAV_ITEMS = ['Batches', 'Reconciliation', 'Recipients', 'Packs', 'Settings'] as const;
export type NavItem = (typeof NAV_ITEMS)[number];

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="2" fill="#0F5257" />
      <path d="M4 5h4l2 6 2-6h4l-5 11h-2Z" fill="#FFFFFF" />
    </svg>
  );
}

export interface AppShellProps {
  active: NavItem;
  onNavigate: (item: NavItem) => void;
  user: { name: string; role: string };
  environment?: 'production' | 'sandbox' | 'development';
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  children: ReactNode;
}

export function AppShell({
  active,
  onNavigate,
  user,
  environment = 'sandbox',
  theme,
  onToggleTheme,
  children,
}: AppShellProps) {
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          // The router owns the hash. Letting this navigate would parse #main
          // as a screen name and bounce the user to Batches.
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to main content
      </a>
      {environment !== 'production' && (
        <div className="env-banner" role="status">
          <strong>{environment === 'sandbox' ? 'Sandbox' : 'Development'}</strong>
          <span>
            No real money moves from here. Payments go to the Daraja {environment} shortcode, not to
            your organisation&rsquo;s.
          </span>
        </div>
      )}
      <div className="shell-body">
        <nav className="rail" aria-label="Sections">
          <div className="rail-brand">
            <Wordmark />
            <span>Vantage</span>
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className={`rail-item${item === active ? ' rail-item-active' : ''}`}
              aria-current={item === active ? 'page' : undefined}
              onClick={() => onNavigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="shell-main">
          <header className="topbar">
            <span className="text2">{ORGANISATION}</span>
            <div className="topbar-right">
              {onToggleTheme !== undefined && (
                <button
                  type="button"
                  className="topbar-icon"
                  onClick={onToggleTheme}
                  aria-pressed={theme === 'dark'}
                  title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
                >
                  <span className="visually-hidden">
                    {theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
                  </span>
                  {theme === 'dark' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                    </svg>
                  )}
                </button>
              )}
              <span className="text2">
                {user.name} <span className="muted">&middot; {user.role}</span>
              </span>
            </div>
          </header>
          <main id="main" className="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
