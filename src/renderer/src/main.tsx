import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './App'
import { appInfo } from './lib/api'
import { applyTheme, initialMode, readCachedAppearance } from './theme'

// The saved theme before the first paint, so there is no flash of the wrong one.
const prefs = readCachedAppearance()
applyTheme(document.documentElement, prefs, initialMode(prefs))
document.documentElement.dataset.platform = appInfo().platform

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
