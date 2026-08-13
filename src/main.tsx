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

const raiz = document.getElementById('root')!

try {
  createRoot(raiz).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
} catch (erro) {
  // Ultima rede de seguranca, sem React: se nem a montagem inicial funcionou,
  // o LimiteDeErro nunca chega a existir. Melhor uma mensagem crua do que uma
  // tela vazia que nao diz nada a quem esta no estande.
  console.error('[revi-captura] falha ao montar a aplicacao', erro)
  raiz.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
                font-family:system-ui,sans-serif;color:#fff;text-align:center">
      <div style="max-width:26rem">
        <h1 style="font-size:1.1rem;font-weight:600;color:#fcd34d">O app não conseguiu iniciar</h1>
        <p style="margin-top:12px;color:rgba(255,255,255,.7);font-size:.9rem">
          Nenhum lead foi perdido — o que já foi capturado continua salvo no aparelho.
        </p>
        <pre style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(0,0,0,.4);
                    color:#fca5a5;font-size:.75rem;text-align:left;overflow:auto">${
                      erro instanceof Error ? erro.message : String(erro)
                    }</pre>
      </div>
    </div>`
}
