// Gera os PNGs do PWA sem dependencia externa de imagem.
// Rode com: node scripts/gerar-icones.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FUNDO = [0x00, 0x00, 0x11]
const AZUL = [0x14, 0x66, 0xff]
const VERDE = [0x00, 0xe5, 0x8a]

function crc32(buf) {
  let c
  const tabela = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = tabela[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

/** Mistura cor sobre fundo com cobertura 0..1 (antialiasing simples). */
function mesclar(destino, cor, alfa) {
  return destino.map((canal, i) => Math.round(canal * (1 - alfa) + cor[i] * alfa))
}

function desenhar(tamanho) {
  const linhas = []
  const centro = tamanho / 2
  // Quadrado arredondado azul, com margem.
  const margem = tamanho * 0.14
  const raioCanto = tamanho * 0.23
  const minimo = margem
  const maximo = tamanho - margem
  // Ponto verde do logo, no canto superior direito do quadrado.
  const pontoX = tamanho * 0.66
  const pontoY = tamanho * 0.34
  const pontoR = tamanho * 0.085

  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 3)
    linha[0] = 0 // filtro "none"
    for (let x = 0; x < tamanho; x++) {
      let cor = FUNDO

      // Distancia ao quadrado arredondado.
      const dx = Math.max(minimo + raioCanto - x, 0, x - (maximo - raioCanto))
      const dy = Math.max(minimo + raioCanto - y, 0, y - (maximo - raioCanto))
      const dist = Math.hypot(dx, dy)
      const coberturaQuadrado = Math.min(Math.max(raioCanto + 0.5 - dist, 0), 1)
      if (coberturaQuadrado > 0) cor = mesclar(cor, AZUL, coberturaQuadrado)

      // Barra branca central, evocando o "r" do wordmark.
      const barraX = Math.abs(x - centro * 0.82) < tamanho * 0.045
      const barraY = y > tamanho * 0.34 && y < tamanho * 0.68
      if (barraX && barraY && coberturaQuadrado > 0.5) cor = [0xff, 0xff, 0xff]

      // Ponto verde.
      const distPonto = Math.hypot(x - pontoX, y - pontoY)
      const coberturaPonto = Math.min(Math.max(pontoR + 0.5 - distPonto, 0), 1)
      if (coberturaPonto > 0) cor = mesclar(cor, VERDE, coberturaPonto)

      linha[1 + x * 3] = cor[0]
      linha[2 + x * 3] = cor[1]
      linha[3 + x * 3] = cor[2]
    }
    linhas.push(linha)
  }
  return Buffer.concat(linhas)
}

function png(tamanho) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(desenhar(tamanho), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(resolve(raiz, 'public/icons'), { recursive: true })
for (const [arquivo, tamanho] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const destino = resolve(raiz, 'public/icons', arquivo)
  writeFileSync(destino, png(tamanho))
  console.log(`gerado ${arquivo} (${tamanho}x${tamanho})`)
}
