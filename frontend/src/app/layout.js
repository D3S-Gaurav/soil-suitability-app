import './globals.css';

export const metadata = {
  title: 'SoilSense - Agricultural Monitoring',
  description: 'Real-time soil suitability monitoring and analysis for farmers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
