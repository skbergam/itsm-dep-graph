import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITSM Dependency Graph",
  description: "Hierarchical task dependency visualization with Blocked emphasis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
