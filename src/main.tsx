import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from '@/App'
import '@/index.css'

// App shell em cache: o app abre offline, inclusive em cold start.
// `autoUpdate` troca a versao sozinho na proxima abertura — durante o evento
// ninguem deve ver prompt de atualizacao.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
