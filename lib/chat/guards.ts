// 프롬프트에만 맡기지 않고 코드로 거는 안전장치

/** 학생·학부모 개인정보를 묻는 질문인지 (LLM에 보내기 전에 차단) */
export function isPersonalInfoQuestion(q: string): boolean {
  const s = q.replace(/\s+/g, " ");
  const person = "(학생|학부모|보호자|아이|애들|담임반|우리 반)";
  const info = "(이름|성함|연락처|전화|휴대폰|핸드폰|번호|주소|명단|건강|병력|질환|알레르기|비상 ?연락)";
  if (new RegExp(`${person}[^.?!]{0,12}${info}`).test(s)) return true;
  if (new RegExp(`${info}[^.?!]{0,8}${person}`).test(s) && !/학생부/.test(s)) return true;
  // "누가 동의 안 했어?", "미동의자 알려줘"
  if (/(누가|누구|어떤 (학생|학부모)).{0,10}(동의|미동의|안 ?냈|불참|빠졌)/.test(s)) return true;
  if (/미동의자|불참자 명단|참가자 명단/.test(s)) return true;
  return false;
}

/** 책임·면책·소송 등 법적 판단이 걸린 질문인지 (답변 끝에 고정 문구를 붙임) */
export function isLegalQuestion(q: string): boolean {
  return /(책임|면책|소송|처벌|배상|과실|고소|징계|법적|법률|형사|민사)/.test(q);
}
