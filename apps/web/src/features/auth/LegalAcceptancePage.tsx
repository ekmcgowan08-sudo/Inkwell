import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { acceptLegalTerms } from "../../lib/repos/profiles";
import { Button } from "../../components/ui/Button";
import "../../styles/auth.css";
import termsOfService from "../../../../../docs/legal/TERMS_OF_SERVICE.md?raw";
import privacyPolicy from "../../../../../docs/legal/PRIVACY_POLICY.md?raw";

function DocumentPane({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <pre
        tabIndex={0}
        style={{
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "var(--font-ui)",
          fontSize: "0.8125rem",
          lineHeight: 1.5,
          background: "var(--color-bg-sunken)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: 12,
          margin: 0,
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export function LegalAcceptancePage() {
  const { userId, isLocalOnly, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!userId || isLocalOnly) return <Navigate to="/dashboard" replace />;

  const next = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  async function continueToApp() {
    setBusy(true);
    await acceptLegalTerms(userId!);
    navigate(next, { replace: true });
  }

  return (
    <div className="iw-auth-page">
      <div className="iw-card" style={{ maxWidth: 640, width: "100%", padding: 40 }}>
        <h1 className="iw-display" style={{ marginTop: 0 }}>
          Before you continue
        </h1>
        <p style={{ color: "var(--color-text-secondary)" }}>
          Please review these documents. They're drafts pending professional legal review — see{" "}
          <code>docs/legal/</code> for the full set — but we still want you to actually read them before agreeing.
        </p>
        <DocumentPane title="Terms of Service" text={termsOfService} />
        <DocumentPane title="Privacy Policy" text={privacyPolicy} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.875rem" }}>
            <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} style={{ marginTop: 2 }} />
            I have read and agree to the Terms of Service.
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.875rem" }}>
            <input type="checkbox" checked={privacyChecked} onChange={(e) => setPrivacyChecked(e.target.checked)} style={{ marginTop: 2 }} />
            I have read and agree to the Privacy Policy.
          </label>
        </div>
        <Button onClick={continueToApp} disabled={!termsChecked || !privacyChecked || busy}>
          {busy ? "Saving…" : "Agree and continue"}
        </Button>
      </div>
    </div>
  );
}
