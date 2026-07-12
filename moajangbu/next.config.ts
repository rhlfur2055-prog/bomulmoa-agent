import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 계근대 옆 모바일 사용 전제 — 별도 서버 기능 없음(정적 + 클라이언트에서 Supabase 직접 호출)
  reactStrictMode: true,
};

export default nextConfig;
