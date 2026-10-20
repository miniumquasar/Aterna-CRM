# Recovered files: status of each one

`project/` holds 151 complete files, 47 possibly outdated and 30 known only by their later edits. `early-bundles/` and `bundle-notes/` are complete copies of what Claude wrote at the time.

- **Complete**: rebuilt exactly from Claude's own writes and edits, and nothing later in the conversation contradicts it. "Checked lines" counts the lines that later command output (grep / wc) confirmed.
- **Possibly outdated**: rebuilt the same way, but the conversation shows it changed afterwards in a way that can't be replayed, (a missing message, a step that ran on a file never shown, or output that disagrees). Treat it as a near-final draft.
- **Missing (edits only)**: the file existed in your project, but its contents never appeared in the conversation. Only Claude's later edits to it are known; they are in `edits-without-base/` so they can be applied to your own copy.

| File | Status | Lines | Checked lines | Why (first reason) |
| --- | --- | --- | --- | --- |
| `project/.github/workflows/build.yml` | Complete | 114 |  |  |
| `project/build/entitlements.mac.plist` | Complete | 14 |  |  |
| `project/build/installer.nsh` | Complete | 73 |  |  |
| `project/docs/ACCESSIBILITY.md` | Complete | 56 |  |  |
| `project/docs/ACTIVITY.md` | Complete | 175 |  |  |
| `project/docs/ASSISTANT.md` | Complete | 67 |  |  |
| `project/docs/BACKUPS.md` | Complete | 125 |  |  |
| `project/docs/EMAIL.md` | Complete | 112 | 2 |  |
| `project/docs/FORECAST.md` | Complete | 77 |  |  |
| `project/docs/INSTALLING.md` | Complete | 78 |  |  |
| `project/docs/LICENSING.md` | Complete | 110 |  |  |
| `project/docs/RELEASING.md` | Complete | 84 |  |  |
| `project/docs/SECURITY.md` | Complete | 99 |  |  |
| `project/electron-builder.yml` | Complete | 113 |  |  |
| `project/scripts/asar-tamper-check.mjs` | Complete | 136 |  |  |
| `project/scripts/checksums.mjs` | Complete | 44 |  |  |
| `project/scripts/make-icons.py` | Complete | 183 |  |  |
| `project/src/main/app-menu.ts` | Complete | 21 |  |  |
| `project/src/main/backup/create.ts` | Complete | 305 | 4 |  |
| `project/src/main/backup/crypto.ts` | Complete | 224 | 2 |  |
| `project/src/main/backup/file.ts` | Complete | 242 | 2 |  |
| `project/src/main/backup/keys.ts` | Complete | 28 | 2 |  |
| `project/src/main/backup/maintain.ts` | Complete | 137 | 2 |  |
| `project/src/main/backup/restore.ts` | Complete | 555 | 3 |  |
| `project/src/main/backup/schedule.ts` | Complete | 124 | 7 |  |
| `project/src/main/backup/service.ts` | Complete | 454 | 6 |  |
| `project/src/main/backup/store.ts` | Complete | 163 | 2 |  |
| `project/src/main/db/migrations/0016_email_backups.ts` | Complete | 53 | 1 |  |
| `project/src/main/db/migrations/0019_activity.ts` | Complete | 88 |  |  |
| `project/src/main/db/migrations/0020_audit_seals.ts` | Complete | 35 |  |  |
| `project/src/main/db/migrations/0021_no_longer_clients.ts` | Complete | 40 |  |  |
| `project/src/main/email/message.ts` | Complete | 82 | 5 |  |
| `project/src/main/email/microsoft.ts` | Complete | 277 | 2 |  |
| `project/src/main/email/service.ts` | Complete | 437 | 4 |  |
| `project/src/main/email/transports.ts` | Complete | 116 | 1 |  |
| `project/src/main/ipc/ar.ts` | Complete | 32 | 1 |  |
| `project/src/main/ipc/backup.ts` | Complete | 344 | 16 |  |
| `project/src/main/ipc/documents.ts` | Complete | 89 | 2 |  |
| `project/src/main/ipc/email.ts` | Complete | 109 | 3 |  |
| `project/src/main/ipc/oracle.ts` | Complete | 13 |  |  |
| `project/src/main/ipc/pulse.ts` | Complete | 96 | 1 |  |
| `project/src/main/ipc/session.ts` | Complete | 69 | 5 |  |
| `project/src/main/ipc/setup.ts` | Complete | 105 | 1 |  |
| `project/src/main/licence/engine.ts` | Complete | 141 | 11 |  |
| `project/src/main/licence/format.ts` | Complete | 284 | 1 |  |
| `project/src/main/licence/public-keys.ts` | Complete | 18 | 1 |  |
| `project/src/main/licence/service.ts` | Complete | 299 | 19 |  |
| `project/src/main/menu-template.ts` | Complete | 96 |  |  |
| `project/src/main/records/assignment.ts` | Complete | 139 | 16 |  |
| `project/src/main/records/audit-seal.ts` | Complete | 128 | 7 |  |
| `project/src/main/records/ch-watch.ts` | Complete | 511 | 12 |  |
| `project/src/main/records/client-registers.ts` | Complete | 602 | 5 |  |
| `project/src/main/records/common.ts` | Complete | 116 | 2 |  |
| `project/src/main/records/communications.ts` | Complete | 80 | 3 |  |
| `project/src/main/records/current.ts` | Complete | 12 |  |  |
| `project/src/main/records/documents.ts` | Complete | 130 | 4 |  |
| `project/src/main/records/firm.ts` | Complete | 74 |  |  |
| `project/src/main/records/practice-report.ts` | Complete | 201 | 12 |  |
| `project/src/main/records/pulse.ts` | Complete | 183 | 3 |  |
| `project/src/main/records/receivables.ts` | Complete | 271 | 4 |  |
| `project/src/main/records/risk.ts` | Complete | 228 | 8 |  |
| `project/src/main/records/templates.ts` | Complete | 118 | 2 |  |
| `project/src/main/security/vault-sheet.ts` | Complete | 61 |  |  |
| `project/src/main/services/audit-sealer.ts` | Complete | 39 |  |  |
| `project/src/main/services/ch-watch.ts` | Complete | 380 | 2 |  |
| `project/src/main/services/notifier.ts` | Complete | 130 |  |  |
| `project/src/main/setup/service.ts` | Complete | 143 | 1 |  |
| `project/src/main/startup/documents-folder.ts` | Complete | 87 | 1 |  |
| `project/src/main/system/local-ai.ts` | Complete | 287 |  |  |
| `project/src/main/system/tool-call.ts` | Complete | 71 |  |  |
| `project/src/renderer/src/aether-theme/primitives/GlassModal.tsx` | Complete | 35 |  |  |
| `project/src/renderer/src/components/assistant/AssistantPanels.tsx` | Complete | 190 |  |  |
| `project/src/renderer/src/components/assistant/ai-status.ts` | Complete | 98 |  |  |
| `project/src/renderer/src/components/charts/Charts.tsx` | Complete | 260 |  |  |
| `project/src/renderer/src/components/charts/scale.ts` | Complete | 89 |  |  |
| `project/src/renderer/src/components/clients/ClientQuickAddModal.tsx` | Complete | 97 | 2 |  |
| `project/src/renderer/src/components/clients/glass-fields.tsx` | Complete | 100 |  |  |
| `project/src/renderer/src/components/forms/reference-note.ts` | Complete | 21 |  |  |
| `project/src/renderer/src/components/layout/ScreenTabs.tsx` | Complete | 93 | 1 |  |
| `project/src/renderer/src/components/navigation/GoToPalette.tsx` | Complete | 166 | 4 |  |
| `project/src/renderer/src/components/notifications/NotificationBell.tsx` | Complete | 191 | 2 |  |
| `project/src/renderer/src/components/notifications/Toasts.tsx` | Complete | 87 | 1 |  |
| `project/src/renderer/src/components/ui/Confirm.tsx` | Complete | 99 |  |  |
| `project/src/renderer/src/components/ui/LoadState.tsx` | Complete | 33 |  |  |
| `project/src/renderer/src/hooks/useLicence.ts` | Complete | 68 | 1 |  |
| `project/src/renderer/src/index.css` | Complete | 97 | 2 |  |
| `project/src/renderer/src/lib/motion.ts` | Complete | 38 |  |  |
| `project/src/renderer/src/lib/open-client.ts` | Complete | 18 |  |  |
| `project/src/renderer/src/lib/paste-cells.ts` | Complete | 54 |  |  |
| `project/src/renderer/src/navigation/search.ts` | Complete | 73 |  |  |
| `project/src/renderer/src/screens/crm/About.tsx` | Complete | 326 | 3 |  |
| `project/src/renderer/src/screens/crm/AuditLog.tsx` | Complete | 279 | 3 |  |
| `project/src/renderer/src/screens/crm/Calendar.tsx` | Complete | 267 |  |  |
| `project/src/renderer/src/screens/crm/ClientFile.tsx` | Complete | 268 | 2 |  |
| `project/src/renderer/src/screens/crm/Notifications.tsx` | Complete | 197 | 2 |  |
| `project/src/renderer/src/screens/crm/Reports.tsx` | Complete | 211 | 3 |  |
| `project/src/renderer/src/screens/crm/Sentinel.tsx` | Complete | 306 | 5 |  |
| `project/src/renderer/src/screens/crm/Tasks.tsx` | Complete | 318 |  |  |
| `project/src/renderer/src/screens/crm/data/target.ts` | Complete | 43 |  |  |
| `project/src/renderer/src/screens/crm/help/guides.ts` | Complete | 153 | 1 |  |
| `project/src/renderer/src/screens/crm/help/support.ts` | Complete | 52 |  |  |
| `project/src/renderer/src/stores/ui.ts` | Complete | 100 | 5 |  |
| `project/src/shared/audit-words.ts` | Complete | 11 |  |  |
| `project/src/shared/client-status.ts` | Complete | 50 |  |  |
| `project/src/shared/csv.ts` | Complete | 19 |  |  |
| `project/src/shared/product.ts` | Complete | 15 |  |  |
| `project/tailwind.config.ts` | Complete | 74 | 1 |  |
| `project/tests/backup/backup.test.ts` | Complete | 379 |  |  |
| `project/tests/backup/helpers.ts` | Complete | 58 |  |  |
| `project/tests/backup/schedule.test.ts` | Complete | 140 |  |  |
| `project/tests/db/migration-0015.test.ts` | Complete | 160 | 2 |  |
| `project/tests/email/email.test.ts` | Complete | 323 |  |  |
| `project/tests/email/test-cert.ts` | Complete | 54 |  |  |
| `project/tests/foundation/local-ai.test.ts` | Complete | 252 |  |  |
| `project/tests/licence/engine.test.ts` | Complete | 61 |  |  |
| `project/tests/licence/format.test.ts` | Complete | 101 |  |  |
| `project/tests/licence/generator.test.ts` | Complete | 94 |  |  |
| `project/tests/licence/store.test.ts` | Complete | 62 |  |  |
| `project/tests/packaging/config.test.ts` | Complete | 80 |  |  |
| `project/tests/packaging/release.test.ts` | Complete | 237 |  |  |
| `project/tests/records/ai-context.test.ts` | Complete | 52 |  |  |
| `project/tests/records/audit-seal.test.ts` | Complete | 153 |  |  |
| `project/tests/records/ch-watch.test.ts` | Complete | 195 |  |  |
| `project/tests/records/client-registers.test.ts` | Complete | 312 |  |  |
| `project/tests/records/clients.test.ts` | Complete | 184 | 3 |  |
| `project/tests/records/documents-folder.test.ts` | Complete | 62 |  |  |
| `project/tests/records/forecast-workbook.test.ts` | Complete | 63 | 2 |  |
| `project/tests/records/forecast.test.ts` | Complete | 248 |  |  |
| `project/tests/records/helpers.ts` | Complete | 35 |  |  |
| `project/tests/records/no-longer-clients.test.ts` | Complete | 52 |  |  |
| `project/tests/records/notifications.test.ts` | Complete | 262 |  |  |
| `project/tests/records/pulse.test.ts` | Complete | 78 |  |  |
| `project/tests/records/receivables.test.ts` | Complete | 150 |  |  |
| `project/tests/records/registers-workbook.test.ts` | Complete | 75 |  |  |
| `project/tests/records/risk.test.ts` | Complete | 105 |  |  |
| `project/tests/records/security.test.ts` | Complete | 245 |  |  |
| `project/tests/records/work.test.ts` | Complete | 75 |  |  |
| `project/tests/references/vault-passphrase.test.ts` | Complete | 101 |  |  |
| `project/tests/renderer/activity.test.ts` | Complete | 115 |  |  |
| `project/tests/renderer/client-file.test.ts` | Complete | 75 |  |  |
| `project/tests/renderer/client-standing.test.ts` | Complete | 43 |  |  |
| `project/tests/renderer/consistency.test.ts` | Complete | 111 | 2 |  |
| `project/tests/renderer/help.test.ts` | Complete | 71 |  |  |
| `project/tests/renderer/oracle.test.ts` | Complete | 219 |  |  |
| `project/tests/services/ch-watch-service.test.ts` | Complete | 226 |  |  |
| `project/tests/services/notifier.test.ts` | Complete | 109 |  |  |
| `project/tests/setup/setup.test.ts` | Complete | 176 |  |  |
| `project/tests/shared/money.test.ts` | Complete | 84 |  |  |
| `project/tools/licence-generator/cli.ts` | Complete | 486 |  |  |
| `project/tools/licence-generator/issue.ts` | Complete | 34 |  |  |
| `project/tools/licence-generator/register.ts` | Complete | 140 |  |  |
| `project/docs/GETTING-STARTED.md` | Possibly outdated | 96 |  | an Edit did not match |
| `project/src/main/ipc/ai-chat.ts` | Possibly outdated | 323 | 1 | python script not replayed: error:TypeError |
| `project/src/main/ipc/clients.ts` | Possibly outdated | 81 | 12 | python script not replayed: abort |
| `project/src/main/ipc/compliance.ts` | Possibly outdated | 70 | 2 | python script not replayed: abort |
| `project/src/main/ipc/fortress.ts` | Possibly outdated | 149 |  | transcript shows different content: 152 src/main/ipc/fortress.ts |
| `project/src/main/ipc/reports.ts` | Possibly outdated | 59 | 1 | transcript shows different content: 58 src/main/ipc/reports.ts |
| `project/src/main/records/ai-context.ts` | Possibly outdated | 129 |  | transcript shows different content: 184 src/main/records/ai-context.ts |
| `project/src/main/records/clients.ts` | Possibly outdated | 358 | 4 | python script not replayed: error:TypeError |
| `project/src/main/records/dashboard.ts` | Possibly outdated | 85 | 3 | python script not replayed: abort |
| `project/src/main/records/forecast.ts` | Possibly outdated | 326 | 6 | transcript shows different content: src/main/records/forecast.ts:113:  const deadlines = o |
| `project/src/main/records/notifications.ts` | Possibly outdated | 457 | 2 | transcript shows different content: 478 src/main/records/notifications.ts |
| `project/src/main/records/reference-flags.ts` | Possibly outdated | 162 |  | python script not replayed: abort |
| `project/src/main/records/security.ts` | Possibly outdated | 408 | 2 | transcript shows different content: 413 src/main/records/security.ts |
| `project/src/main/records/work.ts` | Possibly outdated | 199 | 4 | transcript shows different content: src/main/records/work.ts:158:  tidyFlag(c, 'followup_d |
| `project/src/renderer/src/App.tsx` | Possibly outdated | 365 | 1 | python script not replayed: abort |
| `project/src/renderer/src/aether-theme/layout/AetherSidebar.tsx` | Possibly outdated | 174 |  | transcript shows different content: src/renderer/src/aether-theme/layout/AetherSidebar.tsx |
| `project/src/renderer/src/aether-theme/layout/AetherTitleBar.tsx` | Possibly outdated | 71 |  | python script not replayed: abort |
| `project/src/renderer/src/components/backup/RestorePanel.tsx` | Possibly outdated | 216 | 1 | transcript shows different content: 26 ./components/backup/RestorePanel.tsx |
| `project/src/renderer/src/components/clients/ClientEditModal.tsx` | Possibly outdated | 196 |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/components/email/useEmailSender.tsx` | Possibly outdated | 154 | 2 | transcript shows different content: 11 ./components/email/useEmailSender.tsx |
| `project/src/renderer/src/components/forms/client-status.ts` | Possibly outdated | 43 | 1 | python script not replayed: abort |
| `project/src/renderer/src/components/notifications/NotificationItem.tsx` | Possibly outdated | 85 | 1 | python script not replayed: error:TypeError |
| `project/src/renderer/src/lib/placeholders.ts` | Possibly outdated | 67 | 1 | transcript shows different content: 3 src/renderer/src/lib/placeholders.ts |
| `project/src/renderer/src/lib/session.ts` | Possibly outdated | 28 |  | transcript shows different content: src/renderer/src/lib/session.ts:24:    window.location |
| `project/src/renderer/src/lib/targets.ts` | Possibly outdated | 42 |  | transcript shows different content: 41 src/renderer/src/lib/targets.ts |
| `project/src/renderer/src/navigation/nav.ts` | Possibly outdated | 190 |  | python script not replayed: abort |
| `project/src/renderer/src/navigation/routes.ts` | Possibly outdated | 16 | 1 | python script not replayed: abort |
| `project/src/renderer/src/screens/Home.tsx` | Possibly outdated | 245 |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/Fortress.tsx` | Possibly outdated | 595 |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/Import.tsx` | Possibly outdated | 383 | 1 | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/Oracle.tsx` | Possibly outdated | 380 |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/Payments.tsx` | Possibly outdated | 365 | 2 | transcript shows different content: 68 ./screens/crm/Payments.tsx |
| `project/src/renderer/src/screens/crm/Pulse.tsx` | Possibly outdated | 417 | 1 | transcript shows different content: 419 src/renderer/src/screens/crm/Pulse.tsx |
| `project/src/renderer/src/screens/crm/clientfile/LinksPanel.tsx` | Possibly outdated | 277 | 1 | transcript shows different content: src/renderer/src/screens/crm/clientfile/LinksPanel.tsx |
| `project/src/renderer/src/screens/crm/clientfile/PayrollPanel.tsx` | Possibly outdated | 315 | 11 | transcript shows different content: src/renderer/src/screens/crm/clientfile/PayrollPanel.t |
| `project/src/renderer/src/screens/crm/clientfile/PensionsPanel.tsx` | Possibly outdated | 183 | 7 | transcript shows different content: src/renderer/src/screens/crm/clientfile/PensionsPanel. |
| `project/src/renderer/src/screens/crm/clientfile/SelfAssessmentPanel.tsx` | Possibly outdated | 316 | 7 | transcript shows different content: src/renderer/src/screens/crm/clientfile/SelfAssessment |
| `project/src/renderer/src/screens/crm/clientfile/panel-kit.tsx` | Possibly outdated | 199 | 1 | transcript shows different content: 1 src/renderer/src/screens/crm/clientfile/panel-kit.ts |
| `project/src/renderer/src/screens/crm/settings/BackupsSection.tsx` | Possibly outdated | 458 | 2 | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/settings/EmailSection.tsx` | Possibly outdated | 269 | 3 | transcript shows different content: 27 ./screens/crm/settings/EmailSection.tsx |
| `project/src/renderer/src/screens/setup/SetupWizard.tsx` | Possibly outdated | 720 |  | an Edit did not match |
| `project/src/renderer/src/stores/notifications.ts` | Possibly outdated | 53 |  | python script not replayed: abort |
| `project/tests/records/activity-workbook.test.ts` | Possibly outdated | 54 |  | python script not replayed: unsupported:iterate unknown |
| `project/tests/records/practice-records.test.ts` | Possibly outdated | 148 | 2 | python script not replayed: error:TypeError |
| `project/tests/records/practice-report.test.ts` | Possibly outdated | 68 |  | python script not replayed: error:TypeError |
| `project/tests/records/reference-flags.test.ts` | Possibly outdated | 81 |  | sed not replayed: flags ; s/import { auditOf, manager, partner, practice, staffA } from '. |
| `project/tests/renderer/navigation.test.ts` | Possibly outdated | 87 |  | python script not replayed: abort |
| `project/docs/RECORDS.md` | Missing (edits only) |  |  |  |
| `project/docs/delivery/crm-import/IMPORT_NOTES.md` | Missing (edits only) |  |  |  |
| `project/src/main/data/registers.ts` | Missing (edits only) |  |  | python script not replayed: error:TypeError |
| `project/src/main/db/migrations/index.ts` | Missing (edits only) |  |  |  |
| `project/src/main/index.ts` | Missing (edits only) |  |  | sed on unknown base |
| `project/src/main/ipc/companies.ts` | Missing (edits only) |  |  |  |
| `project/src/main/ipc/references.ts` | Missing (edits only) |  |  |  |
| `project/src/main/ipc/registers.ts` | Missing (edits only) |  |  |  |
| `project/src/main/ipc/settings.ts` | Missing (edits only) |  |  |  |
| `project/src/main/licence/index.ts` | Missing (edits only) |  |  |  |
| `project/src/main/records/assistant-tools.ts` | Missing (edits only) |  |  |  |
| `project/src/main/records/registers.ts` | Missing (edits only) |  |  | python script not replayed: error:TypeError |
| `project/src/main/references/vault.ts` | Missing (edits only) |  |  |  |
| `project/src/main/services/ch-streaming.ts` | Missing (edits only) |  |  |  |
| `project/src/preload/index.ts` | Missing (edits only) |  |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/components/forms/people.tsx` | Missing (edits only) |  |  |  |
| `project/src/renderer/src/components/ui/Modal.tsx` | Missing (edits only) |  |  |  |
| `project/src/renderer/src/lib/csv.ts` | Missing (edits only) |  |  |  |
| `project/src/renderer/src/screens/crm/AIAssistant.tsx` | Missing (edits only) |  |  | sed on unknown base |
| `project/src/renderer/src/screens/crm/ClientReferences.tsx` | Missing (edits only) |  |  | python script not replayed: error:TypeError |
| `project/src/renderer/src/screens/crm/Clients.tsx` | Missing (edits only) |  |  | node $S/label-ids.cjs /home/claude/aeterna receipt src/renderer/src/screens/crm/Clients.ts |
| `project/src/renderer/src/screens/crm/Companies.tsx` | Missing (edits only) |  |  | sed on unknown base |
| `project/src/renderer/src/screens/crm/Settings.tsx` | Missing (edits only) |  |  | sed on unknown base |
| `project/src/renderer/src/screens/crm/references/ui.tsx` | Missing (edits only) |  |  |  |
| `project/src/shared/ipc-channels.ts` | Missing (edits only) |  |  |  |
| `project/src/shared/references.ts` | Missing (edits only) |  |  |  |
| `project/src/shared/types.ts` | Missing (edits only) |  |  | python script not replayed: unsupported:if on unknown |
| `project/tests/data/registers.test.ts` | Missing (edits only) |  |  | python script not replayed: unsupported:iterate unknown |
| `project/tests/db/ledger-startup.test.ts` | Missing (edits only) |  |  |  |
| `project/tests/records/edits.test.ts` | Missing (edits only) |  |  |  |
| `bundle-notes/crm-level3a-access/LEVEL3A.md` | Complete | 141 | 1 |  |
| `bundle-notes/crm-level3b-licence/LEVEL3B.md` | Complete | 148 | 1 |  |
| `bundle-notes/crm-level3c-email-backups/LEVEL3C.md` | Complete | 137 |  |  |
| `bundle-notes/crm-level4e-forecast-security-assistant/LEVEL4E.md` | Complete | 192 |  |  |
| `bundle-notes/crm-level4f-registers-and-consistency/LEVEL4F.md` | Complete | 166 |  |  |
| `early-bundles/crm-import/IMPORT_NOTES.md` | Complete | 177 |  |  |
| `early-bundles/crm-import/src/main/data/registers.ts` | Complete | 242 |  |  |
| `early-bundles/crm-import/src/main/db/migrate.ts` | Complete | 159 |  |  |
| `early-bundles/crm-import/src/main/db/migrations/0007_practice_registers.ts` | Complete | 335 |  |  |
| `early-bundles/crm-import/src/main/db/migrations/0010_client_foreign_keys.ts` | Complete | 169 |  |  |
| `early-bundles/crm-import/src/main/db/migrations/0011_reference_registers.ts` | Complete | 108 |  |  |
| `early-bundles/crm-import/src/main/db/open-database.ts` | Complete | 233 |  |  |
| `early-bundles/crm-import/src/main/import/adapters/dynamic-master-v2.ts` | Complete | 696 |  |  |
| `early-bundles/crm-import/src/main/import/adapters/dynamic-master-v2.vocab.ts` | Complete | 174 |  |  |
| `early-bundles/crm-import/src/main/import/cli.ts` | Complete | 121 |  |  |
| `early-bundles/crm-import/src/main/import/core/canonical.ts` | Complete | 237 |  |  |
| `early-bundles/crm-import/src/main/import/core/engine.ts` | Complete | 520 |  |  |
| `early-bundles/crm-import/src/main/import/core/normalise.ts` | Complete | 228 |  |  |
| `early-bundles/crm-import/src/main/import/core/project.ts` | Complete | 346 |  |  |
| `early-bundles/crm-import/src/main/import/core/report.ts` | Complete | 178 |  |  |
| `early-bundles/crm-import/src/main/import/core/rules.ts` | Complete | 190 |  |  |
| `early-bundles/crm-import/src/main/import/core/xlsx.ts` | Complete | 82 |  |  |
| `early-bundles/crm-import/src/main/ipc/import.ts` | Complete | 146 |  |  |
| `early-bundles/crm-import/src/main/ipc/registers.ts` | Complete | 187 |  |  |
| `early-bundles/crm-import/src/main/licence/engine.ts` | Complete | 111 |  |  |
| `early-bundles/crm-import/src/main/licence/format.ts` | Complete | 214 |  |  |
| `early-bundles/crm-import/src/main/licence/service.ts` | Complete | 269 |  |  |
| `early-bundles/crm-import/src/main/licence/store.ts` | Complete | 137 |  |  |
| `early-bundles/crm-import/src/main/onboarding/requirements.ts` | Complete | 186 |  |  |
| `early-bundles/crm-import/src/main/references/service.ts` | Complete | 506 |  |  |
| `early-bundles/crm-import/src/main/references/vault.ts` | Complete | 314 |  |  |
| `early-bundles/crm-import/src/main/references/vault.ts.new` | Complete | 584 |  |  |
| `early-bundles/crm-import/src/renderer/src/screens/crm/Licence.tsx` | Complete | 183 |  |  |
| `early-bundles/crm-import/src/renderer/src/screens/crm/OnboardingGaps.tsx` | Complete | 286 |  |  |
| `early-bundles/crm-import/src/shared/data-model.ts` | Complete | 239 |  |  |
| `early-bundles/crm-import/src/shared/references.ts` | Complete | 552 |  |  |
| `early-bundles/crm-stabilize/cleanup-phase9.sh` | Complete | 105 |  |  |
| `early-bundles/crm-stabilize/electron.vite.config.ts` | Complete | 50 |  |  |
| `early-bundles/crm-stabilize/package.json` | Complete | 101 |  |  |
| `early-bundles/crm-stabilize/src/preload/index.d.ts` | Complete | 30 |  |  |
| `early-bundles/crm-stabilize/src/preload/index.ts` | Complete | 355 |  |  |
| `early-bundles/crm-stabilize/src/renderer/src/stores/crm/userStore.ts` | Complete | 31 |  |  |
| `early-bundles/crm-stabilize/src/renderer/src/stores/ui.ts` | Complete | 129 |  |  |
| `early-bundles/crm-stabilize/src/shared/types.ts` | Complete | 932 |  |  |
