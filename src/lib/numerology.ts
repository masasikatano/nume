import { NUMBER_DATA } from './numberData';

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

/**
 * 2つのライフパスナンバーから相性度（%）を算出する。
 * numberData の相性（good / challenging）を元に決定論的に決める。
 * 同じナンバー同士は自分自身との対話になるため高めに出る。
 */
export function calcCompatibility(a: number, b: number): number {
  const infoA = NUMBER_DATA[a];
  const infoB = NUMBER_DATA[b];
  if (!infoA || !infoB) return 70;

  if (a === b) return 90;

  let score = 72;
  if (infoA.compatibility.good.includes(b)) score += 14;
  if (infoB.compatibility.good.includes(a)) score += 8;
  if (infoA.compatibility.challenging.includes(b)) score -= 14;
  if (infoB.compatibility.challenging.includes(a)) score -= 8;

  return Math.min(98, Math.max(60, score));
}
