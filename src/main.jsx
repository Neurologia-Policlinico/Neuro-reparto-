import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {}))
}

createRoot(document.getElementById('root')).render(<App />)
