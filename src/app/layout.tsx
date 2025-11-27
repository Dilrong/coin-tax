import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cointax.vercel.com"),
  title: "코인 세금 계산기 | 한국형 간이 시뮬레이터",
  description:
    "코인 매수·매도 CSV를 업로드하고 예상 세금, 과세표준, 세후 소득을 한눈에 확인하세요. 한국형 간이 과세 모델(기본공제 250만원, 세율 22%) 적용.",
  keywords: [
    "코인 세금 계산",
    "가상자산 세금",
    "암호화폐 세금",
    "코인 과세",
    "가상자산 신고",
    "코인 CSV 업로드",
  ],
  authors: [{ name: "dilrong_" }],
  openGraph: {
    title: "코인 세금 계산기 | 한국형 간이 시뮬레이터",
    description:
      "코인 거래 CSV 업로드로 예상 세금과 세후 소득을 바로 확인하세요. 기본공제 250만원, 세율 22% 적용.",
    locale: "ko_KR",
    type: "website",
    url: "https://cointax.vercel.com",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "코인 세금 계산기" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "코인 세금 계산기 | 한국형 간이 시뮬레이터",
    description:
      "코인 매수·매도 CSV를 업로드하고 예상 세금과 세후 소득을 한 번에 확인하세요.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
      </body>
    </html>
  );
}
