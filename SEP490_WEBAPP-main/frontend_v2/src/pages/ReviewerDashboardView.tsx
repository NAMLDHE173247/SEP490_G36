import React from 'react';
import { ClipboardCheck, Activity, Users, FileCheck, ShieldAlert } from 'lucide-react';
import '../styles/reviewer.css';

function ReviewerDashboardView() {
  return (
    <div className="reviewer-container">
      {/* Header */}
      <div className="reviewer-header">
        <div className="reviewer-title-group">
          <h2>Reviewer Dashboard</h2>
          <p className="reviewer-subtitle">Hệ thống phê duyệt chất lượng dữ liệu & đánh giá hội thoại</p>
        </div>
        <div className="reviewer-status-badge">
          <div className="reviewer-pulse-dot"></div>
          <span>Reviewer Mode Active</span>
        </div>
      </div>

      {/* Main Feature Placeholder */}
      <div className="reviewer-card">
        <div className="reviewer-icon-wrapper">
          <ClipboardCheck size={40} />
        </div>
        <h3>Trang quản trị Reviewer đang được phát triển</h3>
        <p>
          Chào mừng bạn đến với giao diện dành cho vai trò <strong>Reviewer</strong>. 
          Các tính năng chính thức bao gồm duyệt nhãn dữ liệu, đối soát lịch sử gán nhãn, 
          và đánh giá chất lượng hội thoại (RLHF) đang được cập nhật và sẽ sớm xuất hiện tại đây.
        </p>
        
        <div className="reviewer-progress-bar">
          <div className="reviewer-progress-fill"></div>
        </div>
        <span className="reviewer-progress-text">Giai đoạn phát triển: Thiết lập Hệ thống</span>
      </div>

      {/* Mock Indicator Grid */}
      <div className="reviewer-grid">
        <div className="reviewer-mini-card blue">
          <div className="mini-icon">
            <FileCheck size={20} />
          </div>
          <div className="mini-content">
            <div className="mini-title">Hội thoại chờ duyệt</div>
            <div className="mini-value-skeleton"></div>
          </div>
          <span className="mini-badge">Sắp ra mắt</span>
        </div>

        <div className="reviewer-mini-card purple">
          <div className="mini-icon">
            <ShieldAlert size={20} />
          </div>
          <div className="mini-content">
            <div className="mini-title">Yêu cầu phản biện (IAA)</div>
            <div className="mini-value-skeleton"></div>
          </div>
          <span className="mini-badge">Sắp ra mắt</span>
        </div>

        <div className="reviewer-mini-card green">
          <div className="mini-icon">
            <Activity size={20} />
          </div>
          <div className="mini-content">
            <div className="mini-title">Hiệu suất Đánh giá</div>
            <div className="mini-value-skeleton"></div>
          </div>
          <span className="mini-badge">Sắp ra mắt</span>
        </div>
      </div>
    </div>
  );
}

export default ReviewerDashboardView;
