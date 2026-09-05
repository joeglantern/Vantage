import { Wordmark } from '@web/components/AppShell';
import { ORGANISATION } from '@web/data/fixtures';
import './signIn.css';

export type SignInVariant = 'default' | 'invalid' | 'locked' | 'totp' | 'totpwrong';

const COPY: Record<SignInVariant, { title: string; sub: string; error?: string }> = {
  default: { title: 'Sign in', sub: ORGANISATION },
  invalid: {
    title: 'Sign in',
    sub: ORGANISATION,
    error:
      'The email or password is not right. Check both and try again. 4 attempts remain before this account is locked for 15 minutes.',
  },
  locked: {
    title: 'Sign in',
    sub: ORGANISATION,
    error:
      'This account is locked until 09:47 after 5 failed attempts. Your administrator, Esther Mburu, has been notified. If this was not you, tell her now.',
  },
  totp: {
    title: 'Enter your authenticator code',
    sub: 'Signing in as david.ochieng@tumaini.or.ke, approver',
  },
  totpwrong: {
    title: 'Enter your authenticator code',
    sub: 'Signing in as david.ochieng@tumaini.or.ke, approver',
    error:
      'That code was not accepted. Codes change every 30 seconds; enter the one showing now. 2 attempts remain.',
  },
};

export function SignIn({ variant }: { variant: SignInVariant }) {
  const copy = COPY[variant];
  const isTotp = variant === 'totp' || variant === 'totpwrong';
  const locked = variant === 'locked';
  const wrongCode = variant === 'totpwrong';

  return (
    <div className="signin-page">
      <div className="card signin-card">
        <div className="signin-brand">
          <Wordmark />
          <span>Vantage</span>
        </div>
        <h1>{copy.title}</h1>
        <p className="text2 signin-sub">{copy.sub}</p>

        {copy.error !== undefined && (
          <div role="alert" className="signin-error pretty">
            {copy.error}
          </div>
        )}

        {!isTotp && (
          <>
            <label className="label signin-label" htmlFor="email">
              Email
            </label>
            <input id="email" className="field" type="email" defaultValue="wanjiku.ndegwa@tumaini.or.ke" />
            <label className="label signin-label" htmlFor="password">
              Password
            </label>
            <input id="password" className="field mono" type="password" defaultValue="password1234" />
            <button type="button" className="btn btn-primary signin-submit" disabled={locked}>
              Sign in
            </button>
            <a href="#" className="signin-forgot">
              Forgotten your password
            </a>
          </>
        )}

        {isTotp && (
          <>
            <label className="label signin-label" htmlFor="totp-0">
              Authenticator code
            </label>
            <div className="totp" role="group" aria-label="Six digit authenticator code">
              {Array.from({ length: 6 }, (_, i) => (
                <input
                  key={i}
                  id={`totp-${i}`}
                  className={`totp-digit${wrongCode ? ' totp-digit-error' : ''}`}
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  defaultValue={wrongCode ? '193026'[i] : ''}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
            <button type="button" className="btn btn-primary signin-submit">
              Continue
            </button>
            <p className="hint signin-totp-note pretty">
              Required for the approver role. Lost your device? Ask your administrator to reset your
              second factor; it cannot be done from here.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
