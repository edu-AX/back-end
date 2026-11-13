// 프론트 담당이 교체할 자리표시 레이아웃입니다.
export const metadata = { title: "교사 인수인계 플랫폼" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
