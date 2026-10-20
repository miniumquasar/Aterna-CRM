/**
 * Colour themes as pure data: the palette study's eight palettes
 * (docs/design/PALETTES.md), each with a Day and a Night token set, exactly
 * as docs/design/palettes.json gives them (a test checks the two agree, and
 * holds every palette to the study's contrast and chart thresholds).
 *
 * The main process uses them for the window background (no white flash at
 * start-up); the renderer writes them to CSS variables on
 * <html data-mode data-palette> (variables.ts), and Tailwind's colours read
 * those variables, so no component hard-codes a colour.
 *
 * The tokens are the Balanced glass level. Full, Lite and Reduce
 * transparency scale or flatten the glass layers (see variables.ts).
 */
import { alphaOf, over, parseColour, toHex } from './colour'

export const PALETTE_IDS = ['burgundy', 'sapphire', 'emerald', 'graphite', 'indigo', 'onyx', 'aubergine', 'petrol'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const DEFAULT_PALETTE: PaletteId = 'burgundy'

/** The two modes a palette defines. Auto resolves to one of them. */
export type ResolvedMode = 'day' | 'night'

/**
 * The palette study's 35 tokens for one mode. Colours are '#rrggbb', or
 * 'rgba(r, g, b, a)' for the translucent layers and tints.
 */
export interface StudyTokens {
  /** The backdrop gradient (145°): top left, middle, bottom right. */
  backdropFrom: string
  backdropVia: string
  backdropTo: string
  /** Two blurred ambient glows over the backdrop: top left, and bottom centre. */
  glowA: string
  glowB: string
  /** L1 glass (panels), L2 glass laid on L1 (cards), and the well inputs and tracks sit in. */
  surface: string
  surfaceRaised: string
  surfaceSunken: string
  /** Hairlines on every glass layer; the stronger one for inputs and Reduce transparency. */
  border: string
  borderStrong: string
  /** The 1px inner highlight along a surface's top edge. */
  highlight: string
  /** The colour (and strength) soft depth shadows are drawn in. */
  shadow: string
  /** Body text (≥ 7:1), secondary (≥ 4.5:1) and non-essential text (≥ 3:1) on every layer. */
  text: string
  textMuted: string
  textFaint: string
  /** The brand accent as a fill, its hover and pressed steps, the text drawn on it, and its selection tint. */
  accent: string
  accentHover: string
  accentActive: string
  accentFg: string
  accentSoft: string
  /** The quiet second highlight (≥ 3:1 as a graphic). */
  accent2: string
  /** The primary button's and swatches' gradient ends (white text clears 4.5:1 on both). */
  accentGradientFrom: string
  accentGradientTo: string
  /** The focus ring; also the accent as text on glass (≥ 4.5:1). */
  focus: string
  /** Semantic colours, each readable as text (≥ 4.5:1) and with a soft tint for pills. */
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  info: string
  infoSoft: string
  /** Eight categorical chart colours, brand-led and ordered for colour-vision deficiencies. */
  chart: readonly string[]
  /** Five steps of the accent hue, light to dark (Day: low values at index 0; Night: at index 4). */
  chartSequential: readonly string[]
  /** Cool pole, inner cool, grey midpoint, inner warm, warm pole. */
  chartDiverging: readonly string[]
}

/** Opaque equivalents of the glass layers, flattened over backdropVia (Reduce transparency, print). */
export interface SolidSurfaces {
  surface: string
  surfaceRaised: string
  surfaceSunken: string
  /** A selected row: accentSoft on the surface. */
  selected: string
}

/** One mode's tokens: the study's, plus values derived from them. */
export interface ModeTokens extends StudyTokens {
  /** 'light' or 'dark', for the browser's own controls (scrollbars, date pickers). */
  scheme: 'light' | 'dark'
  /** A solid colour for the window behind the page (backdropVia): no flash before the page paints. */
  window: string
  /** The glass layers made opaque. */
  solid: SolidSurfaces
  /** [backdropFrom, backdropVia, backdropTo]. */
  backdrop: readonly [string, string, string]
  /** The glows' colours as '#rrggbb' (their strength is in glowA / glowB). */
  glow: readonly [string, string]
  /** The alphas of surface, surfaceRaised, border and highlight. */
  surfaceAlpha: number
  surfaceRaisedAlpha: number
  borderAlpha: number
  highlightAlpha: number
  /** Same as textFaint (the first token set's name). */
  textSubtle: string
  /** Same as accentFg. */
  onAccent: string
  /** Accent-coloured text on glass: the focus colour, which clears 4.5:1. */
  accentText: string
}

/** A palette as the study gives it. */
export interface PaletteStudy {
  id: PaletteId
  /** The name in Settings → Appearance. */
  name: string
  /** Six words at most, under the name on its card. */
  tagline: string
  /** One sentence about the theme. */
  description: string
  /** Deep, accent and sheen: the card's three-stop gradient. */
  swatches: readonly [string, string, string]
  /** Which practices it suits. */
  recommendedFor: string
  day: StudyTokens
  night: StudyTokens
}

export interface Palette extends Omit<PaletteStudy, 'day' | 'night'> {
  day: ModeTokens
  night: ModeTokens
}

/** The study's palettes, exactly as docs/design/palettes.json gives them. */
export const PALETTE_STUDY: readonly PaletteStudy[] = [
  {
    id: 'burgundy',
    name: 'Burgundy & Slate',
    tagline: 'Traditional, law-firm',
    description: 'Oxblood and rose-crimson over cool slate glass: the gravity of a chambers library without the gloom.',
    swatches: ['#6a0f29', '#be123c', '#e7b8a1'],
    recommendedFor: 'Solicitors, barristers\' clerks, conveyancing and probate - the default for every new install.',
    day: {
      backdropFrom: '#f3dfe8',
      backdropVia: '#eceff7',
      backdropTo: '#d9deec',
      glowA: 'rgba(234, 156, 184, 0.3)',
      glowB: 'rgba(146, 162, 204, 0.24)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(34, 36, 70, 0.055)',
      border: 'rgba(46, 26, 52, 0.08)',
      borderStrong: 'rgba(46, 26, 52, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(70, 24, 48, 0.12)',
      text: '#120f1a',
      textMuted: '#5e525d',
      textFaint: '#727382',
      accent: '#8f1237',
      accentHover: '#7d042d',
      accentActive: '#690224',
      accentFg: '#ffffff',
      accentSoft: 'rgba(143, 18, 55, 0.08)',
      accent2: '#6f7f99',
      accentGradientFrom: '#6f0f2c',
      accentGradientTo: '#b54959',
      focus: '#b63154',
      success: '#016933',
      successSoft: 'rgba(1, 105, 51, 0.12)',
      warning: '#7d5302',
      warningSoft: 'rgba(125, 83, 2, 0.12)',
      danger: '#b01c00',
      dangerSoft: 'rgba(176, 28, 0, 0.12)',
      info: '#2d5f8b',
      infoSoft: 'rgba(45, 95, 139, 0.12)',
      chart: ['#a5033c', '#4685c2', '#46671b', '#8a4385', '#099272', '#8b6202', '#767ac9', '#c8643a'],
      chartSequential: ['#d18e98', '#c06373', '#a93752', '#831737', '#5b0020'],
      chartDiverging: ['#4c81b7', '#8db6e0', '#dcdee3', '#f699a0', '#cc5665']
    },
    night: {
      backdropFrom: '#2b0a16',
      backdropVia: '#110a11',
      backdropTo: '#090a10',
      glowA: 'rgba(150, 22, 60, 0.38)',
      glowB: 'rgba(58, 80, 116, 0.26)',
      surface: 'rgba(60, 18, 36, 0.5)',
      surfaceRaised: 'rgba(255, 226, 238, 0.05)',
      surfaceSunken: 'rgba(6, 2, 6, 0.32)',
      border: 'rgba(255, 200, 222, 0.1)',
      borderStrong: 'rgba(255, 200, 222, 0.2)',
      highlight: 'rgba(255, 236, 244, 0.12)',
      shadow: 'rgba(6, 0, 4, 0.55)',
      text: '#fbeef4',
      textMuted: '#c2acbf',
      textFaint: '#99879e',
      accent: '#d3395d',
      accentHover: '#d9345d',
      accentActive: '#be214c',
      accentFg: '#ffffff',
      accentSoft: 'rgba(211, 57, 93, 0.2)',
      accent2: '#9ba9c2',
      accentGradientFrom: '#9a1438',
      accentGradientTo: '#d3395d',
      focus: '#ed748f',
      success: '#65ba7e',
      successSoft: 'rgba(101, 186, 126, 0.14)',
      warning: '#daa34f',
      warningSoft: 'rgba(218, 163, 79, 0.14)',
      danger: '#ff8f79',
      dangerSoft: 'rgba(255, 143, 121, 0.14)',
      info: '#7bafe0',
      infoSoft: 'rgba(123, 175, 224, 0.14)',
      chart: ['#e34a6a', '#5796d5', '#63853b', '#bb70b4', '#0d8b6d', '#bc891b', '#7074c3', '#c35e35'],
      chartSequential: ['#ffd0d6', '#f9a2af', '#e6798c', '#ca556d', '#a63a52'],
      chartDiverging: ['#6298cf', '#456a91', '#46484c', '#a34e57', '#e66e7b']
    }
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    tagline: 'Calm and trusted',
    description: 'Deep navy glass and a clear sapphire accent: the banking-hall standard, steady and unshowy.',
    swatches: ['#1e3a8a', '#2563eb', '#60a5fa'],
    recommendedFor: 'Audit, corporate finance and firms whose clients are banks, lenders or regulators.',
    day: {
      backdropFrom: '#d2e3f9',
      backdropVia: '#ebf1fa',
      backdropTo: '#d3dceb',
      glowA: 'rgba(96, 165, 250, 0.24)',
      glowB: 'rgba(30, 58, 138, 0.08)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(20, 40, 90, 0.055)',
      border: 'rgba(20, 40, 90, 0.08)',
      borderStrong: 'rgba(20, 40, 90, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(20, 40, 90, 0.12)',
      text: '#0c1424',
      textMuted: '#4e5869',
      textFaint: '#6b7788',
      accent: '#2563eb',
      accentHover: '#1754db',
      accentActive: '#0745cc',
      accentFg: '#ffffff',
      accentSoft: 'rgba(37, 99, 235, 0.08)',
      accent2: '#2b83bd',
      accentGradientFrom: '#1e3a8a',
      accentGradientTo: '#2563eb',
      focus: '#1c5ad6',
      success: '#02683f',
      successSoft: 'rgba(2, 104, 63, 0.12)',
      warning: '#7e5107',
      warningSoft: 'rgba(126, 81, 7, 0.12)',
      danger: '#b00c1e',
      dangerSoft: 'rgba(176, 12, 30, 0.12)',
      info: '#01646d',
      infoSoft: 'rgba(1, 100, 109, 0.12)',
      chart: ['#316de2', '#8e5f03', '#069171', '#a6501a', '#7858ab', '#758830', '#2388bd', '#c46076'],
      chartSequential: ['#819fd6', '#557fcd', '#2c5dbd', '#144098', '#04266c'],
      chartDiverging: ['#4e7bd0', '#8db1f4', '#dbdee3', '#e7a27b', '#bc652f']
    },
    night: {
      backdropFrom: '#131e42',
      backdropVia: '#0b1429',
      backdropTo: '#080f1e',
      glowA: 'rgba(37, 99, 235, 0.2)',
      glowB: 'rgba(96, 165, 250, 0.08)',
      surface: 'rgba(18, 34, 84, 0.5)',
      surfaceRaised: 'rgba(220, 232, 255, 0.05)',
      surfaceSunken: 'rgba(2, 6, 18, 0.32)',
      border: 'rgba(190, 210, 255, 0.1)',
      borderStrong: 'rgba(190, 210, 255, 0.2)',
      highlight: 'rgba(235, 242, 255, 0.12)',
      shadow: 'rgba(0, 4, 16, 0.55)',
      text: '#eef3ff',
      textMuted: '#acbad0',
      textFaint: '#8394ab',
      accent: '#336cea',
      accentHover: '#316df3',
      accentActive: '#2259d5',
      accentFg: '#ffffff',
      accentSoft: 'rgba(51, 108, 234, 0.2)',
      accent2: '#83b4f6',
      accentGradientFrom: '#1d4ed8',
      accentGradientTo: '#336cea',
      focus: '#61a4f7',
      success: '#67c893',
      successSoft: 'rgba(103, 200, 147, 0.14)',
      warning: '#e7a64c',
      warningSoft: 'rgba(231, 166, 76, 0.14)',
      danger: '#ff958d',
      dangerSoft: 'rgba(255, 149, 141, 0.14)',
      info: '#58c5d0',
      infoSoft: 'rgba(88, 197, 208, 0.14)',
      chart: ['#4683fa', '#ac761a', '#0bac87', '#cc621f', '#946cd2', '#768831', '#2f90c6', '#c66177'],
      chartSequential: ['#cddffe', '#9dbffd', '#6e9ef9', '#4b7fe2', '#3362bc'],
      chartDiverging: ['#6998f0', '#4b6daa', '#45484c', '#9d5e39', '#dc834e']
    }
  },
  {
    id: 'emerald',
    name: 'Emerald & Gold',
    tagline: 'Classic accounting, premium',
    description: 'Ledger green glass lit by a single gold highlight: the green-baize tradition of the counting house.',
    swatches: ['#065f46', '#10b981', '#d5b04d'],
    recommendedFor: 'General practice accountants, bookkeeping and tax - the natural pick for year-end work.',
    day: {
      backdropFrom: '#cdefe5',
      backdropVia: '#eef5f2',
      backdropTo: '#d0dfe1',
      glowA: 'rgba(16, 185, 129, 0.14)',
      glowB: 'rgba(213, 176, 77, 0.2)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(10, 50, 40, 0.055)',
      border: 'rgba(10, 50, 40, 0.08)',
      borderStrong: 'rgba(10, 50, 40, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(10, 50, 40, 0.12)',
      text: '#0b1a16',
      textMuted: '#4a5d56',
      textFaint: '#6a7b79',
      accent: '#047857',
      accentHover: '#03694c',
      accentActive: '#065b41',
      accentFg: '#ffffff',
      accentSoft: 'rgba(4, 120, 87, 0.08)',
      accent2: '#9d7a0a',
      accentGradientFrom: '#065f46',
      accentGradientTo: '#06855b',
      focus: '#0b734f',
      success: '#36680b',
      successSoft: 'rgba(54, 104, 11, 0.12)',
      warning: '#864f07',
      warningSoft: 'rgba(134, 79, 7, 0.12)',
      danger: '#b31120',
      dangerSoft: 'rgba(179, 17, 32, 0.12)',
      info: '#216090',
      infoSoft: 'rgba(33, 96, 144, 0.12)',
      chart: ['#0b865c', '#8a3e01', '#a66db3', '#7a892f', '#5383c9', '#a07d0f', '#786bba', '#c8626c'],
      chartSequential: ['#75ac90', '#3a936c', '#04754f', '#045539', '#003823'],
      chartDiverging: ['#0c8c92', '#72bec1', '#d9e0dd', '#eea08d', '#c4624a']
    },
    night: {
      backdropFrom: '#092823',
      backdropVia: '#071816',
      backdropTo: '#08131a',
      glowA: 'rgba(16, 185, 129, 0.08)',
      glowB: 'rgba(213, 176, 77, 0.1)',
      surface: 'rgba(8, 42, 36, 0.5)',
      surfaceRaised: 'rgba(220, 255, 240, 0.05)',
      surfaceSunken: 'rgba(0, 8, 6, 0.32)',
      border: 'rgba(190, 255, 230, 0.1)',
      borderStrong: 'rgba(190, 255, 230, 0.2)',
      highlight: 'rgba(230, 255, 245, 0.12)',
      shadow: 'rgba(0, 8, 6, 0.55)',
      text: '#ecf7f2',
      textMuted: '#a7bfb6',
      textFaint: '#7e998f',
      accent: '#06855b',
      accentHover: '#0f865c',
      accentActive: '#06714d',
      accentFg: '#ffffff',
      accentSoft: 'rgba(6, 133, 91, 0.2)',
      accent2: '#d5b04d',
      accentGradientFrom: '#065f46',
      accentGradientTo: '#06855b',
      focus: '#4fb584',
      success: '#90c770',
      successSoft: 'rgba(144, 199, 112, 0.14)',
      warning: '#f1a657',
      warningSoft: 'rgba(241, 166, 87, 0.14)',
      danger: '#ff9991',
      dangerSoft: 'rgba(255, 153, 145, 0.14)',
      info: '#80bef4',
      infoSoft: 'rgba(128, 190, 244, 0.14)',
      chart: ['#2c9b6f', '#cc651a', '#a66db3', '#7b8930', '#5483ca', '#a17d11', '#8577c8', '#c9626d'],
      chartSequential: ['#bcebd2', '#86d0ac', '#4fb488', '#069767', '#0b7550'],
      chartDiverging: ['#37a9af', '#29787c', '#444947', '#a35c4a', '#e47f66']
    }
  },
  {
    id: 'graphite',
    name: 'Graphite & Copper',
    tagline: 'Understated, modern',
    description: 'Warm graphite glass with one copper accent and an apricot sheen: modern, quiet, entirely neutral.',
    swatches: ['#44403c', '#c2410c', '#f3c08b'],
    recommendedFor: 'Modern practices, advisory and payroll bureaux that want the software to recede.',
    day: {
      backdropFrom: '#e8e7e6',
      backdropVia: '#f3f2f1',
      backdropTo: '#dddfe4',
      glowA: 'rgba(194, 65, 12, 0.08)',
      glowB: 'rgba(120, 120, 135, 0.1)',
      surface: 'rgba(255, 255, 255, 0.62)',
      surfaceRaised: 'rgba(255, 255, 255, 0.72)',
      surfaceSunken: 'rgba(40, 36, 34, 0.055)',
      border: 'rgba(40, 36, 34, 0.08)',
      borderStrong: 'rgba(40, 36, 34, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(40, 30, 24, 0.12)',
      text: '#1a1816',
      textMuted: '#5d5956',
      textFaint: '#7c7774',
      accent: '#c2410c',
      accentHover: '#af3702',
      accentActive: '#9a2f02',
      accentFg: '#ffffff',
      accentSoft: 'rgba(194, 65, 12, 0.08)',
      accent2: '#ad733e',
      accentGradientFrom: '#8a3410',
      accentGradientTo: '#c2410c',
      focus: '#ac4709',
      success: '#1f6a37',
      successSoft: 'rgba(31, 106, 55, 0.12)',
      warning: '#745a03',
      warningSoft: 'rgba(116, 90, 3, 0.12)',
      danger: '#b5122b',
      dangerSoft: 'rgba(181, 18, 43, 0.12)',
      info: '#23628a',
      infoSoft: 'rgba(35, 98, 138, 0.12)',
      chart: ['#c75204', '#3e89c3', '#546801', '#81377c', '#008769', '#a57d0d', '#8579c6', '#c56866'],
      chartSequential: ['#ce967d', '#bc6d49', '#a4450c', '#792f02', '#4f1c00'],
      chartDiverging: ['#4784b6', '#8ab8e0', '#e2ddd8', '#f0a27f', '#c66433']
    },
    night: {
      backdropFrom: '#262423',
      backdropVia: '#161415',
      backdropTo: '#111013',
      glowA: 'rgba(194, 65, 12, 0.12)',
      glowB: 'rgba(160, 160, 175, 0.06)',
      surface: 'rgba(44, 41, 40, 0.52)',
      surfaceRaised: 'rgba(255, 245, 235, 0.05)',
      surfaceSunken: 'rgba(0, 0, 0, 0.3)',
      border: 'rgba(255, 240, 225, 0.1)',
      borderStrong: 'rgba(255, 240, 225, 0.2)',
      highlight: 'rgba(255, 248, 240, 0.12)',
      shadow: 'rgba(0, 0, 0, 0.55)',
      text: '#f4f1ee',
      textMuted: '#bfb7b2',
      textFaint: '#9a9189',
      accent: '#c45000',
      accentHover: '#c65207',
      accentActive: '#a84504',
      accentFg: '#ffffff',
      accentSoft: 'rgba(196, 80, 0, 0.2)',
      accent2: '#f0bf8c',
      accentGradientFrom: '#9a3412',
      accentGradientTo: '#c45000',
      focus: '#e88d58',
      success: '#80ca90',
      successSoft: 'rgba(128, 202, 144, 0.14)',
      warning: '#dab658',
      warningSoft: 'rgba(218, 182, 88, 0.14)',
      danger: '#fea09c',
      dangerSoft: 'rgba(254, 160, 156, 0.14)',
      info: '#82c0ed',
      infoSoft: 'rgba(130, 192, 237, 0.14)',
      chart: ['#de6728', '#4e98d3', '#748d1c', '#bd6eb6', '#009675', '#b08405', '#8679c6', '#c66866'],
      chartSequential: ['#ffd3c0', '#f5ac8b', '#e3875d', '#c96736', '#a74d1d'],
      chartDiverging: ['#63a1d5', '#477397', '#4b4743', '#a55e3c', '#e78151']
    }
  },
  {
    id: 'indigo',
    name: 'Indigo',
    tagline: 'Clean, single hue',
    description: 'One indigo hue from ink to periwinkle, no rainbow: clean, focused and quietly technical.',
    swatches: ['#3730a3', '#6366f1', '#a5b4fc'],
    recommendedFor: 'Tech-forward practices, R&D tax credit specialists and anyone who wants zero visual noise.',
    day: {
      backdropFrom: '#d8defb',
      backdropVia: '#eff1fb',
      backdropTo: '#d5d9ea',
      glowA: 'rgba(99, 102, 241, 0.16)',
      glowB: 'rgba(165, 180, 252, 0.22)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(30, 30, 90, 0.055)',
      border: 'rgba(30, 30, 90, 0.08)',
      borderStrong: 'rgba(30, 30, 90, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(30, 30, 90, 0.12)',
      text: '#10112a',
      textMuted: '#525567',
      textFaint: '#707387',
      accent: '#4f46e5',
      accentHover: '#4535d5',
      accentActive: '#3c22c6',
      accentFg: '#ffffff',
      accentSoft: 'rgba(79, 70, 229, 0.08)',
      accent2: '#6a76c5',
      accentGradientFrom: '#3730a3',
      accentGradientTo: '#6164ec',
      focus: '#504fd6',
      success: '#066642',
      successSoft: 'rgba(6, 102, 66, 0.12)',
      warning: '#7a5105',
      warningSoft: 'rgba(122, 81, 5, 0.12)',
      danger: '#af0820',
      dangerSoft: 'rgba(175, 8, 32, 0.12)',
      info: '#03617b',
      infoSoft: 'rgba(3, 97, 123, 0.12)',
      chart: ['#4c48c6', '#a77511', '#0986c4', '#8d2f4c', '#6f8814', '#7b4592', '#0a9069', '#843c02'],
      chartSequential: ['#919ad5', '#6e77cc', '#5054bc', '#373897', '#221f6c'],
      chartDiverging: ['#6a73cf', '#a0abf4', '#dcdee3', '#d6a771', '#aa6f17']
    },
    night: {
      backdropFrom: '#1d1e46',
      backdropVia: '#111022',
      backdropTo: '#0e0d24',
      glowA: 'rgba(99, 102, 241, 0.18)',
      glowB: 'rgba(165, 180, 252, 0.07)',
      surface: 'rgba(28, 28, 76, 0.48)',
      surfaceRaised: 'rgba(230, 232, 255, 0.05)',
      surfaceSunken: 'rgba(4, 4, 16, 0.32)',
      border: 'rgba(205, 210, 255, 0.1)',
      borderStrong: 'rgba(205, 210, 255, 0.2)',
      highlight: 'rgba(238, 240, 255, 0.12)',
      shadow: 'rgba(2, 2, 12, 0.55)',
      text: '#eff0ff',
      textMuted: '#b3b7cf',
      textFaint: '#8c90af',
      accent: '#6063eb',
      accentHover: '#6263f3',
      accentActive: '#5150d6',
      accentFg: '#ffffff',
      accentSoft: 'rgba(96, 99, 235, 0.2)',
      accent2: '#a5b4fc',
      accentGradientFrom: '#4338ca',
      accentGradientTo: '#6063eb',
      focus: '#8d99f9',
      success: '#6cc598',
      successSoft: 'rgba(108, 197, 152, 0.14)',
      warning: '#e1a955',
      warningSoft: 'rgba(225, 169, 85, 0.14)',
      danger: '#fe9791',
      dangerSoft: 'rgba(254, 151, 145, 0.14)',
      info: '#64c0e2',
      infoSoft: 'rgba(100, 192, 226, 0.14)',
      chart: ['#7478fa', '#a97716', '#1a98db', '#cd6882', '#718a17', '#a26bba', '#3ea981', '#c56628'],
      chartSequential: ['#d5dcff', '#aeb9ff', '#8b97f9', '#6e76e2', '#545abd'],
      chartDiverging: ['#8691f1', '#5f68ab', '#46474c', '#8f642d', '#ca8c3d']
    }
  },
  {
    id: 'onyx',
    name: 'Onyx & Champagne',
    tagline: 'Black-tie, quietly opulent',
    description: 'Lacquered onyx glass with a champagne-gold accent and platinum details: evening dress for the ledger.',
    swatches: ['#15130f', '#cdb17a', '#d9dbe0'],
    recommendedFor: 'Private client, wealth and family-office work where the screen is shared with the client.',
    day: {
      backdropFrom: '#f2eee6',
      backdropVia: '#f5f4f1',
      backdropTo: '#e2e1e0',
      glowA: 'rgba(212, 183, 122, 0.18)',
      glowB: 'rgba(150, 156, 170, 0.12)',
      surface: 'rgba(255, 255, 255, 0.62)',
      surfaceRaised: 'rgba(255, 255, 255, 0.72)',
      surfaceSunken: 'rgba(40, 34, 24, 0.05)',
      border: 'rgba(40, 34, 24, 0.08)',
      borderStrong: 'rgba(40, 34, 24, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(40, 30, 16, 0.12)',
      text: '#16130f',
      textMuted: '#605a52',
      textFaint: '#7f7971',
      accent: '#856112',
      accentHover: '#775401',
      accentActive: '#674904',
      accentFg: '#ffffff',
      accentSoft: 'rgba(133, 97, 18, 0.08)',
      accent2: '#7a828e',
      accentGradientFrom: '#644600',
      accentGradientTo: '#946f26',
      focus: '#866100',
      success: '#216b38',
      successSoft: 'rgba(33, 107, 56, 0.12)',
      warning: '#904d07',
      warningSoft: 'rgba(144, 77, 7, 0.12)',
      danger: '#b61726',
      dangerSoft: 'rgba(182, 23, 38, 0.12)',
      info: '#2c628d',
      infoSoft: 'rgba(44, 98, 141, 0.12)',
      chart: ['#8a6705', '#5387c8', '#973141', '#8676d2', '#834700', '#009675', '#7a417d', '#6a8f41'],
      chartSequential: ['#b8a179', '#9f7f43', '#835f04', '#5f4403', '#3d2a01'],
      chartDiverging: ['#4f84ba', '#90b9e3', '#e0ded8', '#d9ae7c', '#ac762e']
    },
    night: {
      backdropFrom: '#1c1915',
      backdropVia: '#0e0d0c',
      backdropTo: '#09090a',
      glowA: 'rgba(212, 183, 122, 0.1)',
      glowB: 'rgba(150, 160, 180, 0.07)',
      surface: 'rgba(36, 33, 29, 0.55)',
      surfaceRaised: 'rgba(255, 248, 230, 0.05)',
      surfaceSunken: 'rgba(0, 0, 0, 0.32)',
      border: 'rgba(255, 240, 210, 0.1)',
      borderStrong: 'rgba(255, 240, 210, 0.2)',
      highlight: 'rgba(255, 246, 225, 0.12)',
      shadow: 'rgba(0, 0, 0, 0.6)',
      text: '#f6f1e7',
      textMuted: '#cfc7b9',
      textFaint: '#a89e8e',
      accent: '#d4b169',
      accentHover: '#debb72',
      accentActive: '#c7a45d',
      accentFg: '#17140f',
      accentSoft: 'rgba(212, 177, 105, 0.2)',
      accent2: '#c8ccd4',
      accentGradientFrom: '#b4924a',
      accentGradientTo: '#eecb82',
      focus: '#ba9950',
      success: '#78c188',
      successSoft: 'rgba(120, 193, 136, 0.14)',
      warning: '#f19e5a',
      warningSoft: 'rgba(241, 158, 90, 0.14)',
      danger: '#fe928b',
      dangerSoft: 'rgba(254, 146, 139, 0.14)',
      info: '#7eb6e6',
      infoSoft: 'rgba(126, 182, 230, 0.14)',
      chart: ['#b08507', '#5a8fd1', '#c55b67', '#8f7fdb', '#b9690f', '#029775', '#ba71be', '#638839'],
      chartSequential: ['#efdcba', '#d6b984', '#bd9852', '#a07823', '#7f5c03'],
      chartDiverging: ['#649ad1', '#466c93', '#494843', '#896232', '#c38b45']
    }
  },
  {
    id: 'aubergine',
    name: 'Aubergine & Rose Gold',
    tagline: 'Boutique, private client',
    description: 'Aubergine glass with an orchid accent and a rose-gold highlight: warm, discreet and unmistakably boutique.',
    swatches: ['#3b1438', '#8e3a7f', '#e3aa98'],
    recommendedFor: 'Family law, boutique advisory and private-client teams who want warmth without frivolity.',
    day: {
      backdropFrom: '#f0e0ee',
      backdropVia: '#f3eff5',
      backdropTo: '#e1dbe9',
      glowA: 'rgba(190, 110, 180, 0.2)',
      glowB: 'rgba(226, 160, 140, 0.18)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(50, 20, 50, 0.055)',
      border: 'rgba(50, 20, 50, 0.08)',
      borderStrong: 'rgba(50, 20, 50, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(60, 20, 56, 0.12)',
      text: '#1a0f1c',
      textMuted: '#5f525e',
      textFaint: '#7c707e',
      accent: '#7a3165',
      accentHover: '#6c2458',
      accentActive: '#5e164c',
      accentFg: '#ffffff',
      accentSoft: 'rgba(122, 49, 101, 0.08)',
      accent2: '#ad6c56',
      accentGradientFrom: '#5b1349',
      accentGradientTo: '#a85b90',
      focus: '#9e3f84',
      success: '#06673a',
      successSoft: 'rgba(6, 103, 58, 0.12)',
      warning: '#7b5207',
      warningSoft: 'rgba(123, 82, 7, 0.12)',
      danger: '#b00c1e',
      dangerSoft: 'rgba(176, 12, 30, 0.12)',
      info: '#1f5f87',
      infoSoft: 'rgba(31, 95, 135, 0.12)',
      chart: ['#8a257a', '#038366', '#9e7b02', '#6d7ac8', '#bc694c', '#2987be', '#5b7014', '#c56072'],
      chartSequential: ['#c38fb1', '#af6798', '#973f7e', '#74235e', '#4f0d3f'],
      chartDiverging: ['#058a8f', '#70bbbf', '#e0dce2', '#e79f8d', '#bc634d']
    },
    night: {
      backdropFrom: '#2a0f2d',
      backdropVia: '#150a18',
      backdropTo: '#0c0a12',
      glowA: 'rgba(150, 50, 140, 0.24)',
      glowB: 'rgba(226, 160, 140, 0.08)',
      surface: 'rgba(50, 20, 52, 0.5)',
      surfaceRaised: 'rgba(255, 230, 250, 0.05)',
      surfaceSunken: 'rgba(6, 2, 8, 0.32)',
      border: 'rgba(255, 210, 245, 0.1)',
      borderStrong: 'rgba(255, 210, 245, 0.2)',
      highlight: 'rgba(255, 236, 250, 0.12)',
      shadow: 'rgba(6, 0, 8, 0.55)',
      text: '#f8eef8',
      textMuted: '#c2adbf',
      textFaint: '#9e879b',
      accent: '#b25196',
      accentHover: '#b74f9a',
      accentActive: '#9e3f84',
      accentFg: '#ffffff',
      accentSoft: 'rgba(178, 81, 150, 0.2)',
      accent2: '#e3aa98',
      accentGradientFrom: '#913278',
      accentGradientTo: '#b25196',
      focus: '#d181b7',
      success: '#6abb88',
      successSoft: 'rgba(106, 187, 136, 0.14)',
      warning: '#dba34f',
      warningSoft: 'rgba(219, 163, 79, 0.14)',
      danger: '#fe8f87',
      dangerSoft: 'rgba(254, 143, 135, 0.14)',
      info: '#74b3de',
      infoSoft: 'rgba(116, 179, 222, 0.14)',
      chart: ['#c25caf', '#068c6d', '#ac8501', '#6976c4', '#b76547', '#2382ba', '#6c850d', '#d16b7d'],
      chartSequential: ['#fcceeb', '#e9a6d2', '#d37fb8', '#b75c9c', '#95427d'],
      chartDiverging: ['#2da3a9', '#217175', '#49464b', '#985747', '#d77b64']
    }
  },
  {
    id: 'petrol',
    name: 'Petrol & Pearl',
    tagline: 'Heritage, deep and composed',
    description: 'Deep petrol-blue glass with a pearl lustre: the colour of a Georgian front door, calm enough for a 10-hour day.',
    swatches: ['#0e3640', '#2a7f90', '#e8e1d8'],
    recommendedFor: 'Mixed accountancy and legal practices, insolvency and long-session review work.',
    day: {
      backdropFrom: '#d5e8eb',
      backdropVia: '#eef3f4',
      backdropTo: '#dce2e7',
      glowA: 'rgba(40, 140, 160, 0.14)',
      glowB: 'rgba(200, 190, 200, 0.14)',
      surface: 'rgba(255, 255, 255, 0.6)',
      surfaceRaised: 'rgba(255, 255, 255, 0.7)',
      surfaceSunken: 'rgba(10, 40, 50, 0.055)',
      border: 'rgba(10, 40, 50, 0.08)',
      borderStrong: 'rgba(10, 40, 50, 0.16)',
      highlight: 'rgba(255, 255, 255, 0.88)',
      shadow: 'rgba(10, 40, 50, 0.12)',
      text: '#0b171b',
      textMuted: '#485b60',
      textFaint: '#667a80',
      accent: '#086174',
      accentHover: '#035464',
      accentActive: '#034655',
      accentFg: '#ffffff',
      accentSoft: 'rgba(8, 97, 116, 0.08)',
      accent2: '#827c90',
      accentGradientFrom: '#034351',
      accentGradientTo: '#337e92',
      focus: '#0a6f82',
      success: '#23692a',
      successSoft: 'rgba(35, 105, 42, 0.12)',
      warning: '#7e5404',
      warningSoft: 'rgba(126, 84, 4, 0.12)',
      danger: '#b31419',
      dangerSoft: 'rgba(179, 20, 25, 0.12)',
      info: '#465a96',
      infoSoft: 'rgba(70, 90, 150, 0.12)',
      chart: ['#108db2', '#a95043', '#966ecb', '#846603', '#0c9562', '#944b05', '#647fcb', '#708b38'],
      chartSequential: ['#77a8b5', '#408d9f', '#007083', '#02515f', '#01343e'],
      chartDiverging: ['#128aa1', '#76bccd', '#d8dfe1', '#eba195', '#c06457']
    },
    night: {
      backdropFrom: '#0a252d',
      backdropVia: '#08161c',
      backdropTo: '#091117',
      glowA: 'rgba(40, 140, 160, 0.1)',
      glowB: 'rgba(232, 225, 218, 0.05)',
      surface: 'rgba(10, 40, 50, 0.5)',
      surfaceRaised: 'rgba(225, 250, 255, 0.05)',
      surfaceSunken: 'rgba(0, 6, 8, 0.32)',
      border: 'rgba(200, 240, 250, 0.1)',
      borderStrong: 'rgba(200, 240, 250, 0.2)',
      highlight: 'rgba(235, 250, 255, 0.12)',
      shadow: 'rgba(0, 6, 8, 0.55)',
      text: '#edf6f7',
      textMuted: '#a1bcc0',
      textFaint: '#78969c',
      accent: '#017f95',
      accentHover: '#058198',
      accentActive: '#036c7f',
      accentFg: '#ffffff',
      accentSoft: 'rgba(1, 127, 149, 0.2)',
      accent2: '#e7e0d8',
      accentGradientFrom: '#046070',
      accentGradientTo: '#017f95',
      focus: '#41aebf',
      success: '#7ec580',
      successSoft: 'rgba(126, 197, 128, 0.14)',
      warning: '#e0a854',
      warningSoft: 'rgba(224, 168, 84, 0.14)',
      danger: '#ff9387',
      dangerSoft: 'rgba(255, 147, 135, 0.14)',
      info: '#9ab3f6',
      infoSoft: 'rgba(154, 179, 246, 0.14)',
      chart: ['#0a8bb0', '#c16557', '#a37bda', '#9e7a01', '#2cab75', '#c96f24', '#627dc9', '#6e8936'],
      chartSequential: ['#bde6f1', '#88c9da', '#53acc0', '#198ea4', '#036e80'],
      chartDiverging: ['#3ba5bc', '#2b7484', '#43494a', '#9d5b50', '#dd7e6f']
    }
  }
]

/** The glass layers made opaque, with the same source-over formula the study's validator uses. */
export function solidSurfaces(t: StudyTokens): SolidSurfaces {
  const surface = over(t.surface, t.backdropVia)
  return {
    surface: toHex(surface),
    surfaceRaised: toHex(over(t.surfaceRaised, surface)),
    surfaceSunken: toHex(over(t.surfaceSunken, surface)),
    selected: toHex(over(t.accentSoft, surface))
  }
}

function modeTokens(t: StudyTokens, mode: ResolvedMode): ModeTokens {
  return Object.freeze({
    ...t,
    scheme: mode === 'day' ? 'light' : 'dark',
    window: t.backdropVia,
    solid: Object.freeze(solidSurfaces(t)),
    backdrop: [t.backdropFrom, t.backdropVia, t.backdropTo] as const,
    glow: [toHex(parseColour(t.glowA)), toHex(parseColour(t.glowB))] as const,
    surfaceAlpha: alphaOf(t.surface),
    surfaceRaisedAlpha: alphaOf(t.surfaceRaised),
    borderAlpha: alphaOf(t.border),
    highlightAlpha: alphaOf(t.highlight),
    textSubtle: t.textFaint,
    onAccent: t.accentFg,
    accentText: t.focus
  })
}

export const PALETTES: Readonly<Record<PaletteId, Palette>> = Object.freeze(
  Object.fromEntries(PALETTE_STUDY.map((p) => [p.id, Object.freeze({ ...p, day: modeTokens(p.day, 'day'), night: modeTokens(p.night, 'night') })])) as Record<PaletteId, Palette>
)

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value)
}

export function paletteFor(id: PaletteId | string | null | undefined): Palette {
  return isPaletteId(id) ? PALETTES[id] : PALETTES[DEFAULT_PALETTE]
}

export function tokensFor(id: PaletteId | string | null | undefined, mode: ResolvedMode): ModeTokens {
  return paletteFor(id)[mode]
}

/** The study's prose for the screen: spaced hyphens become en dashes, and apostrophes curl (barristers’). */
export function prose(text: string): string {
  return text.replace(/ - /g, ' – ').replace(/'/g, '’')
}
