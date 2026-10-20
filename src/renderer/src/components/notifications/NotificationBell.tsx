/**
 * The title bar's bell. Owned by the insights domain, which adds the count,
 * the list and desktop notifications. Until then it opens Activity.
 */
import { Bell } from 'lucide-react'
import { GlassButton, Tooltip } from '../ui'
import { navigate } from '../../stores/router'

export function NotificationBell(): JSX.Element {
  return (
    <Tooltip content="Notifications" describe={false}>
      <GlassButton variant="ghost" size="sm" iconOnly icon={Bell} aria-label="Notifications" onClick={() => navigate('activity')} />
    </Tooltip>
  )
}
