import type { Metadata } from "next";
import "./globals.css";
import { AIProvider } from "@/components/ai/AIProvider";

export const metadata: Metadata = {
  title: "LearnViz — AI Course Viewer",
  description:
    "Upload a LearnViz curriculum JSON and explore it as a textbook-grade course.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        />
        <script
          src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
          defer
        />
      </head>

      <body>
        <AIProvider>{children}</AIProvider>
      </body>
    </html>
  );
}
