/**
 * About and help: this copy's version and where to get help. Owned by the
 * release domain, which adds the guides, What's new and the support form.
 */
import { Info, Mail, Phone } from 'lucide-react'
import { PRODUCT, PRODUCT_NAME } from '@shared/product'
import { GlassCard, Loading, LoadProblem, PageHeader } from '@renderer/components/ui'
import { useApiQuery } from '@renderer/lib/api'

export default function AboutScreen(): JSX.Element {
  const info = useApiQuery('system.info', undefined)
  return (
    <>
      <PageHeader title="About and help" subtitle={PRODUCT.tagline} icon={Info} />
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard title={PRODUCT_NAME} subtitle={`Made by ${PRODUCT.vendor}`}>
          {info.isPending ? (
            <Loading />
          ) : info.isError ? (
            <LoadProblem error={info.error} onRetry={() => void info.refetch()} />
          ) : (
            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-y-2 text-sm">
              <dt className="text-fg-subtle">Version</dt>
              <dd className="text-fg">{info.data.version}</dd>
              <dt className="text-fg-subtle">Licensed to</dt>
              <dd className="text-fg">{info.data.licenceHolder ?? 'Trial'}</dd>
              <dt className="text-fg-subtle">Data folder</dt>
              <dd className="break-all text-fg">{info.data.dataFolder || '—'}</dd>
              <dt className="text-fg-subtle">Electron</dt>
              <dd className="text-fg">{info.data.electron || '—'}</dd>
            </dl>
          )}
        </GlassCard>
        <GlassCard title="Help and support" subtitle="We answer on working days">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail size={16} aria-hidden className="text-accent-text" />
              <a className="text-fg underline-offset-2 hover:underline" href={`mailto:${PRODUCT.supportEmail}?subject=${encodeURIComponent(`${PRODUCT_NAME} support`)}`}>
                {PRODUCT.supportEmail}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Phone size={16} aria-hidden className="text-accent-text" />
              <span className="text-fg">{PRODUCT.supportPhone}</span>
            </li>
          </ul>
        </GlassCard>
      </div>
    </>
  )
}
