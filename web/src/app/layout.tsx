import type { Metadata } from "next";
import "@fontsource-variable/montserrat";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Providers } from "./providers";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: brand.fullName, template: `%s · ${brand.fullName}` },
  description: `${brand.fullName}: verificación preliminar de planos y trámites de construcción.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-PA" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
