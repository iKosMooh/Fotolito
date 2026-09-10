import Desk from './Desk';
import Imprint from './Imprint';
import PlateMark from './PlateMark';

const STEPS = [
  {
    n: '01',
    title: 'Quantização de cores',
    text: 'Um JPG carrega milhares de tons por causa dos gradientes. O K-means agrupa os vizinhos e devolve uma paleta curta de cores chapadas.',
    glyph: (
      <svg viewBox="0 0 120 58" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <rect key={i} x={i * 5} y="4" width="4" height="18" fill="#14131a" opacity={0.25 + (i % 5) * 0.15} />
        ))}
        <path d="M60 28 L60 34 M54 30 L60 36 L66 30" stroke="#14131a" strokeWidth="1.2" fill="none" />
        <rect x="0" y="40" width="30" height="14" fill="#ff2e7e" />
        <rect x="30" y="40" width="30" height="14" fill="#1b3be8" />
        <rect x="60" y="40" width="30" height="14" fill="#ffc400" />
        <rect x="90" y="40" width="30" height="14" fill="#14131a" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Separação em camadas',
    text: 'Cada cor da paleta vira uma máscara monocromática própria — uma chapa por tinta, como no fotolito de uma gráfica.',
    glyph: (
      <svg viewBox="0 0 120 58" aria-hidden="true">
        <g style={{ mixBlendMode: 'multiply' }}>
          <circle cx="46" cy="26" r="20" fill="#ffc400" />
          <circle cx="60" cy="34" r="20" fill="#ff2e7e" />
          <circle cx="74" cy="26" r="20" fill="#1b3be8" />
        </g>
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Detecção de contorno',
    text: 'A varredura percorre a máscara e marca a fronteira exata onde os pixels de uma camada terminam e os da próxima começam.',
    glyph: (
      <svg viewBox="0 0 120 58" aria-hidden="true">
        {[
          [30, 34],
          [40, 34],
          [40, 24],
          [50, 24],
          [50, 14],
          [60, 14],
          [70, 14],
          [70, 24],
          [80, 24],
          [80, 34],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="10" height="10" fill="#14131a" opacity="0.12" />
        ))}
        <path
          d="M30 44 L30 34 L40 34 L40 24 L50 24 L50 14 L80 14 L80 24 L90 24 L90 44 Z"
          fill="none"
          stroke="#ff2e7e"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    n: '04',
    title: 'Ajuste de curvas',
    text: 'A escada serrilhada vira equação: curvas de Bézier com o menor número de nós que ainda descreve a forma sem deformá-la.',
    glyph: (
      <svg viewBox="0 0 120 58" aria-hidden="true">
        <path d="M14 46 C 34 6 84 6 106 42" fill="none" stroke="#1b3be8" strokeWidth="2" />
        <line x1="14" y1="46" x2="40" y2="16" stroke="#14131a" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="106" y1="42" x2="80" y2="12" stroke="#14131a" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="40" cy="16" r="2.6" fill="#14131a" />
        <circle cx="80" cy="12" r="2.6" fill="#14131a" />
        <rect x="10" y="42" width="8" height="8" fill="#f4f5f0" stroke="#14131a" strokeWidth="1.6" />
        <rect x="102" y="38" width="8" height="8" fill="#f4f5f0" stroke="#14131a" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    n: '05',
    title: 'Montagem do SVG',
    text: 'Os caminhos são empilhados na ordem certa dentro de um XML: cada camada vira um <path fill> com as coordenadas arredondadas.',
    glyph: (
      <svg viewBox="0 0 120 58" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="8" y={6 + i * 13} width="9" height="9" fill={['#ffc400', '#ff2e7e', '#1b3be8', '#14131a'][i]} />
            <rect x="23" y={9 + i * 13} width={78 - i * 14} height="3" fill="#14131a" opacity="0.35" />
            <rect x={105 - i * 6} y={9 + i * 13} width="8" height="3" fill="#14131a" opacity="0.15" />
          </g>
        ))}
      </svg>
    ),
  },
];

