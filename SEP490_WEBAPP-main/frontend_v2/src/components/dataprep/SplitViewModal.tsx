import React, { useState, useEffect } from 'react';
import { X, Eye, MessageSquare, Tag, Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import '../../styles/splitview.css';

interface SplitViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string;
  staffId?: string;
  staffName?: string;
}

interface SplitViewData {
  original: {
    messages: Array<{ role: string; content: string }>;
  };
  labeled: {
    sampleLabels: Array<{ name: string; type: string }>;
    messageLabels: Record<number, Array<{ name: string; type: string; role: string }>>;
    rewrites: Record<number, {
      originalText: string;
      proposedText: string;
      approvedText: string;
      editReason: string;
      editType: string;
    }>;
  };
}

export default function SplitViewModal({ isOpen, onClose, sampleId, staffId, staffName }: SplitViewModalProps) {
  const [data, setData] = useState<SplitViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && sampleId) {
      fetchSplitView();
    }
  }, [isOpen, sampleId, staffId]);

  const fetchSplitView = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (staffId) params.staffId = staffId;
      const res = await api.get(`/dataprep/assignments/manager/sample/${sampleId}/split-view`, { params });
      if (res.data.success) {
        setData(res.data.data);
      } else {
        setError(res.data.error || 'Không thể tải dữ liệu');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const messages = data?.original?.messages || [];
  const labeled = data?.labeled;

  const renderMessageBubble = (msg: { role: string; content: string }, index: number, side: 'original' | 'labeled') => {
    const isUser = msg.role === 'user';
    const rewrite = side === 'labeled' && labeled?.rewrites?.[index];
    const msgLabels = side === 'labeled' && labeled?.messageLabels?.[index];

    let displayContent = msg.content;
    if (rewrite && rewrite.approvedText) {
      displayContent = rewrite.approvedText;
    }

    return (
      <div key={index} className={`sv-msg ${isUser ? 'sv-msg-user' : 'sv-msg-assistant'}`}>
        <div className="sv-msg-role">
          <MessageSquare size={12} />
          <span>{isUser ? 'User' : 'Assistant'}</span>
          <span className="sv-msg-idx">#{index}</span>
        </div>
        <div className="sv-msg-content">
          {side === 'labeled' && rewrite && rewrite.approvedText ? (
            <>
              <div className="sv-rewrite-original">
                <del>{rewrite.originalText.substring(0, 200)}{rewrite.originalText.length > 200 ? '...' : ''}</del>
              </div>
              <div className="sv-rewrite-approved">
                {displayContent}
              </div>
              <div className="sv-rewrite-meta">
                <Edit3 size={11} />
                <span>{rewrite.editType === 'ai' ? '🤖 AI Edit' : '✏️ Manual'}</span>
                {rewrite.editReason && <span className="sv-rewrite-reason">— {rewrite.editReason}</span>}
              </div>
            </>
          ) : (
            <>{displayContent}</>
          )}
        </div>
        {msgLabels && Array.isArray(msgLabels) && msgLabels.length > 0 && (
          <div className="sv-msg-labels">
            {msgLabels.map((lbl, li) => (
              <span key={li} className={`sv-label-tag ${lbl.type === 'hard' ? 'hard' : 'soft'}`}>
                <Tag size={10} /> {lbl.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sv-overlay" onClick={onClose}>
      <div className="sv-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sv-header">
          <div className="sv-header-title">
            <Eye size={20} />
            <h3>Split-View: So sánh Bản gốc vs Bản Preview</h3>
          </div>
          {staffName && <span className="sv-staff-badge">👤 {staffName}</span>}
          <button className="sv-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="sv-body">
          {loading && <div className="sv-loading">Đang tải dữ liệu Split-View...</div>}
          {error && <div className="sv-error">{error}</div>}
          {data && (
            <>
              {/* Sample-level labels */}
              {labeled?.sampleLabels && labeled.sampleLabels.length > 0 && (
                <div className="sv-sample-labels">
                  <span className="sv-sample-labels-title">Nhãn cấp Sample:</span>
                  {labeled.sampleLabels.map((lbl, i) => (
                    <span key={i} className={`sv-label-tag ${lbl.type === 'hard' ? 'hard' : 'soft'}`}>
                      <Tag size={10} /> {lbl.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Split columns */}
              <div className="sv-split">
                {/* Left: Original */}
                <div className="sv-panel sv-panel-left">
                  <div className="sv-panel-header original">
                    <span>📄 Bản gốc (Original)</span>
                    <span className="sv-panel-count">{messages.length} tin nhắn</span>
                  </div>
                  <div className="sv-panel-messages">
                    {messages.map((msg, i) => renderMessageBubble(msg, i, 'original'))}
                  </div>
                </div>

                {/* Divider */}
                <div className="sv-divider" />

                {/* Right: Labeled */}
                <div className="sv-panel sv-panel-right">
                  <div className="sv-panel-header labeled">
                    <span>🏷️ Bản Preview (Đã gán nhãn)</span>
                    <span className="sv-panel-count">{messages.length} tin nhắn</span>
                  </div>
                  <div className="sv-panel-messages">
                    {messages.map((msg, i) => renderMessageBubble(msg, i, 'labeled'))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
