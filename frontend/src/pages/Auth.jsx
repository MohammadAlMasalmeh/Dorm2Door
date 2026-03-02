import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [mode, setMode] = useState('signin') // signin | signup | confirm (sign in is first page)
  const [step, setStep] = useState(0)        // 0=credentials, 1=role
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
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Invalid email or password.')
    }
    setLoading(false)
  }

  async function handleSignUp(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
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
    if (!data.session) setMode('confirm')
  }

  const AuthBrand = () => <span className="auth-brand">DORM2DOOR</span>

  // ── Confirm email ─────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <AuthBrand />
          <div className="auth-confirm-icon" aria-hidden>📧</div>
          <h2 className="auth-title">Check your email</h2>
          <p className="auth-subtitle" style={{ marginBottom: 8 }}>
            We sent a confirmation link to
          </p>
          <p className="auth-confirm-email">{email}</p>
          <p className="auth-subtitle" style={{ marginBottom: 28 }}>
            Click the link to activate your account, then come back and sign in.
          </p>
          <button className="btn btn-primary btn-full" onClick={() => reset('signin')}>
            Go to Sign in
          </button>
        </div>
      </div>
    )
  }

  // ── Sign in (first page) ──────────────────────────────────────────────────
  if (mode === 'signin') {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-centered auth-card-sleek">
          <div className="auth-card-inner">
            <AuthBrand />
            <h1 className="auth-headline">Sign in</h1>

            {error && (
              <div className="auth-error-block">
                <span className="auth-error-text">{error}</span>
                <button type="button" className="auth-error-cta" onClick={() => reset('signup')}>
                  Create account?
                </button>
              </div>
            )}

            <form onSubmit={handleSignIn}>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signin-email">.edu email</label>
                <input
                  id="signin-email"
                  className="auth-input"
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={e => { setError(''); setEmail(e.target.value); }}
                  required
                />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signin-password">Password</label>
                <input
                  id="signin-password"
                  className="auth-input"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => { setError(''); setPassword(e.target.value); }}
                  required
                />
              </div>
              <button className="auth-btn-primary" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="auth-switch">
              Don&apos;t have an account? <button type="button" onClick={() => reset('signup')}>Create account</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign up — step 0 ───────────────────────────────────────────────────────
  if (mode === 'signup' && step === 0) {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-centered">
          <div className="auth-card-inner">
            <AuthBrand />
            <h2 className="auth-title auth-title-signin">Create account</h2>
            <p className="auth-subtitle auth-subtitle-signin">Use your .edu email to join</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={e => {
              e.preventDefault()
              setError('')
              if (!email.trim()) { setError('Please enter your email.'); return }
              if (!email.endsWith('.edu')) { setError('Only .edu emails are allowed.'); return }
              if (!displayName.trim()) { setError('Please enter your name.'); return }
              if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
              setStep(1)
            }}>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-name">Full name</label>
                <input
                  id="signup-name"
                  className="auth-input"
                  type="text"
                  placeholder="Alex Johnson"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-email">.edu email</label>
                <input
                  id="signup-email"
                  className="auth-input"
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="auth-input-wrap">
                <label className="auth-input-label" htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  className="auth-input"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                />
              </div>
              <p className="auth-terms">By signing up you agree to our Terms of Service and Privacy Policy.</p>
              <button type="submit" className="auth-btn-primary">
                Continue
              </button>
            </form>

            <div className="auth-switch">
              Already have an account? <button type="button" onClick={() => reset('signin')}>Sign in</button>
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
        <div className="auth-card-inner" style={{ maxWidth: '100%' }}>
          <AuthBrand />
          <h2 className="auth-title" style={{ marginBottom: 4 }}>How will you use Dorm2Door?</h2>
          <p className="auth-subtitle" style={{ marginBottom: 24 }}>Choose one to continue</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="role-picker">
            <button
              type="button"
              className={`role-option${role === 'consumer' ? ' selected' : ''}`}
              onClick={() => setRole('consumer')}
            >
              <div className="role-option-title">🛒 Consumer</div>
              <div className="role-option-desc">Book campus services from other students</div>
            </button>
            <button
              type="button"
              className={`role-option${role === 'provider' ? ' selected' : ''}`}
              onClick={() => setRole('provider')}
            >
              <div className="role-option-title">🛠 Provider</div>
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
  )
}
