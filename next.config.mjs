/** @type {import('next').NextConfig} */
const nextConfig = {
  // unpdf는 서버에서만 쓰므로 번들에서 제외
  serverExternalPackages: ["unpdf"],
  // 상위 폴더에 다른 package-lock.json 이 있어도 이 폴더를 프로젝트 루트로 쓰게 고정
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
