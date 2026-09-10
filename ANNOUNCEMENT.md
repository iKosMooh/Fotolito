# Lancei o Fotolito — um vetorizador de imagens que eu realmente precisava

Repositório: **[github.com/iKosMooh/Fotolito](https://github.com/iKosMooh/Fotolito)**

## O problema

Enquanto eu trabalhava em outro projeto, precisei converter algumas imagens para SVG e fui atrás de um site que fizesse isso. Não achei nenhum que funcionasse direito: alguns geravam um SVG quebrado, outros só saíam em preto e branco, e nenhum deixava eu configurar o resultado do jeito que eu queria — nem comprimir o arquivo depois, para não ficar pesado. Testei vários e não tive facilidade em usar nenhum.

Então construí o meu.

## O que é

**Fotolito** é um vetorizador de verdade: PNG, JPG, WebP e AVIF entram como matriz de pixels, um SVG de caminhos sai — sem prometer fotorrealismo onde não existe, e sem esconder os parâmetros do algoritmo atrás de um botão mágico.

Alguns destaques:

- **Oito receitas testadas** (Marca, Ilustração, Fiel, Pixel art, Retrato, Pop art, Preto e branco, Tons de cinza, Logo), cada uma com valores medidos contra imagens reais, não chutados.
- **Recorte antes de traçar** — arraste sobre a imagem original para vetorizar só o que importa; o fundo de uma foto real costuma gerar a maioria dos caminhos descartáveis.
- **Correção de pontinhos** — selagem de emenda entre formas vizinhas e chapa de fundo na cor dominante eliminam o vazamento de anti-aliasing entre cores lisas adjacentes (um problema clássico de vetorizador).
- **Compactação com um clique** — roda SVGO depois do traçado e mostra o antes/depois em bytes e gzip, sem sair da página.
- **Aviso antes de travar o navegador** — a interface avisa quando a combinação de parâmetros tende a gerar dezenas de milhares de caminhos, antes de você esperar o resultado.
- Tudo roda no servidor (Sharp + ImageTracer.js), nada é salvo em disco, e o código é aberto.

## O que vem a seguir

O Fotolito resolve o problema que eu tinha — vetorização de verdade, com controle real. Mas ele não precisa parar aí. No roadmap:

- **Upscaling** — aumentar a resolução de uma imagem pequena antes de traçar, para o vetorizador ter mais detalhe real para trabalhar.
- **Recorte mais fino** — refinar o recorte atual, com proporção travada e ajuste mais preciso da seleção.
- **Remoção de fundo** — isolar o assunto automaticamente antes da vetorização, sem precisar arrastar a seleção à mão.
- **Outros tratamentos de imagem** — os ajustes que hoje exigem abrir um editor à parte, direto na mesma mesa.

A ideia é que a mesa de trabalho vire o lugar onde você resolve o tratamento de imagem inteiro, não só a vetorização.

## Testem, quebrem, mandem feedback

O projeto está no ar e o código é aberto. Se você já passou pela mesma frustração — precisar de um resultado vetorial decente e não achar — dá uma chance ao Fotolito. Issues e sugestões são bem-vindas no repositório.

---

Projeto, design e código de **Caio Souza** — [Caio Souza Solutions](https://caiodev.net.br/pt-BR).
