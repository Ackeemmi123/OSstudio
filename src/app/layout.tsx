import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { WorkspaceGate } from "@/components/providers/workspace-gate";
import { ToastProvider } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: BRAND.product, template: `%s · ${BRAND.product}` },
  description: `${BRAND.company} ${BRAND.product}: clients, projects and the next step for each.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <ToastProvider>
          <WorkspaceGate>
            <AppShell>{children}</AppShell>
          </WorkspaceGate>
        </ToastProvider>
      </body>
    </html>
  );
}
