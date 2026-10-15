import Remover from './Remover';

export const metadata = {
  title: 'Remover fundo — Fotolito',
  description:
    'Remova o fundo de fotos no navegador com o modelo BiRefNet: borda de cabelo, limpeza de halo, retoque à mão e PNG transparente.',
};

export default function FundoPage() {
  return (
    <>
      <main>
        <section className="shell band tool-band">
          <div className="band-head tool-head">
            <div>
              <p className="eyebrow">Ferramentas · Remover fundo</p>
              <h1 className="display tool-title">
                Fica o
                <br />
                <span className="split">assunto.</span>
              </h1>
            </div>
            <p className="lead">
              Um modelo de segmentação separa o assunto do fundo, fio de cabelo incluído. Depois você ajusta a
              borda, limpa o halo de cor e retoca à mão o que o modelo errou. Tudo roda no seu navegador: a foto não
              sai da sua máquina.
            </p>
          </div>
          <Remover />
        </section>
      </main>
    </>
  );
}
