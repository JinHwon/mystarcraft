/** 감독 랭킹에 보이는 이름: 로그인 아이디라서 뒤쪽 절반을 *로 가림 (본인은 그대로) */
export function maskName(name: string): string {
  const chars = [...name];
  const keep = Math.max(1, Math.ceil(chars.length / 2));
  return chars.slice(0, keep).join("") + "*".repeat(Math.max(1, chars.length - keep));
}
