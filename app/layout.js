import './globals.css';

export const metadata = {
  title: 'Fotolito — vetorizador por separação de cores',
  description:
    'Converta PNG, JPG e WebP em SVG de verdade: quantização de cores, separação em camadas, contorno e ajuste de curvas de Bézier.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@100..125,400..900&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
