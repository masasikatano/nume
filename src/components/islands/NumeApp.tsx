import { useEffect, useRef, useState } from 'react';
import { calcLifePath, isValidBirthdate } from '@/lib/numerology';
import { getNumberInfo } from '@/lib/numberData';

type Phase = 'input' | 'reading' | 'done' | 'error';
type Mode = 'solo' | 'compat';

interface CompatInfo {
  n1: number;
  n2: number;
  score: number;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function NumeApp() {
  const mainRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [birthdate, setBirthdate] = useState('');
  const [birthdate2, setBirthdate2] = useState('');
  const [mode, setMode] = useState<Mode>('solo');
  const [lifePath, setLifePath] = useState<number | null>(null);
  const [compat, setCompat] = useState<CompatInfo | null>(null);
  const [reading, setReading] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!isValidBirthdate(birthdate)) {
      setError('1900年1月1日以降の、正しい生年月日を入力してください。');
      return;
    }
    if (mode === 'compat') {
      if (!isValidBirthdate(birthdate2)) {
        setError('2人目の生年月日も、1900年1月1日以降の正しい日付で入力してください。');
        return;
      }
      void runReading(birthdate, birthdate2);
      return;
    }
    void runReading(birthdate);
  };

  const handleRetry = () => {
    if (!lifePath) return;
    void runReading(birthdate, mode === 'compat' ? birthdate2 : undefined);
  };

  const handleReset = () => {
    abortControllerRef.current?.abort();
    setBirthdate('');
    setBirthdate2('');
    setLifePath(null);
    setCompat(null);
    setReading('');
    setPhase('input');
    setError(null);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function runReading(date: string, date2?: string) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const n = calcLifePath(date);
    setLifePath(n);
    setCompat(null);
    setBirthdate(date);
    setReading('');
    setError(null);
    setPhase('reading');
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

    let streamed = '';

    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(date2 ? { birthdate: date, birthdate2: date2 } : { birthdate: date }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string } | string;
        };
        const message =
          typeof data?.error === 'string'
            ? data.error
            : (data?.error?.message ?? `サーバーエラー (${res.status})`);
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const lines = event.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
          const dataStr = dataLines.join('\n');
          if (!dataStr) continue;

          if (eventName === 'done') {
            setReading(streamed);
            setPhase('done');
            continue;
          }

          try {
            const data = JSON.parse(dataStr) as {
              type?: string;
              n1?: number;
              n2?: number;
              score?: number;
              text?: string;
              error?: { message?: string };
            };
            if (data.type === 'compat' && data.n1 && data.n2 && data.score !== undefined) {
              setCompat({ n1: data.n1, n2: data.n2, score: data.score });
            } else if (data.text) {
              streamed += data.text;
              setReading(streamed);
            } else if (data.error?.message) {
              throw new Error(data.error.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      if (phase !== 'done') {
        // ストリーム終端まで done が来なかった場合も、読んだ分は表示
        setReading(streamed);
        setPhase(streamed ? 'done' : 'error');
        if (!streamed) {
          setError('通信が中断されました。もう一度お試しください。');
        }
      }
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === 'AbortError') return;
      console.error('Reading error', err);
      setError(err?.message ?? '予期せぬエラーが発生しました。時間をおいてからお試しください。');
      setPhase('error');
    }
  }

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const numberInfo = lifePath ? getNumberInfo(lifePath) : undefined;
  const compatNumberInfo1 = compat ? getNumberInfo(compat.n1) : undefined;
  const compatNumberInfo2 = compat ? getNumberInfo(compat.n2) : undefined;
  const showResult = phase !== 'input';

  return (
    <div className="nume-app">
      <header className="nume-header">
        <div className="text-[17px] font-bold tracking-tight">nume</div>
        {phase !== 'input' && (
          <button onClick={handleReset} className="reset-btn" aria-label="最初からやり直す">
            最初から
          </button>
        )}
      </header>

      <main ref={mainRef} className="nume-main">
        {!showResult && (
          <>
            <div className="intro">
              <div className="hero-icon" aria-hidden="true">✦</div>
              <h1 className="hero-title">数字が語る、あなたの物語</h1>
              <p className="hero-subtitle">
                生年月日を入力するだけ。ライフパスナンバーがあなたの強みと使命を、ふたりなら絆の相性を教えてくれます。
              </p>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="占いの種類">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'solo'}
                className={`mode-tab${mode === 'solo' ? ' mode-tab-active' : ''}`}
                onClick={() => { setMode('solo'); setError(null); }}
              >
                ひとりで占う
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'compat'}
                className={`mode-tab${mode === 'compat' ? ' mode-tab-active' : ''}`}
                onClick={() => { setMode('compat'); setError(null); }}
              >
                ふたりで相性
              </button>
            </div>

            <div className="section-divider"><span>生年月日を入力</span></div>

            <div className="birth-form">
              <label className="birth-label" htmlFor="birthdate">
                あなたの生年月日
              </label>
              <input
                id="birthdate"
                type="date"
                className="birth-input"
                min="1900-01-01"
                max={todayStr()}
                value={birthdate}
                onChange={(e) => {
                  setBirthdate(e.target.value);
                  setError(null);
                }}
              />
              {mode === 'compat' && (
                <>
                  <label className="birth-label" htmlFor="birthdate2">
                    お相手の生年月日
                  </label>
                  <input
                    id="birthdate2"
                    type="date"
                    className="birth-input"
                    min="1900-01-01"
                    max={todayStr()}
                    value={birthdate2}
                    onChange={(e) => {
                      setBirthdate2(e.target.value);
                      setError(null);
                    }}
                  />
                </>
              )}
              {error && <div className="error-banner">{error}</div>}
              <button
                type="button"
                className="action-btn action-btn-primary"
                onClick={handleSubmit}
                disabled={mode === 'compat' ? !birthdate || !birthdate2 : !birthdate}
              >
                {mode === 'compat' ? '相性を占う' : '占う'}
              </button>
            </div>
          </>
        )}

        {showResult && compat && compatNumberInfo1 && compatNumberInfo2 && (
          <div className="reading-result">
            <h2 className="result-title">
              <span>2人のライフパスナンバー</span>
            </h2>

            <div className="number-hero" aria-live="polite">
              <div className="compat-pair">
                <div className="compat-side">
                  <div className="number-hero-digit compat-digit">{compat.n1}</div>
                  <div className="number-hero-keyword">{compatNumberInfo1.keyword}</div>
                </div>
                <div className="compat-cross" aria-hidden="true">×</div>
                <div className="compat-side">
                  <div className="number-hero-digit compat-digit">{compat.n2}</div>
                  <div className="number-hero-keyword">{compatNumberInfo2.keyword}</div>
                </div>
              </div>

              <div className="compat-score" aria-live="polite">
                <div className="compat-score-label">相性度</div>
                <div className="compat-score-value">{compat.score}<span className="compat-score-unit">%</span></div>
                <div
                  className="compat-gauge"
                  role="progressbar"
                  aria-valuenow={compat.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="compat-gauge-fill" style={{ width: `${compat.score}%` }} />
                </div>
              </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="reading-text" aria-live="polite">
              {reading ? (
                reading.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="fade-in-paragraph">{para}</p>
                ))
              ) : phase === 'reading' ? (
                <span className="loading">
                  数秘術師が2人の数字を読んでいます<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                </span>
              ) : null}
            </div>

            <p className="disclaimer">
              この結果はエンターテインメントと内省のきっかけであり、医療・法律・金融などの専門的な助言ではありません。
            </p>

            <div className="result-actions">
              {phase === 'error' && (
                <button type="button" onClick={handleRetry} className="retry-btn">
                  もう一度試す
                </button>
              )}
              {phase === 'done' && (
                <button type="button" onClick={handleReset} className="action-btn action-btn-primary">
                  もう一度占う
                </button>
              )}
            </div>
          </div>
        )}

        {showResult && !compat && lifePath && numberInfo && (
          <div className="reading-result">
            <h2 className="result-title">
              <span>あなたのライフパスナンバー</span>
            </h2>

            <div className="number-hero" aria-live="polite">
              <div className="number-hero-digit">{lifePath}</div>
              <div className="number-hero-keyword">{numberInfo.keyword}</div>
              <a href={`/numbers/${lifePath}`} className="number-hero-link">
                ナンバー{lifePath}の詳しい解説を見る →
              </a>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="reading-text" aria-live="polite">
              {reading ? (
                reading.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="fade-in-paragraph">{para}</p>
                ))
              ) : phase === 'reading' ? (
                <span className="loading">
                  数秘術師があなたの数字を読んでいます<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                </span>
              ) : null}
            </div>

            <p className="disclaimer">
              この結果はエンターテインメントと内省のきっかけであり、医療・法律・金融などの専門的な助言ではありません。
            </p>

            <div className="result-actions">
              {phase === 'error' && (
                <button type="button" onClick={handleRetry} className="retry-btn">
                  もう一度試す
                </button>
              )}
              {phase === 'done' && (
                <>
                  <button type="button" onClick={handleReset} className="action-btn action-btn-primary">
                    もう一度占う
                  </button>
                  <a href={`/numbers/${lifePath}`} className="action-btn action-btn-secondary number-link-btn">
                    ナンバー{lifePath}「{numberInfo.keyword}」の解説ページへ
                  </a>
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
