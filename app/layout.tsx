import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import DashboardShell, { type Collab } from "@/client/dashboard-shell";
import { currentUserWorkspace } from "@/lib/auth";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Papertrail",
  description: "A calmer, private workspace for your notes and ideas.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const bootstrap = await currentUserWorkspace().catch(() => null);
  const collabs: Collab[] | null = bootstrap?.workspace ? [bootstrap.workspace] : [];
  return <html lang="en"><body className={nunito.variable}><DashboardShell initialCollabs={collabs} initialUser={bootstrap?.user ?? null}>{children}</DashboardShell></body></html>;
}
