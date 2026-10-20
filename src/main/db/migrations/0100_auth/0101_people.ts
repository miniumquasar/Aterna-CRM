/**
 * People and sessions, beyond the core tables:
 *
 *  - users.idle_minutes: a person's own, shorter idle sign-out (null: the
 *    practice's setting, kept in settings as auth / idleMinutes);
 *  - an index for counting recent sign-in attempts by the username typed,
 *    which the lockout warnings read;
 *  - an index for finding open invitations.
 */
import type { Migration } from '../../migrate'

export const migration0101People: Migration = {
  id: '0101_people',
  up(db) {
    db.exec(`
ALTER TABLE users ADD COLUMN idle_minutes INTEGER CHECK (idle_minutes IS NULL OR idle_minutes BETWEEN 1 AND 1440);
CREATE INDEX sign_in_events_username ON sign_in_events(username COLLATE NOCASE, created_at);
CREATE INDEX invites_open ON invites(expires_at) WHERE accepted_at IS NULL AND cancelled_at IS NULL;
`)
  }
}
