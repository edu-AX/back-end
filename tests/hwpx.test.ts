import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractHwpxText, HwpxError } from "@/lib/upload/hwpx";

const section = (paras: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p">${paras.join("")}</hs:sec>`;
const para = (inner: string) => `<hp:p id="1"><hp:run charPrIDRef="0">${inner}</hp:run></hp:p>`;
const t = (s: string) => `<hp:t>${s}</hp:t>`;

function makeHwpx(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = { mimetype: strToU8("application/hwp+zip") };
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  return zipSync(entries);
}

describe("hwpx 본문 추출", () => {
  it("문단별로 글자를 뽑는다", () => {
    const buf = makeHwpx({
      "Contents/section0.xml": section([para(t("2학년 수학여행 결과보고")), para(t("사전답사 때 비상구 확인이 늦었음"))]),
    });
    expect(extractHwpxText(buf)).toBe("2학년 수학여행 결과보고\n사전답사 때 비상구 확인이 늦었음");
  });

  it("section 이 여러 개면 번호 순서대로 이어 붙인다 (section10 이 section2 뒤)", () => {
    const buf = makeHwpx({
      "Contents/section10.xml": section([para(t("열"))]),
      "Contents/section2.xml": section([para(t("둘"))]),
      "Contents/section0.xml": section([para(t("영"))]),
    });
    expect(extractHwpxText(buf)).toBe("영\n둘\n열");
  });

  it("글자 조각·탭·줄바꿈·XML 기호를 처리한다", () => {
    const buf = makeHwpx({
      "Contents/section0.xml": section([
        para(`${t("동의율")}<hp:tab/>${t("86%")}`),
        para(`${t("1줄")}<hp:lineBreak/>${t("2줄")}`),
        para(t("A &amp; B &lt;안전&gt; &#44032;")),
        para(`<hp:t><hp:char>중첩</hp:char>글자</hp:t>`),
      ]),
    });
    expect(extractHwpxText(buf)).toBe("동의율 86%\n1줄\n2줄\nA & B <안전> 가\n중첩글자");
  });

  it("빈 문단은 건너뛴다", () => {
    const buf = makeHwpx({ "Contents/section0.xml": section([para(""), para(t("  ")), para(t("본문"))]) });
    expect(extractHwpxText(buf)).toBe("본문");
  });

  it("hwpx 가 아닌 파일·본문이 없는 zip 은 HwpxError", () => {
    expect(() => extractHwpxText(strToU8("그냥 글자"))).toThrow(HwpxError);
    expect(() => extractHwpxText(makeHwpx({ "Contents/header.xml": "<a/>" }))).toThrow(HwpxError);
  });

  it("추출한 글자는 마스킹 파이프라인에 그대로 넘길 수 있다", async () => {
    const { maskPersonalInfo } = await import("@/lib/masking");
    const buf = makeHwpx({ "Contents/section0.xml": section([para(t("담당 김철수 연락처 010-1234-5678"))]) });
    const masked = maskPersonalInfo(extractHwpxText(buf)).maskedText;
    expect(masked).not.toContain("010-1234-5678");
  });
});
