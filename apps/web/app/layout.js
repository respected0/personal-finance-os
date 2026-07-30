import "./globals.css";

export const metadata = {
  title: "Personal Finance OS",
  description: "Foundation workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
