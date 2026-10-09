const MIN_DATE = '1900-01-01';

function toDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.getTime())) return null;
  // 月日の桁違い（例: 2020-02-30）を弾く
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return null;
  return parsed;
}

export function isValidBirthdate(date: string): boolean {
  const d = toDate(date);
  if (!d) return false;
  const min = new Date(`${MIN_DATE}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= min && d <= today;
}

/**
 * 生年月日（YYYY-MM-DD）の全桁を合計し、1〜9 の一桁に還元する。
 * マスターナンバー（11/22/33）は採用しない。
 * 例: 1985-04-23 → 1+9+8+5+0+4+2+3 = 32 → 3+2 = 5
 */
export function calcLifePath(date: string): number {
  const sum = date.replace(/-/g, '').split('').reduce((acc, ch) => acc + Number(ch), 0);
  let n = sum;
  while (n > 9) {
    n = String(n).split('').reduce((acc, ch) => acc + Number(ch), 0);
  }
  return n;
}
