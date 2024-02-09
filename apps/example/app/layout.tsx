import type { Metadata } from "next";
import "./global.css";

export const metadata: Metadata = {
  title: "React Fabric Fiber",
  description: "A React Renderer for Fabric.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
