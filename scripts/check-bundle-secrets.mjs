// Confere que nenhum segredo vazou para o bundle publico.
// Item do checklist de aceite: "Token do HubSpot ausente do bundle do front".
// Rode depois de `npm run build`: node scripts/check-bundle-secrets.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const PADROES = [
  { nome: 'Token de Private App do HubSpot', regex: /pat-(na|eu)\d?-[0-9a-f-]{8,}/i },
  { nome: 'Chave service_role do Supabase', regex: /service_role/ },
  { nome: 'Variavel HUBSPOT_TOKEN', regex: /HUBSPOT_TOKEN/ },
  { nome: 'Chave de API generica do HubSpot', regex: /hapikey/i },
]

function arquivos(diretorio) {
  const encontrados = []
  for (const entrada of readdirSync(diretorio)) {
    const caminho = join(diretorio, entrada)
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivos(caminho))
    else encontrados.push(caminho)
  }
  return encontrados
}

let vazamentos = 0
try {
  for (const caminho of arquivos(dist)) {
    if (!/\.(js|css|html|json|map|webmanifest)$/.test(caminho)) continue
    const conteudo = readFileSync(caminho, 'utf8')
    for (const { nome, regex } of PADROES) {
      if (regex.test(conteudo)) {
        console.error(`VAZAMENTO: ${nome} encontrado em ${caminho}`)
        vazamentos++
      }
    }
  }
} catch (erro) {
  console.error('Rode `npm run build` antes.', erro.message)
  process.exit(1)
}

if (vazamentos > 0) {
  console.error(`\n${vazamentos} vazamento(s). NAO faca deploy.`)
  process.exit(1)
}
console.log('OK: nenhum segredo no bundle.')
