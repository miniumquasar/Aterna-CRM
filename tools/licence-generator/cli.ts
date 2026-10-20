/**
 * The vendor's licence key tool (npm run licence -- <command>). Never
 * shipped in the app. Owned by the licence domain, which builds init, issue,
 * renew, replace, revoke and trust-file here.
 */
const command = process.argv[2]
console.error(
  command
    ? `The licence tool doesn’t have the “${command}” command yet; this build has no licence tool commands.`
    : 'Usage: npm run licence -- <command>. This build has no licence tool commands yet.'
)
process.exitCode = 2
