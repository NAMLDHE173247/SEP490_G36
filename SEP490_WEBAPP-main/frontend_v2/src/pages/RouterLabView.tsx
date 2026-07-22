import React, { useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Route, Send, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import '../styles/routerlab.css';

type RouterMode = 'rule' | 'llm' | 'hybrid';

type RouterDecision = {
  subject: string;
  secondarySubjects: string[];
  intent: string;
  confidence: number;
  margin: number;
  needClarification: boolean;
  isInterdisciplinary: boolean;
  matchedTerms: string[];
  reason: string;
  strategy: string;
  selectedModel?: string;
  fallbackUsed: boolean;
  llmCalled: boolean;
  latencyMs: number;
};

const modeOptions: Array<{ value: RouterMode; label: string; description: string }> = [
  { value: 'hybrid', label: 'Hybrid', description: 'Rule-based, sau đó AI khi cần' },
  { value: 'rule', label: 'Rule', description: 'Chỉ dùng luật định tuyến' },
  { value: 'llm', label: 'AI', description: 'Dùng AI để phân loại' },
];

export default function RouterLabView() {
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<RouterMode>('hybrid');
  const [decision, setDecision] = useState<RouterDecision | null>(null);
  const [running, setRunning] = useState(false);

  const runRouter = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error('Nhập câu hỏi để thử router.');
      return;
    }

    setRunning(true);
    setDecision(null);
    try {
      const response = await api.post<RouterDecision>('/router/decide', { question: trimmedQuestion, mode });
      setDecision(response.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể chạy Router Lab.';
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="router-lab-page">
      <header className="router-lab-header">
        <div>
          <div className="router-lab-title"><Route size={25} /><h1>Router Lab</h1></div>
          <p>Thử định tuyến một câu hỏi và xem quyết định của router theo thời gian thực.</p>
        </div>
      </header>

      <section className="router-lab-workspace" aria-label="Router playground">
        <div className="router-lab-input-panel">
          <div className="router-lab-section-heading">
            <Sparkles size={18} />
            <div><h2>Kiểm tra câu hỏi</h2><p>Chọn chế độ rồi gửi nội dung cần phân tuyến.</p></div>
          </div>

          <div className="router-lab-mode-group" role="radiogroup" aria-label="Chế độ router">
            {modeOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`router-lab-mode ${mode === option.value ? 'active' : ''}`}
                onClick={() => setMode(option.value)}
                role="radio"
                aria-checked={mode === option.value}
              >
                <strong>{option.label}</strong><span>{option.description}</span>
              </button>
            ))}
          </div>

          <label className="router-lab-question-label" htmlFor="router-lab-question">Câu hỏi của người học</label>
          <textarea
            id="router-lab-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void runRouter();
            }}
            placeholder="Ví dụ: Giải thích vì sao vật rơi tự do có gia tốc không đổi."
            rows={7}
          />
          <div className="router-lab-actions">
            <span>Ctrl/Cmd + Enter để chạy</span>
            <button type="button" className="router-lab-run-button" onClick={() => void runRouter()} disabled={running}>
              {running ? <Loader2 size={17} className="router-lab-spin" /> : <Send size={17} />}
              {running ? 'Đang định tuyến...' : 'Chạy router'}
            </button>
          </div>
        </div>

        <div className="router-lab-result-panel" aria-live="polite">
          {!decision ? (
            <div className="router-lab-empty"><Route size={34} /><h2>Chưa có kết quả</h2><p>Kết quả định tuyến sẽ hiển thị tại đây.</p></div>
          ) : (
            <>
              <div className="router-lab-result-heading"><CheckCircle2 size={20} /><div><span>Kết quả định tuyến</span><h2>{decision.subject}</h2></div></div>
              <div className="router-lab-confidence"><span>Độ tin cậy</span><strong>{Math.round(decision.confidence * 100)}%</strong><div><i style={{ width: `${Math.max(0, Math.min(100, decision.confidence * 100))}%` }} /></div></div>
              <dl className="router-lab-result-grid">
                <div><dt>Ý định</dt><dd>{decision.intent}</dd></div>
                <div><dt>Chiến lược</dt><dd>{decision.strategy}</dd></div>
                <div><dt>AI hỗ trợ</dt><dd>{decision.llmCalled ? 'Có' : 'Không'}</dd></div>
                <div><dt>Thời gian</dt><dd><Clock3 size={14} /> {Math.round(decision.latencyMs)} ms</dd></div>
              </dl>
              {decision.selectedModel && <p className="router-lab-model">Model được chọn: <strong>{decision.selectedModel}</strong></p>}
              {decision.secondarySubjects.length > 0 && <p className="router-lab-secondary">Môn liên quan: {decision.secondarySubjects.join(', ')}</p>}
              <div className="router-lab-reason"><h3>Lý do</h3><p>{decision.reason || 'Router không trả về lý do chi tiết.'}</p></div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
