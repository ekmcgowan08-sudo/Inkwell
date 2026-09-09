# Inkwell — Store Submission Checklist

Planning document. Nothing on this list has been submitted anywhere — see `docs/OWNER_ACTIONS_REQUIRED.md` for
the accounts/credentials needed before any of it is possible.

## Apple App Store (iOS/iPadOS)

- [ ] Apple Developer Program membership active.
- [ ] App Store Connect listing created, bundle id `studio.inkwell.app` matching `apps/mobile/app.json`.
- [ ] App icons at every required size (currently placeholder — see `docs/OWNER_ACTIONS_REQUIRED.md` #5),
      screenshots for each required device size, an app preview video (optional).
- [ ] App Privacy questionnaire completed accurately against `docs/PRIVACY_DATA_FLOW.md` — do this only after
      that document reflects whatever integrations are actually live at submission time, not this document's
      snapshot.
- [ ] Age rating questionnaire.
- [ ] Export compliance: `usesNonExemptEncryption: false` is already set in `app.json` on the assumption that
      only standard HTTPS/TLS is used (true today) — revisit if that changes.
- [ ] TestFlight internal testing pass before public submission.
- [ ] `eas submit --platform ios` once `eas.json`'s submit block has real Apple identifiers.

## Google Play (Android)

- [ ] Google Play Console account, app created, package `studio.inkwell.app` matching `app.json`.
- [ ] Data Safety form completed against `docs/PRIVACY_DATA_FLOW.md`.
- [ ] Content rating questionnaire.
- [ ] Store listing assets (icon, feature graphic, screenshots).
- [ ] Internal testing track pass before production rollout.
- [ ] `eas submit --platform android` once `eas.json`'s service-account key path points to a real key.

## Mac App Store (optional — direct-download `.dmg` is the alternative)

- [ ] Decide Mac App Store vs. direct-download-only vs. both — this affects sandboxing requirements (MAS apps
      run sandboxed, which constrains file-system access patterns; the direct-download build doesn't need
      this).
- [ ] If MAS: separate provisioning profile and entitlements from the direct-download build.

## Windows

- [ ] No storefront requirement to ship (direct `.msi`/NSIS download works standalone) unless targeting the
      Microsoft Store, which has its own separate packaging (MSIX) and certification process — not configured
      in this pass.
- [ ] Code-signing certificate applied (see `docs/OWNER_ACTIONS_REQUIRED.md` #4) before any public
      distribution, to avoid SmartScreen warnings.

## Pre-submission engineering checklist (applies to every platform)

- [ ] Replace every placeholder icon (`apps/desktop/src-tauri/icons/`, `apps/mobile/assets/`) with real
      branded assets.
- [ ] Confirm `docs/PRIVACY_DATA_FLOW.md` is current for whatever's actually deployed.
- [ ] Confirm legal documents in `docs/legal/` have been through real legal review (see
      `docs/LEGAL_REVIEW_CHECKLIST.md`) and are hosted somewhere store listings can link to.
- [ ] Run the full test suite (`docs/TESTING.md`) against the exact build being submitted.
- [ ] Verify crash reporting (once configured) excludes manuscript text — see `docs/PRIVACY_DATA_FLOW.md`.
