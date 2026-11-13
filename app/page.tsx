// 백엔드 전용 저장소의 첫 화면. 화면(UI)은 edu-AX/front-end 에 있다.
export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <h1>교사 인수인계 플랫폼 — 백엔드 API</h1>
      <p>
        이 서버는 API 만 제공합니다. 화면은{" "}
        <a href="https://github.com/edu-AX/front-end">edu-AX/front-end</a> 에서 실행하세요.
      </p>
      <ul>
        <li><a href="/api/health">GET /api/health</a> — 서버·데이터 상태</li>
        <li>POST /api/chat — 인수인계 챗봇</li>
        <li>POST /api/upload/extract, /api/upload/draft — 결과보고서 업로드</li>
      </ul>
    </main>
  );
}
