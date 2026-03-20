export const metadata = {
  title: 'ЖК АКСУ — Платформа управления',
  description: 'Управление жилым комплексом',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
