import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const STEPS = ['Sign in', 'Info', 'Interests', 'Friends']

export default function Auth() {
  const [mode, setMode] = useState('welcome') // welcome | signin | signup | confirm
  const [step, setStep] = useState(0)         // 0=credentials, 1=role
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('consumer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function reset(nextMode) {
    setError(''); setStep(0); setMode(nextMode)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!email.endsWith('.edu')) { setError('Only .edu email addresses are allowed.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName, role } },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    // session is null when email confirmation is required (Supabase default).
    // session is set immediately when confirmation is disabled.
    if (!data.session) setMode('confirm')
    // If data.session exists, onAuthStateChange in App.jsx handles the redirect.
  }

  // ── Welcome (Figma 190-616: Welcome!, Create account, .edu email, password, CTA, Sign in)
  if (mode === 'welcome') {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-centered">
          <div className="auth-card-inner">
            <h1 className="auth-title">Welcome!</h1>
            <p className="auth-subtitle">Create account</p>

            <div className="auth-input-wrap">
              <label className="auth-input-label" htmlFor="welcome-email">.edu email</label>
              <input
                id="welcome-email"
                className="auth-input"
                type="email"
                placeholder="student@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="auth-input-wrap">
              <label className="auth-input-label" htmlFor="welcome-password">password</label>
              <input
                id="welcome-password"
                className="auth-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="auth-btn-create"
              onClick={() => { setError(''); setMode('signup'); setStep(0); }}
            >
              Create Account
            </button>
            <button type="button" className="auth-signin-link" onClick={() => { setError(''); setMode('signin'); }}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Confirm email ─────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📧</div>
          <h2 className="auth-title">Check your email</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            We sent a confirmation link to
          </p>
          <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24, fontSize: '0.9rem' }}>
            {email}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 28 }}>
            Click the link in the email to activate your account, then come back and sign in.
          </p>
          <button className="btn btn-primary btn-full" onClick={() => reset('signin')}>
            Go to Sign in
          </button>
        </div>
      </div>
    )
  }

  // ── Sign in (same card style as Figma) ────────────────────────────────────
  if (mode === 'signin') {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-centered">
          <div className="auth-card-inner">
            <h2 className="auth-title auth-title-signin">Welcome back</h2>
            <p className="auth-subtitle auth-subtitle-signin">Sign in to your account</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSignIn}>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signin-email">.edu email</label>
                <input
                  id="signin-email"
                  className="auth-input"
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signin-password">password</label>
                <input
                  id="signin-password"
                  className="auth-input"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <button className="auth-btn-primary" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="auth-links">
              <button type="button" className="auth-link-btn" onClick={() => setError('')}>Forgot password?</button>
            </p>
            <div className="auth-switch">
              Don&apos;t have an account? <button type="button" onClick={() => reset('signup')}>Sign up</button>
            </div>
            <div className="auth-social">
              <button type="button" className="btn btn-outline btn-full" disabled>Continue with Google</button>
              <button type="button" className="btn btn-outline btn-full" disabled>Continue with Apple</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign up — step 0 (same card/input style as Figma) ───────────────────────
  if (mode === 'signup' && step === 0) {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-centered">
          <div className="auth-card-inner">
            <h2 className="auth-title auth-title-signin">Create account</h2>
            <p className="auth-subtitle auth-subtitle-signin">Use your .edu email to join</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={e => { e.preventDefault(); setError(''); if (!email.endsWith('.edu')) { setError('Only .edu emails allowed.'); return } if (!displayName.trim()) { setError('Please enter your name.'); return } if (password.length < 8) { setError('Password must be at least 8 characters.'); return } setStep(1); }}>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-name">Full name</label>
                <input id="signup-name" className="auth-input" type="text" placeholder="Alex Johnson"
                  value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-email">.edu email</label>
                <input id="signup-email" className="auth-input" type="email" placeholder="student@university.edu"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-password">password</label>
                <input id="signup-password" className="auth-input" type="password" placeholder="At least 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)} minLength={8} />
              </div>
              <p className="auth-terms">By signing up you agree to our Terms of Service and Privacy Policy.</p>
              <button type="submit" className="auth-btn-primary">
                Sign up
              </button>
            </form>

            <div className="auth-switch">
              Already have an account? <button type="button" onClick={() => reset('signin')}>Sign in</button>
            </div>
            <div className="auth-social">
              <button type="button" className="btn btn-outline btn-full" disabled>Continue with Google</button>
              <button type="button" className="btn btn-outline btn-full" disabled>Continue with Apple</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign up — step 1: role ────────────────────────────────────────────────
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="onboarding-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item${i === 1 ? ' active' : ''}`}>
              <div className="step-dot" />{s}
            </div>
          ))}
        </div>

        <h2 className="auth-title">Get to know you</h2>
        <p className="auth-subtitle">How will you use Dorm2Door?</p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="role-picker">
          <div className={`role-option${role === 'consumer' ? ' selected' : ''}`}
            onClick={() => setRole('consumer')}>
            <div className="role-option-title">🛒 Consumer</div>
            <div className="role-option-desc">Book campus services</div>
          </div>
          <div className={`role-option${role === 'provider' ? ' selected' : ''}`}
            onClick={() => setRole('provider')}>
            <div className="role-option-title">🛠 Provider</div>
            <div className="role-option-desc">Offer services to students</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline-light" onClick={() => setStep(0)}>Back</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={handleSignUp} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
