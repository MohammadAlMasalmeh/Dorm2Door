import { useState } from 'react'
import { supabase } from '../supabaseClient'

/** Figma asset — student services illustration (Create Account / onboarding) */
const AUTH_ONBOARDING_HERO =
  'https://www.figma.com/api/mcp/asset/5ff1b531-ce7f-42b1-b48e-c0c17e99fc5e'

function AuthBrand() {
  return <span className="auth-brand">DORM2DOOR</span>
}

function AuthSplitBrand() {
  return (
    <aside className="auth-split-brand">
      <p className="auth-split-logo">DORM2DOOR</p>
      <div className="auth-split-hero-wrap">
        <img src={AUTH_ONBOARDING_HERO} alt="" className="auth-split-hero" />
      </div>
      <p className="auth-split-tagline">Get services from other students</p>
    </aside>
  )
}

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('consumer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function reset(nextMode) {
    setError('')
    setStep(0)
    setMode(nextMode)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Invalid email or password.')
    }
    setLoading(false)
  }

  async function handleSignUp() {
    setError('')
    if (!email.endsWith('.edu')) {
      setError('Only .edu email addresses are allowed.')
      return
    }
    setLoading(true)
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName, role } },
    })
    setLoading(false)
    if (signErr) {
      setError(signErr.message)
      return
    }
    if (!data.session) setMode('confirm')
  }

  // ── Confirm email ─────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <div className="auth-split">
        <AuthSplitBrand />
        <div className="auth-split-panel">
          <div className="auth-split-inner auth-split-inner--center">
            <div className="auth-confirm-icon" aria-hidden>
              📧
            </div>
            <h2 className="auth-title-figma" style={{ marginBottom: 12 }}>
              Check your email
            </h2>
            <p className="auth-subtitle" style={{ marginBottom: 8, color: 'rgba(33,33,33,0.65)' }}>
              We sent a confirmation link to
            </p>
            <p className="auth-confirm-email">{email}</p>
            <p className="auth-subtitle" style={{ marginBottom: 28, color: 'rgba(33,33,33,0.65)' }}>
              Click the link to activate your account, then come back and sign in.
            </p>
            <button
              type="button"
              className="auth-btn-figma"
              style={{ maxWidth: '100%' }}
              onClick={() => reset('signin')}
            >
              Go to Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign in ──────────────────────────────────────────────────────────────
  if (mode === 'signin') {
    return (
      <div className="auth-split">
        <AuthSplitBrand />
        <div className="auth-split-panel">
          <div className="auth-split-inner">
            <h1 className="auth-title-figma auth-title-figma-left">Sign in</h1>

            {error && (
              <div className="auth-error-block" style={{ marginBottom: 20 }}>
                <span className="auth-error-text">{error}</span>
                <button type="button" className="auth-error-cta" onClick={() => reset('signup')}>
                  Create account?
                </button>
              </div>
            )}

            <form onSubmit={handleSignIn}>
              <div className="auth-input-row">
                <label className="auth-input-label-figma" htmlFor="signin-email">
                  Edu email
                </label>
                <input
                  id="signin-email"
                  className="auth-input-figma"
                  type="email"
                  autoComplete="email"
                  placeholder="ex. student@university.edu"
                  value={email}
                  onChange={e => {
                    setError('')
                    setEmail(e.target.value)
                  }}
                  required
                />
              </div>
              <div className="auth-input-row">
                <label className="auth-input-label-figma" htmlFor="signin-password">
                  Password
                </label>
                <div className="auth-password-wrap">
                  <input
                    id="signin-password"
                    className="auth-input-figma"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={e => {
                      setError('')
                      setPassword(e.target.value)
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button className="auth-btn-figma" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="auth-footer-links">
              <span>Don&apos;t have an account?</span>
              <button type="button" onClick={() => reset('signup')}>
                Create account
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign up — step 0 ─────────────────────────────────────────────────────
  if (mode === 'signup' && step === 0) {
    return (
      <div className="auth-split">
        <AuthSplitBrand />
        <div className="auth-split-panel">
          <div className="auth-split-inner">
            <h2 className="auth-title-figma">Create account</h2>

            {error && <div className="alert-error">{error}</div>}

            <form
              onSubmit={e => {
                e.preventDefault()
                setError('')
                if (!email.trim()) {
                  setError('Please enter your email.')
                  return
                }
                if (!email.endsWith('.edu')) {
                  setError('Only .edu emails are allowed.')
                  return
                }
                if (!displayName.trim()) {
                  setError('Please enter your name.')
                  return
                }
                if (password.length < 8) {
                  setError('Password must be at least 8 characters.')
                  return
                }
                setStep(1)
              }}
            >
              <div className="auth-input-row">
                <label className="auth-input-label-figma" htmlFor="signup-name">
                  Full name
                </label>
                <input
                  id="signup-name"
                  className="auth-input-figma"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Johnson"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="auth-input-row">
                <label className="auth-input-label-figma" htmlFor="signup-email">
                  Edu email
                </label>
                <input
                  id="signup-email"
                  className="auth-input-figma"
                  type="email"
                  autoComplete="email"
                  placeholder="ex. student@university.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="auth-input-row">
                <label className="auth-input-label-figma" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-password-wrap">
                  <input
                    id="signup-password"
                    className="auth-input-figma"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <p className="auth-terms">By signing up you agree to our Terms of Service and Privacy Policy.</p>
              <button type="submit" className="auth-btn-figma">
                Continue
              </button>
            </form>

            <div className="auth-footer-links">
              <span>Already have an account?</span>
              <button type="button" onClick={() => reset('signin')}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign up — step 1: role ───────────────────────────────────────────────
  return (
    <div className="auth-split">
      <AuthSplitBrand />
      <div className="auth-split-panel auth-split-panel--wide">
        <div className="auth-container auth-container--embed">
          <div className="auth-card" style={{ background: 'transparent', border: 'none', boxShadow: 'none', maxWidth: 440 }}>
            <div className="auth-card-inner" style={{ maxWidth: '100%' }}>
              <AuthBrand />
              <h2 className="auth-title" style={{ marginBottom: 4 }}>
                How will you use Dorm2Door?
              </h2>
              <p className="auth-subtitle" style={{ marginBottom: 24 }}>
                Choose one to continue
              </p>

              {error && <div className="alert-error">{error}</div>}

              <div className="role-picker">
                <button
                  type="button"
                  className={`role-option${role === 'consumer' ? ' selected' : ''}`}
                  onClick={() => setRole('consumer')}
                >
                  <div className="role-option-title">Consumer</div>
                  <div className="role-option-desc">Book campus services from other students</div>
                </button>
                <button
                  type="button"
                  className={`role-option${role === 'provider' ? ' selected' : ''}`}
                  onClick={() => setRole('provider')}
                >
                  <div className="role-option-title">Provider</div>
                  <div className="role-option-desc">Offer your services to students</div>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-outline-light" onClick={() => setStep(0)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleSignUp}
                  disabled={loading}
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
