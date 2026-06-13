import React, { useCallback } from 'react';
import { Sparkles, Upload, Settings2, Zap } from 'lucide-react';

// ── LocalStorage key ───────────────────────────────────────────
const DISMISS_KEY = 'at-welcome-dismissed';

// ── Types ──────────────────────────────────────────────────────
interface WelcomeCardProps {
  onDismiss: () => void;
  onDownloadSample: () => void;
}

// ── Step descriptions ──────────────────────────────────────────
const INTRO_STEPS: { Icon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number | string }>; text: string }[] = [
  { Icon: Upload,   text: 'Upload your conversation dataset' },
  { Icon: Settings2, text: 'Choose an AI model and configure' },
  { Icon: Zap,       text: 'Press Train and wait for results!' },
];

// ── Component ──────────────────────────────────────────────────
const WelcomeCard: React.FC<WelcomeCardProps> = ({
  onDismiss,
  onDownloadSample,
}) => {
  const handleDontShowAgain = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // Storage may be unavailable — silently continue
    }
    onDismiss();
  }, [onDismiss]);

  return (
    <section className="at-welcome" aria-label="Welcome to AutoTrain">
      {/* Gradient header area */}
      <div className="at-welcome-header">
        <span className="at-welcome-icon-circle" aria-hidden="true">
          <Sparkles size={28} />
        </span>
        <h2 className="at-welcome-title">Welcome to AutoTrain!</h2>
        <p className="at-welcome-subtitle">
          Create your own AI tutor from your teaching data in 3 simple steps:
        </p>
      </div>

      {/* 3 numbered intro steps */}
      <ol className="at-welcome-steps">
        {INTRO_STEPS.map(({ Icon, text }, idx) => (
          <li key={idx} className="at-welcome-step">
            <span className="at-welcome-step-num" aria-hidden="true">
              {idx + 1}
            </span>
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ol>

      {/* Action buttons */}
      <div className="at-welcome-actions">
        <button
          type="button"
          className="at-btn at-btn-outline"
          onClick={onDownloadSample}
          aria-label="Download sample dataset"
        >
          Download Sample Data
        </button>

        <button
          type="button"
          className="at-btn at-btn-primary"
          onClick={onDismiss}
        >
          Get Started
        </button>
      </div>

      {/* "Don't show again" link */}
      <div className="at-welcome-dismiss-row">
        <button
          type="button"
          className="at-link-subtle"
          onClick={handleDontShowAgain}
        >
          Don&apos;t show again
        </button>
      </div>
    </section>
  );
};

export default WelcomeCard;
