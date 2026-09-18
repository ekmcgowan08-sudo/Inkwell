import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { hasAcceptedLegalTerms } from "./lib/repos/profiles";
import { registerCloseGuard, registerMenuBridge } from "./lib/desktopBridge";
import { getSyncStatus } from "./lib/sync";
import { Spinner } from "./components/ui/Feedback";
import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage } from "./features/auth/AuthPages";
import { OnboardingPage } from "./features/auth/OnboardingPage";
import { LegalAcceptancePage } from "./features/auth/LegalAcceptancePage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { AccountSettingsPage } from "./features/settings/AccountSettingsPage";
import { ProjectLayout } from "./features/project/ProjectLayout";
import { ManuscriptPage } from "./features/manuscript/ManuscriptPage";
import { StoryBiblePage } from "./features/storyBible/StoryBiblePage";
import { StoryboardPage } from "./features/storyboard/StoryboardPage";
import { TimelineGoalsPage } from "./features/timeline/TimelineGoalsPage";
import { AIAssistantPage } from "./features/ai/AIAssistantPage";
import { FindingsPage } from "./features/ai/FindingsPage";
import { ExportsPage } from "./features/project/ExportsPage";
import { VersionsPage } from "./features/project/VersionsPage";
import { BookSettingsPage } from "./features/project/BookSettingsPage";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { userId, loading, isLocalOnly } = useAuth();
  const location = useLocation();
  const [checkingLegal, setCheckingLegal] = useState(!isLocalOnly);
  const [needsLegalAcceptance, setNeedsLegalAcceptance] = useState(false);

  useEffect(() => {
    if (!userId || isLocalOnly) {
      setCheckingLegal(false);
      return;
    }
    setCheckingLegal(true);
    hasAcceptedLegalTerms(userId).then((accepted) => {
      setNeedsLegalAcceptance(!accepted);
      setCheckingLegal(false);
    });
  }, [userId, isLocalOnly]);

  if (loading || checkingLegal) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }
  if (!userId) return <Navigate to="/login" replace />;
  if (needsLegalAcceptance) return <Navigate to="/legal/accept" state={{ from: location.pathname }} replace />;
  return children;
}

function useDesktopIntegration() {
  const navigate = useNavigate();
  useEffect(() => {
    const unlistenClose = registerCloseGuard(() => {
      // Best-effort "is it safe to close" signal: a non-empty retry queue
      // means a write hasn't reached the server yet.
      return getSyncStatus() === "syncing" || getSyncStatus() === "error" || getSyncStatus() === "conflict";
    });
    const unlistenMenu = registerMenuBridge();

    function onMenuAction(e: Event) {
      const action = (e as CustomEvent<string>).detail;
      if (action === "new_book") {
        navigate("/dashboard");
        window.dispatchEvent(new CustomEvent("inkwell-open-new-book"));
      } else if (action === "import") {
        navigate("/dashboard");
        window.dispatchEvent(new CustomEvent("inkwell-open-import"));
      } else {
        // focus_mode, find, command_palette: forwarded as-is for whichever
        // page cares (ManuscriptPage listens for focus_mode/find today).
        window.dispatchEvent(new CustomEvent("inkwell-menu-action-forwarded", { detail: action }));
      }
    }
    window.addEventListener("inkwell-menu-action", onMenuAction);

    return () => {
      unlistenClose.then((fn) => fn());
      unlistenMenu.then((fn) => fn());
      window.removeEventListener("inkwell-menu-action", onMenuAction);
    };
  }, [navigate]);
}

export function App() {
  useDesktopIntegration();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/legal/accept" element={<LegalAcceptancePage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/account"
        element={
          <RequireAuth>
            <AccountSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/project/:projectId"
        element={
          <RequireAuth>
            <ProjectLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="manuscript" replace />} />
        <Route path="manuscript" element={<ManuscriptPage />} />
        <Route path="manuscript/:chapterId" element={<ManuscriptPage />} />
        <Route path="story-bible" element={<StoryBiblePage />} />
        <Route path="story-bible/:entryId" element={<StoryBiblePage />} />
        <Route path="storyboard" element={<StoryboardPage />} />
        <Route path="timeline" element={<TimelineGoalsPage />} />
        <Route path="ai" element={<AIAssistantPage />} />
        <Route path="findings" element={<FindingsPage />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="settings" element={<BookSettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
