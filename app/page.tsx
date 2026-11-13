// 프론트 담당이 교체할 자리표시 페이지입니다. 백엔드 동작 확인용 링크만 둡니다.
export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>교사 인수인계 플랫폼 — 백엔드 확인용</h1>
      <p>화면은 프론트 담당이 만듭니다. API 확인:</p>
      <ul>
        <li>
          <a href="/api/health">/api/health</a> — 서버·데이터 상태
        </li>
        <li>POST /api/chat — 챗봇</li>
        <li>POST /api/upload/extract, /api/upload/draft — 결과보고서 업로드 (P1)</li>
      </ul>
    </main>
  );
}
