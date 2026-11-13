# 교사 인수인계 플랫폼 — 백엔드 (`edu-AX/back-end`)

창의적 체험활동부의 행사 업무를 작년 기록과 올해 기준으로 묶어서, 올해 담당자에게 넘겨주는 교사용 인수인계 플랫폼의 **백엔드**예요.
화면(UI)은 [`edu-AX/front-end`](https://github.com/edu-AX/front-end)에 있어요.

## 두 저장소의 역할

```
┌────────────────────── edu-AX/front-end (포트 3000) ──────────────────────┐
│ 화면: 인수인계 받기, 대시보드, 캘린더, 행사 카드, 캐릭터·챗봇 창, 업로드 창     │
│ 브라우저 상태(localStorage) · lib/storage.ts 어댑터                         │
│ lib/ 공유 파일 15개 ← npm run sync:backend 로 이 저장소의 특정 커밋에서 복사    │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ fetch  NEXT_PUBLIC_API_BASE_URL + /api/...
               ▼
┌────────────────────── edu-AX/back-end (포트 3001, 이 저장소) ─────────────┐
│ /api/chat            인수인계 챗봇 (Gemini, 등록 자료 안에서만, 출처 칩, DEMO_MODE) │
│ /api/upload/extract  결과보고서 PDF/txt → 개인정보 마스킹 미리보기             │
│ /api/upload/draft    마스킹 텍스트 → 행사 카드 초안 (작년 기록으로 넘어감)        │
│ /api/health          상태 확인                                             │
│ lib/  도메인 로직 원본 (타입·D-day 역산·대시보드·인수인계·마스킹·챗봇)           │
│ data/ 샘플 데이터 원본 (행사·단계 템플릿·지침·변경 알림)                        │
│ GEMINI_API_KEY 는 여기에만 (프론트에는 키가 없음)                              │
└──────────────────────────────────────────────────────────────────────────┘
```

- **원본은 백엔드예요.** 타입이나 계산 로직, 데이터를 바꿀 때는 이 저장소에서 고치고 테스트한 뒤 push해요.
- 그다음 프론트에서 `npm run sync:backend -- --latest`를 실행하면, 프론트의 `backend.lock.json`이 새 커밋을 가리키고 공유 파일이 갱신돼요.
- 프론트가 가져가는 공유 파일 15개는 프론트의 `backend.lock.json` → `files`에 적혀 있어요.
  - `lib/types.ts`, `dates.ts`, `data.ts`, `schedule.ts`, `dashboard.ts`, `handover.ts`, `masking.ts`, `school-info.ts`, `upload/draft.ts`, `chat/prompt.ts`, `chat/messages.ts`
  - `data/*.json` 4개
- 이 파일들 안에서 import 경로를 바꾸거나 서버 전용 코드(`server-only`)를 넣으면 프론트가 깨져요. 서버 전용 코드는 `lib/chat/llm.ts`, `lib/env.ts`, `lib/upload/extract.ts`처럼 공유 목록 밖의 파일에 두세요.

## 공식 기준 변경 감지 (`POST /api/updates/check`)

공식 출처(`data/official-sources.json`: 국가법령정보센터, 교육부 보도자료, 학생부 종합지원포털, 인천교육청 공지)를 확인해요. AI가 **기준 변경 후보**를 영향 행사·단계, 시행/추진 중으로 정리해요.

- **담당자가 화면에서 "변경 알림에 추가"해야 반영돼요.** AI가 기준 값을 자동으로 덮어쓰지 않아요.
- **지금은 시연용 스냅샷으로 동작해요:** `data/update-snapshots/moe-2026-05-28.json` (교육부 현장체험학습 교원 지원 방안).
  - 실제 수집은 `lib/updates/sources.ts`의 `lawApiAdapter`(국가법령정보센터 Open API)와 `pressListAdapter`(정책브리핑 교육부 부처뉴스)를 구현하면 돼요. 지금은 `not implemented`예요.
  - `DEMO_MODE`이거나 키가 없으면 스냅샷 후보를 그대로 써요. 키가 있으면 Gemini가 요약을 읽고 후보를 만들고(zod 검증), 실패하면 스냅샷으로 대체해요.
- `// TODO: 정책브리핑 원문 링크` — 스냅샷 `url`이 비어 있어서 화면의 "원문 보기"가 비활성이에요. 원문 링크를 찾아서 `data/update-snapshots/moe-2026-05-28.json`의 `url`에 채우세요.
- 스냅샷 `summary`는 직접 쓴 한 줄 요약이에요. **보도자료 원문 문장은 넣지 않아요.**

## 실행

```bash
npm install
cp .env.example .env.local    # GEMINI_API_KEY 채우기 (없으면 DEMO_MODE=true)
npm test                      # 계산·마스킹·챗봇 규칙·데모 질문 테스트
npm run dev                   # http://localhost:3001/api/health
```

프론트와 같이 돌릴 때는 백엔드(3001)를 먼저 띄우고, 프론트 폴더에서 `npm run dev`(3000)를 실행하세요.

## 환경변수

| 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | Gemini API 키. **서버에서만** 읽어요. |
| `GEMINI_MODEL` | 비우면 `gemini-3.5-flash-lite` |
| `DEMO_MODE` | `true`면 AI를 부르지 않고 고정 답을 줘요. 발표용이에요. |
| `ALLOWED_ORIGINS` | 이 API를 부를 수 있는 프론트 주소(CORS). 쉼표로 여러 개 넣을 수 있고, 비우면 `http://localhost:3000`만 허용해요. 예: `https://edu-ax-front.vercel.app` |
| `NEXT_PUBLIC_DEMO_TODAY` | 데모 기준일 `2027-03-11`. 프론트와 같은 값으로 두세요. |

## 배포 (Vercel 프로젝트 2개)

1. **백엔드**: `edu-AX/back-end`를 Import하고 위 환경변수를 넣어요. `ALLOWED_ORIGINS`에는 프론트 배포 주소를 넣어요.
2. **프론트**: `edu-AX/front-end`를 Import하고 `NEXT_PUBLIC_API_BASE_URL`에 백엔드 배포 주소를 넣어요.
3. 백엔드 주소 + `/api/health`가 `ok: true`인지 확인하고, 프론트에서 챗봇에 질문해서 답이 오는지 확인해요.

## 폴더

| 경로 | 내용 |
|---|---|
| `data/` | 샘플 데이터 (가상 학교 "인덕고등학교", 인천광역시교육청 소속으로 가정. 학교 이름은 `lib/school-info.ts`) |
| `lib/` | 공통 타입, D-day 역산, 대시보드·캘린더 계산, 인수인계(작년 기록·인수 요약·작년 이맘때·넘기기), 마스킹, 챗봇 로직 |
| `app/api/*` | API 라우트 |
| `proxy.ts` | `/api/*` CORS (Next.js 16의 middleware 대체) |
| `tests/` | vitest 테스트 |
| `docs/` | [설정 가이드](docs/설정_가이드.md), [프론트 전달사항](docs/프론트_전달사항.md) |
