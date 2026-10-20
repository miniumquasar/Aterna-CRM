/**
 * The product's fixed facts: one place for the window title, the data folder,
 * the installer, About, support and crash reports. Never repeat these
 * elsewhere; import them.
 */
export const PRODUCT = {
  /** Shown everywhere the app names itself; also electron-builder's productName. */
  name: 'AETERNA CRM',
  /** The folder under the OS application-data folder that holds the practice's data. */
  dataFolderName: 'AETERNA CRM',
  /** electron-builder appId and the Windows AppUserModelID. */
  appId: 'uk.co.bitopi.aeternacrm',
  vendor: 'Bitopi',
  supportEmail: 'info@bitopi.co.uk',
  supportPhone: '07555 221010',
  /** Where new versions are downloaded: each release is a full installer that keeps the data. */
  downloadPage: 'https://bitopi.co.uk/',
  /** What the app is, in one line, for About and the installer. */
  tagline: 'Offline practice management for UK accounting firms',
  /** Platforms built today. macOS is configured but not built. */
  platforms: ['Windows 10 and 11 (64-bit)'] as readonly string[],
  /** UK English and the UK's civil time zone throughout. */
  locale: 'en-GB',
  timeZone: 'Europe/London',
  currency: 'GBP'
} as const

export const PRODUCT_NAME = PRODUCT.name
export const APP_ID = PRODUCT.appId
export const DATA_FOLDER_NAME = PRODUCT.dataFolderName
export const VENDOR = PRODUCT.vendor
export const SUPPORT_EMAIL = PRODUCT.supportEmail
export const SUPPORT_PHONE = PRODUCT.supportPhone
export const DOWNLOAD_PAGE = PRODUCT.downloadPage
