# Referência técnica do pipeline

Detalhamento de tudo que o [README](../README.md) resume: os parâmetros aceitos pela API, os valores medidos de cada receita, como a selagem de emenda resolve o vazamento entre cores lisas, os números da compactação e o que esperar ao vetorizar fotos de pessoas.

## `POST /api/convert`

Recebe `multipart/form-data` com a imagem e os parâmetros abaixo; devolve JSON com o SVG e as estatísticas do traçado (`paths`, `nodes`, `colors`, `bytes`, `gzipBytes`, `ms`…). Nada é gravado em disco.

| Campo | Faixa | Papel |
| --- | --- | --- |
| `image` | até 12 MB | arquivo enviado |
| `colors` | 2–128 | tamanho da paleta |
| `detail` | 120–1600 | lado maior usado na varredura |
| `ltres` / `qtres` | 0,01–10 | tolerância de linha e de curva |
| `pathomit` | 0–64 | descarta caminhos menores que isso |
| `smooth` | 0–4 | sigma do desfoque antes da leitura |
| `denoise` | 0 ou 1 | filtro de mediana para artefatos de JPG |
| `quantcycles` | 1–10 | ciclos de refinamento da paleta |
| `corners` | `true`/`false` | preserva cantos retos em vez de arredondar |
| `crop` | `x,y,w,h` de 0 a 1 | recorta antes de tudo; ignorado se a área for menor que 2% |
| `seal` | 0–3 | contorno da própria cor que sela a emenda entre formas vizinhas |
| `plate` | `true`/`false` | chapa de fundo na cor dominante, só quando a imagem é opaca |
| `mode` | `color`, `gray`, `mono` | modo de cor; em `mono` a paleta é fixa em preto e branco |
| `level` | 1–254 | corte do preto e branco: abaixo disso vira preto |

## `POST /api/optimize`

Recebe `{ svg, precision, merge }` em JSON e devolve `{ svg, before, after, ms }`, com `bytes` e `gzipBytes` medidos dos dois lados. Roda SVGO em `multipass` com `floatPrecision: 1` e `mergePaths` forçado.

## Receitas da interface

Medidas num logo de 900 px com degradê (o caso difícil) e numa foto:

| Receita | Modo | Cores | Detalhe | Tol. | Suav. | Descarte | Caminhos no logo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Marca | cor | 8 | 900 | 1,0 | 0,3 | 4 | 30 |
| Ilustração | cor | 24 | 1000 | 1,2 | 0,6 | 10 | 171 |
| Fiel | cor | 64 | 1200 | 0,6 | 0,3 | 2 | 1.334 |
| Pixel art | cor | 16 | 320 | 0,1 | 0 | 0 | 720 |
| Retrato | cor | 40 | 700 | 1,4 | 1,2 | 10 | 293 |
| Pop art | cor | 12 | 600 | 2,0 | 1,6 | 16 | 13 |
| Preto e branco | mono | 2 | 1000 | 0,8 | 0,4 | 6 | 33 |
| Tons de cinza | cinza | 8 | 900 | 1,2 | 1,0 | 20 | 403 |
| Logo | cor | 128 | 1600 | 0,6 | 2,0 | 0 | 3.869 |

A receita **Logo** é o oposto de Marca: paleta cheia (128) e leitura em alta resolução (1600 px) para captar reflexo e brilho metálico em vetores de logotipo, sem descarte de manchas (`pathomit: 0`) para não perder detalhe fino. Isso normalmente explodiria o arquivo — a mesma combinação sem ajuste chega a 45 mil caminhos e 11 MB —, mas suavizar bordas em 2,0 e selar emendas em 2,0 seguram a contagem em ~3.900 caminhos e 650 kB brutos. **Use o botão Compactar SVG depois de vetorizar**: no mesmo teste, a compactação levou para 24 caminhos e 107 kB.

Duas coisas que a medição mostrou, contra a intuição:

- **`pathomit` é a alavanca principal.** No mesmo logo, subir o descarte de 4 para 10 px cortou os caminhos em três quartos, com perda visual desprezível.
- **Cor de menos estilhaça mais que cor demais.** Em degradê, 16 cores geraram 1.414 caminhos e 24 cores geraram 304: com centroides de sobra o k-means mapeia as faixas em vez de espalhar ruído. Por isso a receita Ilustração usa 24 e não 16.

Preto e branco e tons de cinza usam paleta explícita em vez da quantização automática — sem isso o transparente e o preto caem no mesmo grupo e o fundo vira uma mancha sólida.

## Pontinhos claros em cores lisas

Duas formas vizinhas que dividem a borda exata recebem, cada uma, opacidade parcial do anti-aliasing. As duas metades não somam 100% e o fundo vaza na junção. O app ataca isso em três frentes, todas ligadas por padrão:

1. **Selar emendas** (`seal`, padrão 0,6 px) — cada `<path>` ganha um contorno da própria cor de preenchimento, cobrindo a junta. Medido em um retrato de teste: 2.251 pixels vazando sem selagem, 317 com 0,6 px (−86%).
2. **Chapa de fundo** (`plate`) — um `<rect>` na cor dominante atrás de tudo, só quando a imagem é opaca. Qualquer vazamento restante mostra a cor dominante em vez do branco da página: **0 pixels vazando** no mesmo teste, ao custo de ~47 bytes.
3. **Fusão de caminhos** — o `mergePaths` do SVGO junta os `<path>` de mesma cor em um só, o que apaga as bordas internas entre eles. É a mesma etapa que reduz o peso.

O SVG também sai com `fill-rule="nonzero"` explícito (evita que sub-caminhos sobrepostos virem buraco sob `evenodd`), `stroke-linejoin="round"` e `stroke-linecap="round"` na raiz.

## Compactar

Terminada a vetorização, a mesa oferece **Compactar SVG**. O botão chama `/api/optimize`, que roda o SVGO e devolve o antes e o depois. O painel troca para os números da versão compactada e mostra o ganho; o download passa a levar o arquivo `.min.svg`.

Medido em um retrato de 800×1000 com 40 cores:

| Estágio | Caminhos | Peso | Gzip |
| --- | --- | --- | --- |
| Traçado bruto | 346 | 86,6 kB | 21,3 kB |
| Após SVGO | 28 | 34,1 kB | 8,7 kB |

Diferença visual entre os dois, rasterizados a 400 px: desvio máximo de 7 em 255 por canal, média 0,01 — nenhum pixel com desvio acima de 8.

## Fotos de pessoas

Vetorização não devolve fotorrealismo, e o app não promete isso. Degradê de pele vira camada sólida (efeito de mapa topográfico no rosto), olhos e dentes saem levemente deformados, fio de cabelo vira bloco de cor e o arquivo estoura de tamanho. O resultado é ilustração posterizada — pop art, arte vetorial de jogo.

O que ajuda:

- **32 a 48 cores.** Abaixo de 32 o rosto fica irreconhecível; acima de 64 o arquivo cresce sem ganho proporcional.
- **Desfoque 1,2 no pré-processamento**, para suavizar imperfeição de pele e reduzir micro-polígonos.
- **Recorte só as pessoas** antes de traçar.
- **Descarte de manchas em 8 a 10 px**, para o traçado focar nas formas principais.

Quando o objetivo é o realismo — ruga, poro, detalhe de olho e cabelo, iluminação contínua — mantenha o JPG ou WebP. A mesa avisa quando o traçado passa de 2.500 caminhos ou 1,5 MB, tamanho em que o navegador engasga para renderizar.