const FACE = [
  {
    part: 'Pele e iluminação',
    svg: 'Os degradês viram camadas de cor sólida empilhadas.',
    out: 'Manchas no rosto, com cara de mapa topográfico.',
  },
  {
    part: 'Olhos, dentes e expressão',
    svg: 'As curvas simplificam justo onde o detalhe é mínimo.',
    out: 'Traços levemente deformados, com aparência derretida.',
  },
  {
    part: 'Cabelo e roupa',
    svg: 'Os fios individuais somem na quantização.',
    out: 'Blocos genéricos de cor no lugar da textura.',
  },
  {
    part: 'Tamanho do arquivo',
    svg: 'O traçado cria milhares de tags <path>.',
    out: 'SVG que passa de 10 MB e trava o navegador.',
  },
];

const VERDICT = [
  {
    tag: 'Vetorize',
    title: 'Quando o efeito é o objetivo',
    items: [
      'Ilustração estilizada, pop art, pôster',
      'Estampa de camiseta e recorte em vinil',
      'Ícone ou avatar a partir de uma foto',
      'Arte que precisa ampliar sem perder nitidez',
    ],
  },
  {
    tag: 'Mantenha o JPG',
    title: 'Quando o realismo é o objetivo',
    items: [
      'Rugas, poros e brilho natural da pele',
      'Detalhe dos olhos e do cabelo fio a fio',
      'Iluminação e sombra contínuas',
      'Qualquer uso em que a foto precise parecer foto',
    ],
  },
];

const FAULTS = [
  {
    tag: 'Sem pré-processamento',
    title: 'O ruído vira vetor',
    text: 'Artefatos de compressão do JPG cercam cada borda de pontinhos. Sem uma filtragem antes da leitura, o traçador entende cada ponto como uma forma e devolve um arquivo pesado e deformado.',
  },
  {
    tag: 'Paleta mal calibrada',
    title: 'Cor demais, cor de menos',
    text: 'Poucas cores apagam sombras e achatam a forma. Cores demais criam milhares de micro-vetores sobrepostos que travam o navegador na hora de renderizar.',
  },
  {
    tag: 'Tolerância fixa',
    title: 'Serrilha ou pudim',
    text: 'Sem controle de tolerância, o contorno sai escadinha ou é arredondado até perder os cantos vivos. Logo e foto pedem números diferentes, e o mesmo botão não serve para os dois.',
  },
];

const ROADMAP = [
  {
    tag: 'Em planos',
    title: 'Upscaling',
    text: 'Aumentar a resolução de uma imagem pequena antes de traçar, para o vetorizador ter mais detalhe real para trabalhar.',
  },
  {
    tag: 'Em planos',
    title: 'Recorte livre',
    text: 'O recorte atual já corta antes de vetorizar; a ideia é refinar isso, com proporção travada e ajuste fino da seleção.',
  },
  {
    tag: 'Em planos',
    title: 'Remoção de fundo',
    text: 'Isolar o assunto automaticamente antes da vetorização, sem precisar arrastar a seleção à mão.',
  },
  {
    tag: 'Em planos',
    title: 'Mais tratamentos',
    text: 'Outros ajustes de imagem que hoje exigem abrir um editor à parte, direto na mesma mesa.',
  },
];

