import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Settings } from "lucide-react";
import { AppShell, NavItem } from "../../components/layout/AppShell";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { db } from "../../lib/db";
import { getSupabase } from "../../lib/supabase";
import { buildProjectBackup, downloadJson } from "../../lib/exportProject";
import { Button } from "../../components/ui/Button";
import { SelectField } from "../../components/ui/FormControls";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";

export function AccountSettingsPage() {
  const { userId, email, isLocalOnly, signOut } = useAuth();
  const { theme, setTheme, reducedMotion, setReducedMotion } = useTheme();
  const { show } = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function exportAllData() {
    if (!userId) return;
    const projects = await db.projects.where("userId").equals(userId).toArray();
    const backups = await Promise.all(projects.map((p) => buildProjectBackup(p.id)));
    downloadJson("inkwell-account-export.json", { exportedAt: new Date().toISOString(), projects: backups });
    show("Export ready — check your downloads.");
  }

  async function deleteAccount() {
    if (isLocalOnly) {
      await db.delete();
      window.location.href = "/";
      return;
    }
    // Cloud mode: account deletion must happen server-side (cascades through
    // every owned row via ON DELETE CASCADE, and removing an auth.users row
    // requires the service role) — see supabase/functions/account-delete.
    // That function must be deployed to the Supabase project for this to
    // succeed; see docs/OWNER_ACTIONS_REQUIRED.md.
    const supabase = getSupabase()!;
    const { error } = await supabase.functions.invoke("account-delete", { body: {} });
    if (error) {
      show(`Couldn't delete your account: ${error.message}`, "danger");
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <AppShell
      sidebar={
        <>
          <NavItem to="/dashboard" icon={<LayoutDashboard size={17} />} label="All Books" />
          <NavItem to="/settings/account" icon={<Settings size={17} />} label="Account" active />
        </>
      }
    >
      <div className="iw-page" style={{ maxWidth: 640 }}>
        <div className="iw-page-header">
          <div className="iw-page-title iw-display">Account</div>
        </div>

        <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Profile</div>
          <p className="iw-help-text">{isLocalOnly ? "Local-only mode — no account." : email}</p>
        </div>

        <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Preferences</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <SelectField label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">Follow system</option>
              <option value="dark">Dark — Writer's Den</option>
              <option value="light">Light</option>
            </SelectField>
            <SelectField label="Motion" value={reducedMotion ? "reduced" : "full"} onChange={(e) => setReducedMotion(e.target.value === "reduced")}>
              <option value="full">Full motion</option>
              <option value="reduced">Reduced motion</option>
            </SelectField>
          </div>
        </div>

        <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Security & data controls</div>
          <p className="iw-help-text" style={{ marginBottom: 12 }}>
            Export everything Inkwell has stored for your account as a single JSON file, any time.
          </p>
          <Button variant="secondary" onClick={exportAllData}>
            Export all my data
          </Button>
        </div>

        <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>AI & data use</div>
          <p className="iw-help-text">
            Inkwell never trains on your manuscripts unless you separately and explicitly opt in — see docs/PRIVACY_DATA_FLOW.md. No such opt-in
            exists yet in this build; there is nothing to turn on or off.
          </p>
        </div>

        {!isLocalOnly && (
          <Button variant="secondary" onClick={() => signOut().then(() => navigate("/login"))} style={{ marginBottom: 20 }}>
            Sign out
          </Button>
        )}

        <div className="iw-card" style={{ padding: 20, borderColor: "var(--color-danger)" }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--color-danger)" }}>Danger zone</div>
          <p className="iw-help-text" style={{ marginBottom: 12 }}>
            {isLocalOnly
              ? "Permanently erases everything stored in this browser. There is no recovery — export your data first."
              : "Requests permanent deletion of your account and every project you own."}
          </p>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteAccount}
        title="Delete your account?"
        description="This cannot be undone. Export your data first if you want to keep a copy."
        confirmLabel="Delete account"
        danger
      />
    </AppShell>
  );
}
