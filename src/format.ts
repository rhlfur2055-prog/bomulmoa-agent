/** 숫자를 '12,000원' 형태로 포맷 */
export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 소요시간 포맷 (예: 3.5h) */
export function hours(n: number): string {
  return `${n}h`;
}
