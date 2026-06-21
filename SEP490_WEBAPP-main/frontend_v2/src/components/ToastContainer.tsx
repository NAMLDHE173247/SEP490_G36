import React from 'react';
import { Toast } from '../hooks/useToast';

const ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

const COLORS: Record<string, { bg: string; border: string; color: string }> = {
  success: { bg: '#f0fdf4', border: '#86efac', color: '#166534' },
  error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
  info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
  warning: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
};

export default function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
      {toasts.map(t => {
        const c = COLORS[t.type];
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: c.bg, border: `1px solid ${c.border}`, color: c.color,
            borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            animation: 'slideInRight 0.2s ease',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1.4 }}>{ICONS[t.type]}</span>
            <span style={{ lineHeight: 1.5 }}>{t.message}</span>
          </div>
        );
      })}
      <style>{`@keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}
