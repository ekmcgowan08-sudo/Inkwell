import { useState, type FormEvent, type ReactNode } from "react";
import { Feather } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/FormControls";
import "../../styles/auth.css";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="iw-auth-page">
      <div className="iw-card iw-auth-card">
        <div className="iw-auth-brand iw-display">
          <Feather size={22} color="var(--color-accent)" /> Inkwell
        </div>
        <h1 className="iw-display" style={{ textAlign: "center", margin: 0, fontSize: "1.375rem" }}>
          {title}
        </h1>
        {subtitle && <p className="iw-auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, isLocalOnly, userId } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLocalOnly && userId) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
    else navigate("/dashboard");
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your writing studio">
      {isLocalOnly && (
        <p className="iw-auth-banner">
          No backend is configured for this build — running in local-only mode. Your work stays in this browser only.
        </p>
      )}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLocalOnly} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLocalOnly}
        />
        {error && <p className="iw-field-error" role="alert">{error}</p>}
        <Button type="submit" disabled={loading || isLocalOnly}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="iw-auth-footer">
        <Link to="/forgot-password">Forgot password?</Link> · <Link to="/signup">Create an account</Link>
      </div>
    </AuthShell>
  );
}

export function SignupPage() {
  const { signUp, isLocalOnly, userId } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentVerification, setSentVerification] = useState(false);

  if (isLocalOnly && userId) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error, needsEmailVerification } = await signUp(email, password);
    setLoading(false);
    if (error) setError(error);
    else if (needsEmailVerification) setSentVerification(true);
    else navigate("/legal/accept", { state: { from: "/onboarding" } });
  }

  if (sentVerification) {
    return (
      <AuthShell title="Check your inbox">
        <p>We sent a verification link to <strong>{email}</strong>. Click it to finish creating your account.</p>
        <Link to="/login">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Your manuscripts, story bible, and AI memory in one place">
      {isLocalOnly && (
        <p className="iw-auth-banner">
          No backend is configured for this build — running in local-only mode, single device, no account needed.
        </p>
      )}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLocalOnly} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
          disabled={isLocalOnly}
        />
        {error && <p className="iw-field-error" role="alert">{error}</p>}
        <p className="iw-help-text">
          You'll be asked to review and agree to Inkwell's Terms of Service and Privacy Policy (drafts in{" "}
          <code>docs/legal/</code>, pending professional review) on the next screen.
        </p>
        <Button type="submit" disabled={loading || isLocalOnly}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <div className="iw-auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset, isLocalOnly } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await requestPasswordReset(email);
    if (error) setError(error);
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Check your inbox">
        <p>If an account exists for {email}, we've sent a password reset link.</p>
        <Link to="/login">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password">
      {isLocalOnly && <p className="iw-auth-banner">Not available in local-only mode — there's no account to reset.</p>}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLocalOnly} />
        {error && <p className="iw-field-error" role="alert">{error}</p>}
        <Button type="submit" disabled={isLocalOnly}>
          Send reset link
        </Button>
      </form>
      <div className="iw-auth-footer">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await updatePassword(password);
    if (error) setError(error);
    else {
      setDone(true);
      setTimeout(() => navigate("/dashboard"), 1500);
    }
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="New password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="iw-field-error" role="alert">{error}</p>}
        {done && <p role="status">Password updated. Redirecting…</p>}
        <Button type="submit">Update password</Button>
      </form>
    </AuthShell>
  );
}
