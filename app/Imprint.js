// Rodapé-colofão: em uma gráfica, é onde o impressor assina a folha.
const LINKS = [
  { label: 'caiodev.net.br', href: 'https://caiodev.net.br/pt-BR' },
  { label: 'WhatsApp', href: 'https://wa.me/5519971394130' },
  { label: 'github.com/iKosMooh', href: 'https://github.com/iKosMooh' },
];

export default function Imprint() {
  return (
    <footer className="imprint" id="creditos">
      <div className="shell imprint-in">
        <div className="imprint-author">
          <img
            className="imprint-logo"
            src="/caio-souza-solutions.png"
            alt="Caio Souza Solutions"
            width="640"
            height="165"
          />
          <p className="eyebrow imprint-eyebrow">Projeto, design e código</p>
          <p className="imprint-name">Caio Souza</p>
          <p className="imprint-line">
            Fotolito foi desenhado e construído por Caio Souza, da Caio Souza Solutions — engenharia de software,
            web, mobile, nuvem e visão computacional.
          </p>
          <ul className="imprint-links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="shell imprint-foot">
        <span>Fotolito · vetorizador por separação de cores</span>
        <span>Sharp + ImageTracer.js · processado no servidor, nada fica salvo</span>
        <span>© {new Date().getFullYear()} Caio Souza Solutions</span>
      </div>
    </footer>
  );
}
