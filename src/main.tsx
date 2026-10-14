import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './light-theme.css'
import './simulation-ui.css'
import './mathlab.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
