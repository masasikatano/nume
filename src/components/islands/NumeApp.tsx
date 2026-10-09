import { useEffect, useRef, useState } from 'react';
import { calcLifePath, isValidBirthdate } from '@/lib/numerology';
import { getNumberInfo } from '@/lib/numberData';

type Phase = 'input' | 'reading' | 'done' | 'error';

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
  const [lifePath, setLifePath] = useState<number | null>(null);
  const [reading, setReading] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!isValidBirthdate(birthdate)) {
      setError('1900年1月1日以降の、正しい生年月日を入力してください。');
      return;
    }
    void runReading(birthdate);
  };

  const handleRetry = () => {
    if (!lifePath) return;
    void runReading(birthdate);
  };

  const handleReset = () => {
    abortControllerRef.current?.abort();
    setBirthdate('');
    setLifePath(null);
    setReading('');
    setPhase('input');
    setError(null);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function runReading(date: string) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const n = calcLifePath(date);
    setLifePath(n);
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
        body: JSON.stringify({ birthdate: date }),
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
            const data = JSON.parse(dataStr) as { text?: string; error?: { message?: string } };
            if (data.text) {
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
                生年月日を入力するだけ。ライフパスナンバーがあなたの強みと使命を教えてくれます。
              </p>
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
              {error && <div className="error-banner">{error}</div>}
              <button
                type="button"
                className="action-btn action-btn-primary"
                onClick={handleSubmit}
                disabled={!birthdate}
              >
                占う
              </button>
            </div>
          </>
        )}

        {showResult && lifePath && numberInfo && (
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

        <footer className="nume-footer">
          <div>占いは利用者の特定の目的に適合すること、期待する結果・正確性・実現性を有すること及び不都合が生じない事について、何らの保証をするものではありません。</div>
          <div>© nume</div>
        </footer>
      </main>
    </div>
  );
}
