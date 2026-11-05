import { useEffect, useState } from "react";

/**
 * Displayed only during the initial server-rendered page hydration.
 * Does not reappear on client-side navigation and does not delay the UI.
 */
export function StartupSplash() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`startup-splash${ready ? " startup-splash--ready" : ""}`}
      role="status"
      aria-label="Iniciando CryptoBot"
    >
      <div className="startup-splash__logo" aria-hidden="true">
        <img
          className="startup-splash__mark"
          src="/icon-512.png?v=3d-1"
          width={512}
          height={512}
          alt=""
          fetchPriority="high"
        />
        <img
          className="startup-splash__candles"
          src="/cryptobot-candles-overlay.gif?v=1"
          width={160}
          height={160}
          alt=""
        />
      </div>
      <p className="startup-splash__caption">Iniciando CryptoBot</p>
    </div>
  );
}
