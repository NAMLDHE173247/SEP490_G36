import React from 'react';
import '../styles/chat.css';

export function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status" aria-label="AI dang tra loi">
      <span className="typing-loader" aria-hidden="true"></span>
      <span className="typing-loader" aria-hidden="true"></span>
      <span className="typing-loader" aria-hidden="true"></span>
    </div>
  );
}
