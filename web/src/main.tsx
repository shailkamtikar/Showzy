import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { missingEnv } from './lib/env'

const root = createRoot(document.getElementById('root')!)
const missing = missingEnv(import.meta.env)

if (missing.length > 0) {
  // Fail loudly and visibly instead of a blank page.
  root.render(
    <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#b91c1c' }}>
      <h1>Configuration error</h1>
      <p>Missing required environment variable(s): {missing.join(', ')}</p>
      <p>Set them in the repo-root .env file and restart the dev server.</p>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
