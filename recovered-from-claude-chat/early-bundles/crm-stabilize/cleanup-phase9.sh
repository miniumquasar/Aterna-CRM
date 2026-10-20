#!/usr/bin/env bash
#
# cleanup-phase9.sh — Remove the phase-9 experimental files that the v5
# blueprint (DEVELOPMENT.md §1) mandated be retired but that are still
# sitting in the tree.
#
# What stays: every file that's part of real v5 functionality — clients,
# tasks, HMRC, AML, AR (accounts receivable), backups, auth, onboarding,
# email-templates, Companies House, AI chat, etc.
#
# What goes: every file that only exists to support the Sovereign /
# Singularity / ZK / Homomorphic / DuckDB / Agent-swarm / Genome-market /
# Post-quantum / Merkle / DID-VC experiments.
#
# Run from the repo root after you've dropped the new files from
# /home/claude/crm-stabilize/ into place. Idempotent — missing files are
# reported and skipped, never errored.
#
# Usage:
#   chmod +x cleanup-phase9.sh
#   ./cleanup-phase9.sh
#
# Reversibility: everything is reconstructable from git history. Inspect
# with `git status` before staging if you want a final look.

set -euo pipefail

gone() { printf '  ✓ removed  %s\n' "$1"; }
skip() { printf '  · skip     %s (already gone)\n' "$1"; }

rm_file() {
  if [ -e "$1" ]; then
    rm -f "$1"
    gone "$1"
  else
    skip "$1"
  fi
}

echo
echo "────────────────────────────────────────────────────────────"
echo " Phase-9 cleanup — Companies House CRM"
echo "────────────────────────────────────────────────────────────"

echo
echo "═ Phase-9 main services (cryptographic/ML experiments) ═"
rm_file src/main/services/agent-swarm.ts
rm_file src/main/services/coreml-finetuner.ts
rm_file src/main/services/did-manager.ts
rm_file src/main/services/genome-market.ts
rm_file src/main/services/haptics.ts
rm_file src/main/services/homomorphic.ts
rm_file src/main/services/merkle-ledger.ts
rm_file src/main/services/plugin-sandbox.ts
rm_file src/main/services/practice-fork.ts
rm_file src/main/services/reality-command.ts
rm_file src/main/services/vc-issuer.ts
rm_file src/main/services/vision-bridge.ts
rm_file src/main/services/zk-oracle.ts

echo
echo "═ Phase-9 IPC handlers ═"
# analytics.ts, plugins.ts, singularity.ts all import phase-9 services.
# The new preload does NOT expose these channels, so removing them aligns
# the main-process and renderer surfaces.
rm_file src/main/ipc/analytics.ts
rm_file src/main/ipc/plugins.ts
rm_file src/main/ipc/singularity.ts

# Explicitly NOT removing:
#   - src/main/ipc/ar.ts        (Accounts Receivable — real v5 feature)
#   - src/main/ipc/auth.ts, clients.ts, companies.ts, communications.ts,
#     compliance.ts, documents.ts, email-templates.ts, onboarding.ts,
#     settings.ts, user.ts, activity.ts, ai-chat.ts, backup.ts
#     All real v5 features — preserve unchanged.

echo
echo "═ Phase-9 renderer hooks and orphaned components ═"
rm_file src/renderer/src/hooks/useDataLake.ts     # DuckDB-WASM hook

# If SovereignAetherAwakening is still referenced by App.tsx or elsewhere,
# leave it in place and see STABILIZATION_NOTES.md step 4 for the minimal
# v5 replacement. We don't blindly delete a component that has inbound
# imports — that's how a one-error codebase becomes a ten-error codebase.
if grep -rq "SovereignAetherAwakening" src/ --include='*.tsx' --include='*.ts' 2>/dev/null; then
  REFS=$(grep -r "SovereignAetherAwakening" src/ --include='*.tsx' --include='*.ts' -l 2>/dev/null | wc -l | tr -d ' ')
  echo "  ⚠ SovereignAetherAwakening still referenced in $REFS file(s) — skipping."
  echo "    See STABILIZATION_NOTES.md step 4 to replace with a v5 splash."
else
  rm_file src/renderer/src/aether-theme/SovereignAetherAwakening.tsx
fi

echo
echo "═ Phase-9 renderer stores (duplicate) ═"
# The v5 layout has a CRM-scoped store at src/renderer/src/stores/crm/userStore.ts.
# An old DID/VC-entangled version lived at src/renderer/src/stores/userStore.ts
# with the broken `../../../shared/types` import — remove it if present.
rm_file src/renderer/src/stores/userStore.ts

echo
echo "════════════════════════════════════════════════════════════"
echo " Done. Next:"
echo "   npm ci"
echo "   npm run typecheck"
echo "════════════════════════════════════════════════════════════"
