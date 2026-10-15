import Composer from './Composer';

export const metadata = {
  title: 'Recorte livre — Fotolito',
  description: 'Defina uma área em px, adicione várias imagens e mova, redimensione e recorte livremente.',
};

export default function RecortePage() {
  return (
    <>
      <main>
        <section className="shell band tool-band">
          <div className="band-head tool-head">
            <div>
              <p className="eyebrow">Ferramentas · Recorte livre</p>
              <h1 className="display tool-title">
                Corte na
                <br />
                <span className="split">medida.</span>
              </h1>
            </div>
            <p className="lead">
              Defina o tamanho final em pixels, solte quantas imagens quiser e arraste cada uma para o lugar. O que
              passar da borda é cortado na exportação. Tudo roda no navegador: nenhuma imagem sai da sua máquina.
            </p>
          </div>
          <Composer />
        </section>
      </main>
    </>
  );
}
