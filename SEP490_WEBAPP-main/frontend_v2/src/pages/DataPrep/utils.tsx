import React, { useState } from 'react';

export const Tooltip: React.FC<{ children: React.ReactNode; text: string }> = ({ children, text }) => {
  const [show, setShow] = useState(false);
  return (
    <div 
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1e293b', color: '#fff', padding: '8px 12px', borderRadius: '6px',
          fontSize: '12px', width: '250px', zIndex: 1000, textAlign: 'left',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontWeight: 400, lineHeight: 1.5
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', border: '6px solid transparent', borderTopColor: '#1e293b' }} />
        </div>
      )}
    </div>
  );
};

export const cleanVietnameseGreetings = (text: string): string => {
  let cleaned = text.trim();
  const introPatterns = [
    /^(dạ\s+)?chào\s+(thầy|cô|bạn|mọi\s+người)(xuống\s+ạ|ạ)?/i,
    /^(em\s+)?chào\s+(thầy|cô|bạn|mọi\s+người)(xuống\s+ạ|ạ)?/i,
    /^dạ\s+chào\s+ạ/i,
    /^dạ/i,
    /^(thầy|cô)\s+ơi/i,
    /^(cho\s+em|cho\s+mình|cho\s+hỏi)\s+hỏi/i,
    /^thầy\s+cho\s+em\s+hỏi/i,
    /^cô\s+cho\s+em\s+hỏi/i,
    /^cho\s+hỏi/i,
    /^xin\s+chào/i,
    /^hello/i,
    /^hi/i,
    /^alo/i,
    /^hey/i
  ];

  let matched = true;
  while (matched) {
    matched = false;
    for (const pattern of introPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        cleaned = cleaned.substring(match[0].length).trim();
        matched = true;
        break;
      }
    }
  }
  
  cleaned = cleaned.replace(/^[\s,.:;!?~-]+/, '').trim();
  return cleaned || text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
};

export const truncateText = (text: string, limit: number = 150) => {
  if (!text) return '';
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '...';
};

export const highlightSearch = (text: string, query: string) => {
  if (!query || !query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={i} className="search-highlight">{part}</span>
      : part
  );
};

export const getConversationTopic = (messages: any[]) => {
  if (!messages || messages.length === 0) return 'Không có nội dung';
  
  let targetText = '';
  const meaningfulTurn = messages.find(m => {
    const rawText = m.user || '';
    const cleaned = cleanVietnameseGreetings(rawText);
    return cleaned.length >= 5;
  });

  if (meaningfulTurn) {
    targetText = cleanVietnameseGreetings(meaningfulTurn.user);
  } else {
    targetText = cleanVietnameseGreetings(messages[0].user || '');
  }

  if (!targetText) return 'Không có nội dung';
  
  const cleanText = targetText.trim().replace(/^["'\\s]+|["'\\s]+$/g, '');
  if (cleanText.length <= 80) return cleanText;
  
  return cleanText.substring(0, 80).trim() + '...';
};

export const getAssistantSummary = (messages: any[]) => {
  if (!messages || messages.length === 0) return 'Không có phản hồi';
  
  const meaningfulTurn = messages.find(m => m.assistant && m.assistant.trim().length > 0);
  if (!meaningfulTurn) return 'Không có phản hồi';
  
  let text = meaningfulTurn.assistant.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) return 'Chỉ chứa <think>';
  if (text.length <= 80) return text;
  return text.substring(0, 80).trim() + '...';
};

export const getPageNumbers = (current: number, total: number) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
};
