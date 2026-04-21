import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#013369",
};

export const metadata: Metadata = {
  title: "Draft Props Live",
  description: "NFL Draft Prop Pool — predict the picks, win the pool",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Draft Props",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            // Recovery mechanism: ?reset=sw in the URL unregisters every
            // service worker and clears every cache, then reloads. Give
            // this to any user who's stuck on a poisoned SW.
            if (location.search.includes('reset=sw')) {
              navigator.serviceWorker.getRegistrations().then((regs) => {
                return Promise.all(regs.map((r) => r.unregister()));
              }).then(() => {
                if ('caches' in window) {
                  return caches.keys().then((keys) =>
                    Promise.all(keys.map((k) => caches.delete(k)))
                  );
                }
              }).finally(() => {
                location.replace(location.pathname);
              });
            } else {
              navigator.serviceWorker.register('/sw.js').then((reg) => {
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });
                document.addEventListener('visibilitychange', () => {
                  if (document.visibilityState === 'visible') reg.update();
                });
              }).catch(() => {});
            }
          }
        `}</Script>
      </body>
    </html>
  );
}
