/**
 * System handlers: health check and facts about this copy. Owned by the
 * backup domain (database status, crash reports and open-the-data-folder
 * come with it).
 */
import { PRODUCT_NAME } from '@shared/product'
import { runtimeInfo } from '../app/runtime'
import { licenceHolder } from '../licence/gate'
import { handle } from './registry'

export function registerSystemHandlers(): void {
  handle('system.ping', (_req, ctx) => ({ pong: true, at: ctx.now().toISOString() }))

  handle('system.info', () => {
    const r = runtimeInfo()
    return {
      productName: PRODUCT_NAME,
      version: r.version,
      electron: r.electron,
      chrome: r.chrome,
      node: r.node,
      platform: r.platform,
      arch: r.arch,
      packaged: r.packaged,
      dataFolder: r.dataFolder,
      licenceHolder: licenceHolder()
    }
  })
}
