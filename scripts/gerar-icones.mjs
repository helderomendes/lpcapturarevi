// Gera os PNGs do PWA a partir do simbolo oficial da Revi
// (public/brand/logo-revi-dark.svg), renderizando no Chromium.
//
// Os PNGs estao versionados no repositorio, entao rodar isto so e necessario se
// o logo mudar. Precisa do Playwright disponivel:
//   npx playwright install chromium   (ou npm i -D playwright)
//
//   node scripts/gerar-icones.mjs

import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CANVAS = '#000011'

/** Cores do simbolo. O wordmark (#fff) fica de fora: ilegivel em 32px. */
const CORES_SIMBOLO = ['#56bbee', '#32c700', '#0a40c6']

/** Caixa do simbolo no viewBox original, medida no navegador. */
const SIMBOLO = { largura: 90.51, altura: 77.57 }

function pathsDoSimbolo() {
  const svg = readFileSync(resolve(raiz, 'public/brand/logo-revi-dark.svg'), 'utf8')
  const encontrados = [...svg.matchAll(/<path d="([^"]+)"\s+style="fill: (#[0-9a-fA-F]+);"/g)]

  const unicos = new Map()
  for (const [, d, cor] of encontrados) {
    if (CORES_SIMBOLO.includes(cor.toLowerCase()) && !unicos.has(d)) unicos.set(d, cor)
  }

  // Ordem de pintura do arquivo oficial: ciano, verde, azul.
  return [...unicos].sort(
    (a, b) => CORES_SIMBOLO.indexOf(a[1].toLowerCase()) - CORES_SIMBOLO.indexOf(b[1].toLowerCase()),
  )
}

/**
 * @param proporcao quanto do lado o simbolo ocupa. Icone maskable precisa de
 *   margem: o sistema recorta as bordas em um circulo.
 */
function pagina(paths, lado, { fundo, proporcao, raioCanto }) {
  const largura = lado * proporcao
  const altura = largura * (SIMBOLO.altura / SIMBOLO.largura)

  return `<!doctype html><html><body style="margin:0">
    <div style="width:${lado}px;height:${lado}px;background:${fundo};
                border-radius:${raioCanto}px;display:flex;
                align-items:center;justify-content:center;overflow:hidden">
      <svg width="${largura}" height="${altura}"
           viewBox="0 0 ${SIMBOLO.largura} ${SIMBOLO.altura}"
           xmlns="http://www.w3.org/2000/svg">
        ${paths.map(([d, cor]) => `<path d="${d}" fill="${cor}"/>`).join('')}
      </svg>
    </div>
  </body></html>`
}

const ICONES = [
  // Instalado na tela inicial: canto arredondado proprio.
  { arquivo: 'icon-192.png', lado: 192, proporcao: 0.68, raio: 0.22 },
  { arquivo: 'icon-512.png', lado: 512, proporcao: 0.68, raio: 0.22 },
  // O iOS aplica a mascara dele, entao entregamos quadrado cheio.
  { arquivo: 'apple-touch-icon.png', lado: 180, proporcao: 0.68, raio: 0 },
  // Maskable: fundo sangrando e simbolo dentro da area segura.
  { arquivo: 'icon-maskable-512.png', lado: 512, proporcao: 0.52, raio: 0 },
]

const { chromium } = await import('playwright').catch(() => {
  console.error('Playwright nao encontrado. Rode: npm i -D playwright')
  process.exit(1)
})

const paths = pathsDoSimbolo()
if (paths.length !== 3) {
  console.error(`Esperava 3 paths do simbolo, achei ${paths.length}. O logo mudou?`)
  process.exit(1)
}

mkdirSync(resolve(raiz, 'public/icons'), { recursive: true })

const navegador = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
})

try {
  for (const { arquivo, lado, proporcao, raio } of ICONES) {
    const contexto = await navegador.newContext({
      viewport: { width: lado, height: lado },
      deviceScaleFactor: 1,
    })
    const aba = await contexto.newPage()
    await aba.setContent(
      pagina(paths, lado, { fundo: CANVAS, proporcao, raioCanto: lado * raio }),
    )
    await aba.screenshot({
      path: resolve(raiz, 'public/icons', arquivo),
      omitBackground: false,
    })
    await contexto.close()
    console.log(`gerado ${arquivo} (${lado}x${lado})`)
  }
} finally {
  await navegador.close()
}
