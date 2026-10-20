/**
 * Design gallery. Owned by the design domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Palette } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function DesignGallery(): JSX.Element {
  return (
    <>
      <PageHeader title="Design gallery" subtitle="Every component in the current theme" icon={Palette} />
      <EmptyState icon={Construction} title="This screen is being built" body="The design gallery will show every component of the design system in the current theme and mode." />
    </>
  )
}
