import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Database, Zap, MessageSquare, Package, ChevronRight,
  BarChart2, ArrowRight, Layers, Shield, Globe,
  Cpu, GitBranch, Sparkles, Play, CheckCircle2, Users, Rocket
} from 'lucide-react';
import '../landing.css';

function Intro() {
  const [visibleSections, setVisibleSections] = useState(new Set());
  const [activeFeature, setActiveFeature] = useState(0);
  const [counters, setCounters] = useState({ models: 0, datasets: 0, accuracy: 0, users: 0 });

  // Animate counters
  useEffect(() => {
    const targets = { models: 150, datasets: 500, accuracy: 99, users: 1200 };
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounters({
        models: Math.round(targets.models * eased),
        datasets: Math.round(targets.datasets * eased),
        accuracy: Math.round(targets.accuracy * eased * 10) / 10,
        users: Math.round(targets.users * eased),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, []);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.landing-section').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Auto-cycle features
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const features = [
    {
      icon: <Database size={28} />,
      title: 'Data Preparation',
      description: 'Multi-step dataset conversion, clustering, labeling, and export pipeline. Clean and transform your data with intelligent automation.',
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, #6366f1, #818cf8)',
      bgGlow: 'rgba(99, 102, 241, 0.1)',
      highlights: ['Auto Format Detection', 'Smart Clustering', 'Label Studio Integration', 'Export Pipeline']
    },
    {
      icon: <Zap size={28} />,
      title: 'AutoTrain',
      description: 'Configure and run training jobs with live GPU monitoring. Fine-tune LLMs with state-of-the-art algorithms automatically.',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
      bgGlow: 'rgba(245, 158, 11, 0.1)',
      highlights: ['LoRA & QLoRA', 'Live GPU Metrics', 'SSE Training Logs', 'Auto Hyperparameter']
    },
    {
      icon: <MessageSquare size={28} />,
      title: 'AI Chat Interface',
      description: 'Conversational AI with streaming inference and model comparison. Test and interact with your deployed models in real-time.',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981, #34d399)',
      bgGlow: 'rgba(16, 185, 129, 0.1)',
      highlights: ['Streaming Inference', 'Model Comparison', 'Context Management', 'Multi-turn Chat']
    },
    {
      icon: <Package size={28} />,
      title: 'Model Registry',
      description: 'Upload, version, and manage models with deployment capabilities. Full lifecycle management from training to production.',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
      bgGlow: 'rgba(139, 92, 246, 0.1)',
      highlights: ['Version Control', 'One-click Deploy', 'Model Artifacts', 'Rollback Support']
    },
    {
      icon: <BarChart2 size={28} />,
      title: 'Model Evaluation',
      description: 'Run standardized evaluations and compare model performance with comprehensive benchmarks and metrics visualization.',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg, #ec4899, #f472b6)',
      bgGlow: 'rgba(236, 72, 153, 0.1)',
      highlights: ['Benchmark Suite', 'Side-by-side Compare', 'Metrics Dashboard', 'Custom Evaluations']
    },
    {
      icon: <Globe size={28} />,
      title: 'Public Projects Hub',
      description: 'Discover and import community datasets, models, and projects. Collaborate and share with the ML community.',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
      bgGlow: 'rgba(6, 182, 212, 0.1)',
      highlights: ['Community Models', 'Dataset Sharing', 'Project Templates', 'Collaboration']
    }
  ];

  const workflowSteps = [
    { icon: <Database size={22} />, label: 'Prepare Data', color: '#6366f1' },
    { icon: <Zap size={22} />, label: 'Train Model', color: '#f59e0b' },
    { icon: <BarChart2 size={22} />, label: 'Evaluate', color: '#ec4899' },
    { icon: <Package size={22} />, label: 'Register', color: '#8b5cf6' },
    { icon: <Rocket size={22} />, label: 'Deploy', color: '#10b981' },
  ];

  return (
    <div className="landing-page">
      {/* Animated background */}
      <div className="landing-bg">
        <div className="landing-grid"></div>
        <div className="landing-glow landing-glow-1"></div>
        <div className="landing-glow landing-glow-2"></div>
        <div className="landing-glow landing-glow-3"></div>
      </div>

      {/* Hero Section */}
      <section className="landing-section landing-hero" id="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Enterprise ML Platform — SEP490 - G36</span>
          </div>
          <h1 className="hero-title">
            Build, Train &<br />
            <span className="hero-gradient-text">Deploy AI Models</span>
            <br />at Scale
          </h1>
          <p className="hero-subtitle">
            An end-to-end machine learning platform that streamlines your entire ML workflow — 
            from data preparation to model deployment — in one unified workspace.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="hero-btn-primary" id="hero-get-started">
              <span>Get Started Free</span>
              <ChevronRight size={20} />
            </Link>
            <Link to="/login" className="hero-btn-secondary" id="hero-login">
              <Play size={18} />
              <span>View Demo</span>
            </Link>
          </div>

          {/* Stats Bar */}
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{counters.models}+</span>
              <span className="hero-stat-label">Models Trained</span>
            </div>
            <div className="hero-stat-divider"></div>
            <div className="hero-stat">
              <span className="hero-stat-value">{counters.datasets}+</span>
              <span className="hero-stat-label">Datasets Processed</span>
            </div>
            <div className="hero-stat-divider"></div>
            <div className="hero-stat">
              <span className="hero-stat-value">{counters.accuracy}%</span>
              <span className="hero-stat-label">Avg Accuracy</span>
            </div>
            <div className="hero-stat-divider"></div>
            <div className="hero-stat">
              <span className="hero-stat-value">{counters.users}+</span>
              <span className="hero-stat-label">Active Users</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        className={`landing-section landing-features ${visibleSections.has('features') ? 'visible' : ''}`}
        id="features"
      >
        <div className="section-container">
          <div className="section-header">
            <div className="section-badge">
              <Layers size={14} />
              <span>Platform Features</span>
            </div>
            <h2 className="section-title">Everything You Need for<br /><span>Machine Learning</span></h2>
            <p className="section-subtitle">
              Six powerful modules working together to accelerate your ML workflow from data to deployment.
            </p>
          </div>

          <div className="features-showcase">
            {/* Feature Tabs */}
            <div className="features-tabs">
              {features.map((feature, index) => (
                <button
                  key={index}
                  className={`feature-tab ${activeFeature === index ? 'active' : ''}`}
                  onClick={() => setActiveFeature(index)}
                  style={activeFeature === index ? { borderColor: feature.color, background: feature.bgGlow } : {}}
                >
                  <div className="feature-tab-icon" style={activeFeature === index ? { background: feature.gradient, color: '#fff' } : {}}>
                    {feature.icon}
                  </div>
                  <div className="feature-tab-info">
                    <h4>{feature.title}</h4>
                    <p>{feature.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Feature Detail */}
            <div className="feature-detail" style={{ background: features[activeFeature].bgGlow }}>
              <div className="feature-detail-header">
                <div className="feature-detail-icon" style={{ background: features[activeFeature].gradient }}>
                  {features[activeFeature].icon}
                </div>
                <h3>{features[activeFeature].title}</h3>
              </div>
              <p className="feature-detail-desc">{features[activeFeature].description}</p>
              <div className="feature-highlights">
                {features[activeFeature].highlights.map((h, i) => (
                  <div className="feature-highlight" key={i}>
                    <CheckCircle2 size={16} style={{ color: features[activeFeature].color }} />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
              <div className="feature-detail-visual">
                <div className="feature-code-block" style={{ borderColor: features[activeFeature].color + '30' }}>
                  <div className="code-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <div className="code-content">
                    <div className="code-line"><span className="code-keyword">from</span> sep490 <span className="code-keyword">import</span> {features[activeFeature].title.split(' ')[0]}</div>
                    <div className="code-line"></div>
                    <div className="code-line"><span className="code-comment"># Initialize {features[activeFeature].title.toLowerCase()}</span></div>
                    <div className="code-line">pipeline = {features[activeFeature].title.split(' ')[0]}.create(</div>
                    <div className="code-line">    <span className="code-string">config="auto"</span>,</div>
                    <div className="code-line">    <span className="code-string">gpu="A100"</span></div>
                    <div className="code-line">)</div>
                    <div className="code-line">pipeline.run() <span className="code-comment"># 🚀</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section
        className={`landing-section landing-workflow ${visibleSections.has('workflow') ? 'visible' : ''}`}
        id="workflow"
      >
        <div className="section-container">
          <div className="section-header">
            <div className="section-badge">
              <GitBranch size={14} />
              <span>ML Pipeline</span>
            </div>
            <h2 className="section-title">From Data to<br /><span>Production</span></h2>
            <p className="section-subtitle">
              A streamlined 5-step pipeline that takes your raw data and transforms it into deployed, production-ready ML models.
            </p>
          </div>

          <div className="workflow-pipeline">
            {workflowSteps.map((step, index) => (
              <React.Fragment key={index}>
                <div className="workflow-step" style={{ animationDelay: `${index * 0.15}s` }}>
                  <div className="workflow-step-icon" style={{ background: step.color + '15', color: step.color, borderColor: step.color + '30' }}>
                    {step.icon}
                  </div>
                  <span className="workflow-step-label">{step.label}</span>
                  <span className="workflow-step-number">0{index + 1}</span>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div className="workflow-connector">
                    <ArrowRight size={18} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section
        className={`landing-section landing-why ${visibleSections.has('why') ? 'visible' : ''}`}
        id="why"
      >
        <div className="section-container">
          <div className="section-header">
            <div className="section-badge">
              <Shield size={14} />
              <span>Why SEP490 - G36</span>
            </div>
            <h2 className="section-title">Built for<br /><span>Enterprise ML Teams</span></h2>
          </div>

          <div className="why-grid">
            <div className="why-card">
              <div className="why-card-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)' }}>
                <Cpu size={24} />
              </div>
              <h3>GPU-Optimized</h3>
              <p>Live GPU monitoring, VRAM management, and optimized training pipelines for maximum hardware utilization.</p>
            </div>
            <div className="why-card">
              <div className="why-card-icon" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                <Layers size={24} />
              </div>
              <h3>Unified Platform</h3>
              <p>All ML tools in one place. No more juggling between scattered services and fragmented workflows.</p>
            </div>
            <div className="why-card">
              <div className="why-card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>
                <Shield size={24} />
              </div>
              <h3>Enterprise Security</h3>
              <p>Role-based access control, data encryption, and audit logs for compliance-ready ML operations.</p>
            </div>
            <div className="why-card">
              <div className="why-card-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}>
                <Users size={24} />
              </div>
              <h3>Team Collaboration</h3>
              <p>Shared workspaces, project management, and community hub for knowledge sharing across teams.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className={`landing-section landing-cta ${visibleSections.has('cta') ? 'visible' : ''}`}
        id="cta"
      >
        <div className="cta-container">
          <div className="cta-glow"></div>
          <h2>Ready to Accelerate Your ML Workflow?</h2>
          <p>Join teams building the future of AI. Start for free, scale when you're ready.</p>
          <div className="cta-actions">
            <Link to="/register" className="hero-btn-primary" id="cta-get-started">
              <span>Start Building Now</span>
              <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>SEP490 - G36</h3>
            <p>Enterprise ML & Data Platform</p>
          </div>
          <div className="footer-links">
            <span>© 2026 SEP490 - G36 Team. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Intro;
