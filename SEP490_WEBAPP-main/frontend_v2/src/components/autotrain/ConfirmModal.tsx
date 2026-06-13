import React, { useEffect, useCallback, useRef } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import type { TrainingConfig, PreviewData } from './types';

// ── Types ──────────────────────────────────────────────────────
interface ConfirmModalProps {
  isOpen: boolean;
  config: TrainingConfig;
  previewData: PreviewData;
  presetName: string;
  estimatedTime: string;
  gpuOnline: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

/** Extract the short model name after the last "/" */
function shortModelName(fullId: string): string {
  const parts = fullId.split('/');
  return parts[parts.length - 1] || fullId;
}

/** Determine which dataset name to display */
function datasetLabel(config: TrainingConfig): string {
  if (config.datasetSource === 'local' && config.localFile) {
    return config.localFile.name;
  }
  if (config.datasetSource === 'hub' && config.selectedHfDataset) {
    return config.selectedHfDataset;
  }
  if (config.datasetSource === 'cloud' && config.cloudLoadedDataset) {
    return config.cloudLoadedDataset;
  }
  return '—';
}

// ── Component ──────────────────────────────────────────────────
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  config,
  previewData,
  presetName,
  estimatedTime,
  gpuOnline,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Trap focus inside the modal when opened
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const firstFocusable = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build the summary rows
  const summaryRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Model',          value: shortModelName(config.baseModel) },
    { label: 'Dataset',        value: datasetLabel(config) },
    {
      label: 'Records',
      value:
        previewData.totalRecords != null
          ? previewData.totalRecords.toLocaleString()
          : '—',
    },
    {
      label: 'Tokens',
      value:
        previewData.totalTokens != null
          ? previewData.totalTokens.toLocaleString()
          : '—',
    },
    { label: 'Preset',         value: presetName },
    { label: 'Estimated Time', value: estimatedTime },
    {
      label: 'GPU Status',
      value: gpuOnline ? (
        <span className="at-status-online">Online</span>
      ) : (
        <span className="at-status-offline">Offline</span>
      ),
    },
  ];

  return (
    <div
      className="at-modal-backdrop"
      onClick={onCancel}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        className="at-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="at-modal-header">
          <Zap size={22} aria-hidden="true" />
          <h2 id="at-confirm-title">Confirm Training</h2>
        </div>

        {/* ── Body ── */}
        <div className="at-modal-body">
          <dl className="at-modal-summary">
            {summaryRows.map(({ label, value }) => (
              <div className="at-modal-summary-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {/* GPU offline warning */}
          {!gpuOnline && (
            <div className="at-modal-warning" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>No GPU connected. Training may fail.</span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="at-modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            className="at-btn-history"
            onClick={onCancel}
            style={{ padding: '10px 18px', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="at-btn-primary"
            onClick={onConfirm}
            style={{ padding: '10px 18px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ⚡ Start Training
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