export default function Page() {
  return (
    <>
      <header className="masthead">
        <div className="shell masthead-in">
          <a className="wordmark" href="#topo">
            <span className="regmarks" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Fotolito
          </a>
          <nav>
            <a href="#mesa">Mesa</a>
            <a href="#processo">Processo</a>
            <a href="#fotos" className="hide-sm">
              Fotos
            </a>
            <a href="#falhas" className="hide-sm">
              Onde falha
            </a>
            <a href="#origem" className="hide-sm">
              Origem
            </a>
          </nav>

          <a
            className="byline"
            href="https://caiodev.net.br/pt-BR"
            target="_blank"
            rel="noopener noreferrer"
            title="Site de Caio Souza Solutions"
          >
            <img src="/caio-souza-solutions.png" alt="" width="640" height="165" />
            <span>
              <b>Caio Souza</b>
              <em>caiodev.net.br</em>
            </span>
          </a>
        </div>
      </header>

      <main id="topo">
        <section className="shell hero">
          <div>
            <p className="eyebrow">Vetorização por separação de cores</p>
            <h1 className="display">
              Pixel não
              <br />
              escala.
              <br />
              <span className="split">Curva sim.</span>
            </h1>
            <p className="lead">
              Trocar a extensão do arquivo não vetoriza nada. É preciso reduzir a paleta, separar a imagem em
              camadas de tinta, seguir o contorno de cada uma e reescrever essa borda como curva de Bézier. É isso
              que acontece aqui, com os parâmetros na sua mão.
            </p>
            <div className="hero-actions">
              <a className="btn" href="#mesa">
                Abrir a mesa
              </a>
              <a className="btn ghost" href="#processo">
                Ver as cinco etapas
              </a>
            </div>
          </div>
          <PlateMark />
        </section>

        <section className="shell band" id="mesa" style={{ paddingTop: 0 }}>
          <div className="band-head">
            <div>
              <p className="eyebrow">A mesa</p>
              <h2>Traçar e conferir lado a lado</h2>
            </div>
            <p className="lead">
              PNG, JPG, WebP ou AVIF entram; um SVG de caminhos sai. O painel mostra quantos caminhos e nós o
              traçado gerou — os dois números que decidem se o arquivo vai ficar leve ou travar o navegador.
            </p>
          </div>
          <Desk />
        </section>

        <section className="shell band" id="processo" style={{ paddingTop: 0 }}>
          <div className="band-head">
            <div>
              <p className="eyebrow">Da grade à curva</p>
              <h2>Cinco etapas, nesta ordem</h2>
            </div>
            <p className="lead">
              A ordem importa: cada etapa só funciona com o resultado da anterior. Trocar a paleta no fim, por
              exemplo, obrigaria a refazer todo o contorno.
            </p>
          </div>
          <div className="pipeline">
            {STEPS.map((step) => (
              <article className="pipe-step" key={step.n}>
                <span className="step">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className="glyph">{step.glyph}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="shell band" id="fotos" style={{ paddingTop: 0 }}>
          <div className="band-head">
            <div>
              <p className="eyebrow">Fotos de pessoas</p>
              <h2>Um rosto vira ilustração, não retrato</h2>
            </div>
            <p className="lead">
              Pele com degradê suave, sombra complexa e fio de cabelo não têm como virar equação sem perder o que
              os define. O traçado devolve uma ilustração posterizada — o visual de pop art ou de arte vetorial de
              jogo. Sabendo disso, dá para tratar o efeito como escolha em vez de acidente.
            </p>
          </div>

          <table className="matter">
            <thead>
              <tr>
                <th scope="col">Elemento da foto</th>
                <th scope="col">O que acontece no SVG</th>
                <th scope="col">Consequência</th>
              </tr>
            </thead>
            <tbody>
              {FACE.map((row) => (
                <tr key={row.part}>
                  <th scope="row">{row.part}</th>
                  <td>{row.svg}</td>
                  <td>{row.out}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="verdicts">
            {VERDICT.map((card) => (
              <article className="verdict" key={card.tag}>
                <span className="tag">{card.tag}</span>
                <h3>{card.title}</h3>
                <ul>
                  {card.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="shell band" id="falhas" style={{ paddingTop: 0 }}>
          <div className="band-head">
            <div>
              <p className="eyebrow">Diagnóstico</p>
              <h2>Por que a maioria dos conversores erra</h2>
            </div>
            <p className="lead">
              Quase sempre o problema não está no algoritmo de traçado, e sim no que vem antes e depois dele.
            </p>
          </div>
          <div className="faults">
            {FAULTS.map((fault) => (
              <article className="fault" key={fault.tag}>
                <span className="tag">{fault.tag}</span>
                <h3>{fault.title}</h3>
                <p>{fault.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell band" id="origem" style={{ paddingTop: 0 }}>
          <div className="band-head">
            <div>
              <p className="eyebrow">Por trás do projeto</p>
              <h2>Fiz porque eu precisava</h2>
            </div>
            <p className="lead">
              Eu precisava vetorizar imagens no meio de outro trabalho e não achei um site que fizesse isso direito.
              Uns geravam SVG quebrado, outros só saíam em preto e branco, e nenhum deixava eu configurar o
              resultado do jeito que eu queria — nem comprimir o arquivo depois, para não ficar pesado. Por isso
              construí o Fotolito: um vetorizador com os parâmetros do algoritmo na minha mão, e a compactação
              embutida no fim do processo.
            </p>
          </div>
          <div className="roadmap">
            <p className="roadmap-label">A seguir na mesa</p>
            <div className="roadmap-grid">
              {ROADMAP.map((item) => (
                <article className="road-item" key={item.title}>
                  <span className="tag">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Imprint />
    </>
  );
}
