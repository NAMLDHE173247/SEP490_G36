import React from 'react';
import { Loader2, CheckCircle, ChevronDown, ChevronRight, X, Play, RefreshCw, Eye, ExternalLink, Settings, Download, Trash2, Edit2, Check, ArrowRight, AlertTriangle, User, Bot, Info, FileText, Search, RotateCcw, Zap, Inbox, MousePointer2, MessageSquare, Award, BookOpen, Sparkles, BarChart2, Pencil, Ban, Upload } from 'lucide-react';

export const Stage6Finish = ({setActiveTab,
  setCurrentStage,
  setCurrentSubStep5}: any) => {
  
    return (
      <div className="dataprep-stage2 sep490-stage" style={{ textAlign: 'center', padding: '60px 40px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', marginBottom: '24px', boxShadow: '0 8px 20px rgba(34,197,94,0.3)' }}>
          <Check size={40} />
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: '0 0 12px 0', fontFamily: 'Outfit, sans-serif' }}>Dataset Preparation Completed!</h2>
        <p style={{ fontSize: '15px', color: '#64748b', maxWidth: '600px', margin: '0 auto 32px auto', lineHeight: '1.6' }}>
          Congratulations! Your dataset is fully processed, evaluated, and ready for model training. The safe split has been established and exported successfully.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <button onClick={() => { setCurrentStage(5); setCurrentSubStep5(13); }}
            style={{ padding: '14px 28px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', transition: 'all 0.2s' }}>
            &larr; Back to Export
          </button>
          {setActiveTab && (
            <button onClick={() => setActiveTab('AutoTrain')}
              style={{ padding: '14px 32px', fontSize: '15px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 6px 20px rgba(79,70,229,0.35)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
              Proceed to AutoTrain <Zap size={16} />
            </button>
          )}
        </div>
      </div>
    );
  ;
};
