import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HUMAN_AUDIT_RUBRIC, SCORE_ANCHORS, emptyAuditScores } from '../constants/humanAuditRubric';
import '../styles/humanauditmanager.css';
import '../styles/humanauditmanager-agreement.css';

type ManagerFilter = 'all' | 'conflict' | 'resolved' | 'pending';

const deduplicateReviews = (reviews: any[]) => {
  if (!reviews) return [];
  const map = new Map<string, any>();
  reviews.forEach(review => {
    const targetModel = review.targetModel || review.target_model || 'ft';
    const key = `${review.reviewerId || review.reviewerName}_${targetModel}`;
    const existing = map.get(key);
    if (existing) {
      const existingDate = existing.updatedAt || existing.createdAt;
      const currentDate = review.updatedAt || review.createdAt;
      if (existingDate && currentDate && new Date(currentDate) < new Date(existingDate)) {
        return; // Keep the existing one because it is newer
      }
    }
    map.set(key, review);
  });
  return Array.from(map.values());
};

const MOCK_EVALUATIONS = [
  {
    modelEvalId: 'eval_demo_vistral_7b',
    projectName: 'Demo Project: Vistral-7B Math & Socratic Audit',
    packageLabel: '🎯 Vistral-7B vs Base (Demo Package) · 50 Replays',
    totalConversations: 50,
    assignedStaff: 3,
    submittedReviews: 8,
    conflictItems: 2,
    checkerName: 'Phạm Minh (Checker Trưởng)',
    checkerId: 'checker_demo_1',
    ftModelRepo: 'namld/vistral-7b-socratic-v2',
    baseModelRepo: 'VietAI/vistral-7b-chat',
  },
  {
    modelEvalId: 'eval_demo_physics_v1',
    projectName: 'Demo Project: Physics Socratic Tutor',
    packageLabel: '🎯 Physics Tutor v1 · 30 Replays',
    totalConversations: 30,
    assignedStaff: 2,
    submittedReviews: 4,
    conflictItems: 1,
    checkerName: 'Lê Văn Hoàng',
    checkerId: 'checker_demo_2',
    ftModelRepo: 'namld/physics-socratic-lora',
    baseModelRepo: 'unsloth/mistral-7b-instruct-v0.2',
  },
];

const MOCK_STAFF = [
  { id: 'staff_demo_1', name: 'Lê Nam', email: 'nam.le@example.com' },
  { id: 'staff_demo_2', name: 'Trần Dũng', email: 'dung.tran@example.com' },
  { id: 'staff_demo_3', name: 'Nguyễn Thị An', email: 'an.nguyen@example.com' },
];

const MOCK_CHECKERS = [
  { id: 'checker_demo_1', name: 'Phạm Minh (Checker Trưởng)', email: 'minh.pham@example.com' },
  { id: 'checker_demo_2', name: 'Lê Văn Hoàng', email: 'hoang.le@example.com' },
];

const MOCK_DETAILS: Record<string, any> = {
  eval_demo_vistral_7b: {
    evaluation: {
      modelEvalId: 'eval_demo_vistral_7b',
      ftModelRepo: 'namld/vistral-7b-socratic-v2',
      baseModelRepo: 'VietAI/vistral-7b-chat',
    },
    inter_rater_summary: {
      reviewer_count: 3,
      reviewed_item_count: 5,
      criteria: {
        A1: { pair_count: 6, exact_agreement_rate: 0.667, within_one_agreement_rate: 0.833, mean_absolute_difference: 0.5, quadratic_weighted_kappa: 0.72 },
        A2: { pair_count: 6, exact_agreement_rate: 0.5, within_one_agreement_rate: 0.833, mean_absolute_difference: 0.83, quadratic_weighted_kappa: 0.65 },
        A3: { pair_count: 6, exact_agreement_rate: 0.5, within_one_agreement_rate: 0.667, mean_absolute_difference: 1.0, quadratic_weighted_kappa: 0.58 },
        B1: { pair_count: 6, exact_agreement_rate: 0.833, within_one_agreement_rate: 1.0, mean_absolute_difference: 0.17, quadratic_weighted_kappa: 0.89 },
        B2: { pair_count: 6, exact_agreement_rate: 0.667, within_one_agreement_rate: 0.833, mean_absolute_difference: 0.33, quadratic_weighted_kappa: 0.78 },
        C1: { pair_count: 6, exact_agreement_rate: 0.5, within_one_agreement_rate: 0.833, mean_absolute_difference: 0.67, quadratic_weighted_kappa: 0.61 },
        C2: { pair_count: 6, exact_agreement_rate: 0.667, within_one_agreement_rate: 0.833, mean_absolute_difference: 0.5, quadratic_weighted_kappa: 0.70 },
        C3: { pair_count: 6, exact_agreement_rate: 0.833, within_one_agreement_rate: 1.0, mean_absolute_difference: 0.17, quadratic_weighted_kappa: 0.85 },
      },
    },
    items: [
      {
        conv_index: 0,
        item_id: 'test-en-001',
        question: 'Thưa thầy, làm thế nào để xác định thì hoàn thành trong ngữ pháp tiếng Anh ạ?',
        answer: 'Thầy chào em! Để nhận biết các thì hoàn thành (Perfect Tenses), em hãy chú ý đến cấu trúc dùng trợ động từ HAVE/HAS/HAD kết hợp với Quá khứ phân tử (V3/ed). Em thử cho thầy một ví dụ về một hành động đã xảy ra trong quá khứ và vừa mới kết thúc xem nào?',
        baseAnswer: 'Thì hoàn thành dùng have/has + V3. Ví dụ: I have eaten breakfast. Thì quá khứ hoàn thành dùng had + V3.',
        ai_scores: { A1: 5, A2: 2, A3: 2, B1: 5, B2: 5, C1: 4, C2: 3, C3: 4, D1: 5 },
        inter_rater: {
          reviewer_count: 3,
          max_delta: 5.0,
          conflict_criteria: ['A1', 'A2', 'A3', 'B1', 'B2'],
          status: 'conflict',
          severity: 'critical',
        },
        reviews: [
          {
            _id: 'rev_01',
            reviewerId: 'staff_demo_1',
            reviewerName: 'Lê Nam',
            targetModel: 'ft',
            humanScores: { A1: 5, A2: 5, A3: 5, B1: 5, B2: 5, C1: 5, C2: 5, C3: 5, D1: 5 },
            humanOutcomes: { socratic_s: 5.0 },
            note: 'Phản hồi Fine-tuned khơi gợi tư duy Socratic rất chuẩn, hỏi lại học sinh để học sinh tự đưa ví dụ.',
            createdAt: '2026-08-11T04:00:00Z',
          },
          {
            _id: 'rev_02',
            reviewerId: 'staff_demo_1',
            reviewerName: 'Lê Nam',
            targetModel: 'base',
            humanScores: { A1: 5, A2: 5, A3: 5, B1: 5, B2: 5, C1: 5, C2: 5, C3: 5, D1: 5 },
            humanOutcomes: { socratic_s: 5.0 },
            note: 'Base trả lời trực tiếp nhưng ngắn gọn, chấp nhận được.',
            createdAt: '2026-08-11T04:05:00Z',
          },
          {
            _id: 'rev_03',
            reviewerId: 'staff_demo_2',
            reviewerName: 'Trần Dũng',
            targetModel: 'base',
            humanScores: { A1: 0, A2: 0, A3: 1, B1: 2, B2: 3, C1: 2, C2: 1, C3: 3, D1: 5 },
            humanOutcomes: { socratic_s: 0.333 },
            note: 'Base không có câu hỏi gợi mở nào, bị trừ điểm Socratic A1/A2.',
            createdAt: '2026-08-11T04:10:00Z',
          },
        ],
      },
      {
        conv_index: 1,
        item_id: 'test-math-002',
        question: 'Cho phương trình x² - 5x + 6 = 0, làm sao để tìm 2 nghiệm mà không dùng công thức Δ?',
        answer: 'Chào em! Em có nhớ Định lý Viète về tổng và tích của 2 nghiệm x1 + x2 và x1 * x2 không? Em hãy thử tìm 2 số nào có tổng bằng 5 và tích bằng 6 xem nào?',
        baseAnswer: 'Tách x² - 5x + 6 thành (x - 2)(x - 3) = 0 => x = 2 hoặc x = 3.',
        ai_scores: { A1: 5, A2: 5, A3: 4, B1: 5, B2: 5, C1: 5, C2: 5, C3: 5, D1: 5 },
        inter_rater: {
          reviewer_count: 2,
          max_delta: 1.0,
          conflict_criteria: [],
          status: 'agreement',
          severity: 'minor',
        },
        reviews: [
          {
            _id: 'rev_04',
            reviewerId: 'staff_demo_1',
            reviewerName: 'Lê Nam',
            targetModel: 'ft',
            humanScores: { A1: 5, A2: 5, A3: 4, B1: 5, B2: 5, C1: 5, C2: 5, C3: 5, D1: 5 },
            humanOutcomes: { socratic_s: 4.67 },
            note: 'Gợi ý Viète rất vừa sức với học sinh lớp 9.',
            createdAt: '2026-08-11T04:20:00Z',
          },
          {
            _id: 'rev_05',
            reviewerId: 'staff_demo_3',
            reviewerName: 'Nguyễn Thị An',
            targetModel: 'ft',
            humanScores: { A1: 5, A2: 4, A3: 4, B1: 5, B2: 5, C1: 4, C2: 5, C3: 5, D1: 5 },
            humanOutcomes: { socratic_s: 4.33 },
            note: 'Chất lượng gợi mở tốt, chính xác.',
            createdAt: '2026-08-11T04:25:00Z',
          },
        ],
      },
      {
        conv_index: 2,
        item_id: 'test-phys-003',
        question: 'Tại sao khi nhảy từ trên cao xuống người ta phải nhún chân?',
        answer: 'Một câu hỏi thực tế rất hay! Khi nhún chân, thời gian va chạm Δt tăng lên hay giảm đi em nhỉ? Từ công thức xung lực F * Δt = Δp, điều đó ảnh hưởng thế nào đến lực tác dụng F vào chân?',
        baseAnswer: 'Nhún chân để làm tăng thời gian va chạm, giảm lực tác dụng lên chân tránh bị gãy xương.',
        ai_scores: { A1: 5, A2: 3, A3: 3, B1: 5, B2: 4, C1: 4, C2: 4, C3: 4, D1: 5 },
        inter_rater: {
          reviewer_count: 2,
          max_delta: 2.5,
          conflict_criteria: ['A2', 'A3'],
          status: 'conflict',
          severity: 'major',
        },
        reviews: [
          {
            _id: 'rev_06',
            reviewerId: 'staff_demo_2',
            reviewerName: 'Trần Dũng',
            targetModel: 'ft',
            humanScores: { A1: 5, A2: 5, A3: 5, B1: 5, B2: 5, C1: 5, C2: 4, C3: 5, D1: 5 },
            humanOutcomes: { socratic_s: 5.0 },
            note: 'Gợi mở chính xác lý thuyết Vật lý 10.',
            createdAt: '2026-08-11T04:30:00Z',
          },
          {
            _id: 'rev_07',
            reviewerId: 'staff_demo_3',
            reviewerName: 'Nguyễn Thị An',
            targetModel: 'ft',
            humanScores: { A1: 3, A2: 2, A3: 3, B1: 5, B2: 4, C1: 3, C2: 4, C3: 4, D1: 5 },
            humanOutcomes: { socratic_s: 2.67 },
            note: 'Câu hỏi hơi mang tính đánh đố công thức trực tiếp.',
            createdAt: '2026-08-11T04:35:00Z',
          },
        ],
      },
    ],
  },
};

export default function HumanAuditManagerView() {
  const { user } = useAuth();
  const isChecker = user?.role === 'checker';
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [checkers, setCheckers] = useState<any[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedCheckerId, setSelectedCheckerId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [filter, setFilter] = useState<ManagerFilter>('all');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [resolution, setResolution] = useState<'accept_ai' | 'accept_staff' | 'manual'>('accept_ai');
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [finalScores, setFinalScores] = useState<Record<string, number | null>>(emptyAuditScores);
  const [finalReasons, setFinalReasons] = useState<Record<string, string>>({});
  const [resolutionNote, setResolutionNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalTargetFilter, setModalTargetFilter] = useState<'all' | 'ft' | 'base'>('all');
  const [useMock, setUseMock] = useState(false);

  const computeModelConflictBreakdown = (reviews: any[], aiScores?: any) => {
    const unique = deduplicateReviews(reviews);
    const ftReviews = unique.filter((r: any) => (r.targetModel || r.target_model || 'ft') === 'ft');
    const baseReviews = unique.filter((r: any) => (r.targetModel || r.target_model) === 'base');

    const calcStats = (revs: any[]) => {
      if (!revs.length) return { count: 0, maxDelta: 0, conflicts: [] as string[] };
      let maxD = 0;
      const conflictSet = new Set<string>();

      revs.forEach((r: any) => {
        if (r.humanScores && aiScores) {
          Object.entries(r.humanScores).forEach(([k, v]) => {
            if (v !== null && v !== undefined && aiScores[k] !== undefined && aiScores[k] !== null) {
              const delta = Math.abs(Number(v) - Number(aiScores[k]));
              if (delta > maxD) maxD = delta;
              if (delta >= 1.5) conflictSet.add(k);
            }
          });
        }
      });

      for (let i = 0; i < revs.length; i++) {
        for (let j = i + 1; j < revs.length; j++) {
          const s1 = revs[i].humanScores || {};
          const s2 = revs[j].humanScores || {};
          Object.keys(s1).forEach(k => {
            if (s1[k] != null && s2[k] != null) {
              const delta = Math.abs(Number(s1[k]) - Number(s2[k]));
              if (delta > maxD) maxD = delta;
              if (delta >= 1.5) conflictSet.add(k);
            }
          });
        }
      }

      return {
        count: revs.length,
        maxDelta: maxD,
        conflicts: Array.from(conflictSet),
      };
    };

    return {
      ft: calcStats(ftReviews),
      base: calcStats(baseReviews),
    };
  };

  const loadOverview = useCallback(async () => {
    if (useMock) {
      setEvaluations(MOCK_EVALUATIONS);
      setStaff(MOCK_STAFF);
      setCheckers(MOCK_CHECKERS);
      if (!selectedEvalId) setSelectedEvalId(MOCK_EVALUATIONS[0].modelEvalId);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [evaluationRows, staffRows, checkerRows] = await Promise.all([
        apiService.getManagedHumanAudits(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditStaff(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditCheckers(),
      ]);
      const validEvals = Array.isArray(evaluationRows) ? evaluationRows : [];
      if (validEvals.length === 0) {
        // Automatically switch to mock if no real evals found from API
        setEvaluations(MOCK_EVALUATIONS);
        setStaff(MOCK_STAFF);
        setCheckers(MOCK_CHECKERS);
        if (!selectedEvalId) setSelectedEvalId(MOCK_EVALUATIONS[0].modelEvalId);
      } else {
        setEvaluations(validEvals);
        setStaff(Array.isArray(staffRows) ? staffRows : []);
        setCheckers(Array.isArray(checkerRows) ? checkerRows : []);
        if (!selectedEvalId && validEvals[0]?.modelEvalId) setSelectedEvalId(validEvals[0].modelEvalId);
      }
    } catch (error: any) {
      toast.error('Không kết nối được backend API, đang tải dữ liệu Demo!');
      setEvaluations(MOCK_EVALUATIONS);
      setStaff(MOCK_STAFF);
      setCheckers(MOCK_CHECKERS);
      if (!selectedEvalId) setSelectedEvalId(MOCK_EVALUATIONS[0].modelEvalId);
    } finally {
      setLoading(false);
    }
  }, [selectedEvalId, isChecker, useMock]);

  const loadDetail = useCallback(async (evalId: string) => {
    if (!evalId) return;
    if (useMock || MOCK_DETAILS[evalId]) {
      setDetail(MOCK_DETAILS[evalId] || MOCK_DETAILS.eval_demo_vistral_7b);
      return;
    }
    try {
      setDetail(await apiService.getManagedHumanAuditDetail(evalId));
    } catch (error: any) {
      setDetail(MOCK_DETAILS.eval_demo_vistral_7b);
    }
  }, [useMock]);

  useEffect(() => { void loadOverview(); }, [useMock]);
  useEffect(() => { if (selectedEvalId) void loadDetail(selectedEvalId); }, [selectedEvalId, loadDetail, useMock]);

  const selectedEvaluation = evaluations.find(item => item.modelEvalId === selectedEvalId);
  useEffect(() => {
    setSelectedCheckerId(selectedEvaluation?.checkerId || '');
  }, [selectedEvalId, selectedEvaluation?.checkerId]);
  const visibleItems = useMemo(() => (detail?.items || []).filter((item: any) => {
    if (filter === 'all') return true;
    if (filter === 'conflict') return item.inter_rater?.status === 'conflict';
    if (filter === 'resolved') return item.inter_rater?.status === 'resolved';
    return ['insufficient', 'agreement'].includes(item.inter_rater?.status) && !item.adjudication;
  }), [detail, filter]);

  const toggleStaff = (id: string) => setSelectedStaffIds(previous => (
    previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
  ));

  const assign = async () => {
    if (!selectedEvalId || !selectedStaffIds.length || !selectedCheckerId) {
      toast.error('Chọn gói project, ít nhất một Staff và một Checker');
      return;
    }
    setAssigning(true);
    try {
      const result = await apiService.assignHumanAudit({
        model_eval_id: selectedEvalId,
        staff_ids: selectedStaffIds,
        checker_id: selectedCheckerId,
      });
      toast.success(`Đã giao gói ${result.projectName}: ${result.assignedItems} câu, ${result.assignedStaff} Staff, Checker ${result.checker?.name}`);
      setSelectedStaffIds([]);
      await Promise.all([loadOverview(), loadDetail(selectedEvalId)]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không giao được Human Audit');
    } finally {
      setAssigning(false);
    }
  };

  const openResolution = (item: any) => {
    setSelectedItem(item);
    setModalTargetFilter('ft');
    const unique = deduplicateReviews(item.reviews || []);
    const firstFt = unique.find((review: any) => (review.targetModel || review.target_model || 'ft') === 'ft');
    setResolution('accept_ai');
    setSelectedReviewId(firstFt?._id || '');
    setFinalScores(emptyAuditScores());
    setFinalReasons({});
    setResolutionNote('');
  };

  const adjudicate = async () => {
    if (!selectedItem || !resolutionNote.trim()) {
      toast.error('Supervisor phải ghi lý do chốt');
      return;
    }
    if (resolution === 'accept_staff' && !selectedReviewId) {
      toast.error('Chọn một bản chấm Staff');
      return;
    }
    if (resolution === 'manual') {
      const missing = HUMAN_AUDIT_RUBRIC.filter(({ key }) => finalScores[key] === null);
      if (missing.length) {
        toast.error(`Chưa chấm: ${missing.map(item => item.key).join(', ')}`);
        return;
      }
      const missingReasons = HUMAN_AUDIT_RUBRIC.filter(({ key }) => [2, 3, 4].includes(Number(finalScores[key])) && !String(finalReasons[key] || '').trim());
      if (missingReasons.length) {
        toast.error(`Điểm 2–4 cần lý do: ${missingReasons.map(item => item.key).join(', ')}`);
        return;
      }
    }
    setSaving(true);
    try {
      await apiService.adjudicateHumanAudit(selectedEvalId, selectedItem.conv_index, {
        resolution,
        target_model: modalTargetFilter === 'all' ? 'ft' : modalTargetFilter,
        selected_review_id: resolution === 'accept_staff' ? selectedReviewId : undefined,
        final_scores: resolution === 'manual'
          ? Object.fromEntries(Object.entries(finalScores).map(([key, value]) => [key, Number(value)]))
          : undefined,
        final_reasons: resolution === 'manual' ? finalReasons : undefined,
        note: resolutionNote.trim(),
      });
      toast.success(`Đã chốt xung đột (${modalTargetFilter === 'base' ? 'Base Model' : 'Fine-tuned Model'}); bản chấm Staff vẫn được giữ nguyên`);
      setSelectedItem(null);
      await Promise.all([loadOverview(), loadDetail(selectedEvalId)]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không chốt được xung đột');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ham-page">
      <header className="ham-hero">
        <div><span><ShieldCheck size={15} /> {isChecker ? 'CHECKER ADJUDICATION' : 'SUPERVISOR CONTROL'}</span><h1>{isChecker ? 'Xử lý Human Audit Conflict' : 'Quản lý Human Audit'}</h1><p>AI Judge và tất cả bản chấm Staff được đối chiếu đồng thời trong một hồ sơ conflict có lưu vết.</p></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              setUseMock(m => !m);
              toast.success(!useMock ? 'Đã bật dữ liệu Mẫu Demo (Fake Data)!' : 'Đã chuyển sang kết nối Backend thực tế.');
            }}
            style={{ background: useMock ? '#6366f1' : '#ffffff', color: useMock ? '#ffffff' : '#312e81', border: '1px solid #c7d2fe' }}
          >
            {useMock ? '✓ Đang bật Fake Data' : '🎭 Demo / Fake Data'}
          </button>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới</button>
        </div>
      </header>

      <section className="ham-assignment-card">
        <div className="ham-field"><label>Gói audit theo project</label><select value={selectedEvalId} onChange={event => setSelectedEvalId(event.target.value)}><option value="">Chọn project...</option>{evaluations.map(item => <option value={item.modelEvalId} key={item.modelEvalId}>{item.packageLabel || `${item.projectName} · ${item.totalConversations} câu`}</option>)}</select><small>Mỗi project/evaluation là một gói riêng; 2 project × 100 câu sẽ tạo 2 gói 100 câu, không trộn chung.</small></div>
        {!isChecker && (
          <>
            <div className="ham-staff-picker"><label>Giao độc lập cho Staff</label><div>{staff.map(person => <button type="button" key={person.id} className={selectedStaffIds.includes(person.id) ? 'selected' : ''} onClick={() => toggleStaff(person.id)}><Users size={14} /><span>{person.name}<small>{person.email}</small></span>{selectedStaffIds.includes(person.id) && <CheckCircle2 size={14} />}</button>)}</div></div>
            <div className="ham-field"><label>Checker phụ trách gói</label><select value={selectedCheckerId} onChange={event => setSelectedCheckerId(event.target.value)}><option value="">Chọn Checker...</option>{checkers.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select><small>Chỉ Checker được giao mới xem và chốt conflict của gói này.</small></div>
            <button className="ham-assign" type="button" onClick={assign} disabled={assigning || !selectedStaffIds.length || !selectedCheckerId}>{assigning ? <RefreshCw className="spin" size={16} /> : <ClipboardCheck size={16} />} Giao gói project</button>
          </>
        )}
      </section>

      {selectedEvaluation && (
        <section className="ham-summary-grid">
          <article><span>Staff được giao</span><strong>{selectedEvaluation.assignedStaff}</strong><small>{selectedEvaluation.assignedStaff >= 2 ? 'Có thể đo đồng thuận' : '1 Staff vẫn audit được; chưa tính IAA'}</small></article>
          <article><span>Bản chấm đã nộp</span><strong>{selectedEvaluation.submittedReviews}</strong></article>
          <article className="danger"><span>Replay xung đột</span><strong>{selectedEvaluation.conflictItems}</strong></article>
          <article className="success"><span>Checker phụ trách</span><strong className="ham-checker-name">{selectedEvaluation.checkerName || 'Chưa giao'}</strong></article>
        </section>
      )}

      <section className="ham-review-card">
        <header><div><h2>Đối chiếu theo từng replay trong gói project</h2><p>Một Staff vẫn tạo được Human Audit. Từ 2 Staff trở lên mới có thêm chỉ số đồng thuận (IAA); đây không phải điều kiện khóa.</p></div><div className="ham-filters">{(['all', 'conflict', 'resolved', 'pending'] as ManagerFilter[]).map(value => <button type="button" className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'Tất cả' : value === 'conflict' ? 'Xung đột' : value === 'resolved' ? 'Đã chốt' : 'Chờ chấm'}</button>)}</div></header>
        <div className="ham-table-wrap"><table><thead><tr><th>Replay</th><th>Số bản chấm</th><th>Chênh lệch lớn nhất</th><th>Tiêu chí xung đột</th><th>Trạng thái</th><th /></tr></thead><tbody>{visibleItems.map((item: any) => {
          const uniqueReviews = deduplicateReviews(item.reviews || []);
          const breakdown = computeModelConflictBreakdown(item.reviews || [], item.ai_scores);
          const ftCount = breakdown.ft.count;
          const baseCount = breakdown.base.count;

          return (
            <tr key={item.conv_index}>
              <td><strong>{item.item_id || `Conv ${item.conv_index}`}</strong><small>{item.question}</small></td>
              <td>
                <strong>{item.inter_rater.reviewer_count}</strong>
                {Boolean(uniqueReviews.length) && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, marginTop: '2px' }}>
                    {ftCount > 0 && <span style={{ color: '#4f46e5', marginRight: '4px' }}>{ftCount} FT</span>}
                    {baseCount > 0 && <span style={{ color: '#b45309' }}>{baseCount} Base</span>}
                  </div>
                )}
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8rem' }}>
                  {ftCount > 0 && (
                    <span style={{ color: breakdown.ft.maxDelta >= 2 ? '#dc2626' : breakdown.ft.maxDelta >= 1 ? '#d97706' : '#059669', fontWeight: 600 }}>
                      🎯 FT: Δ {breakdown.ft.maxDelta.toFixed(1)}
                    </span>
                  )}
                  {baseCount > 0 && (
                    <span style={{ color: breakdown.base.maxDelta >= 2 ? '#dc2626' : breakdown.base.maxDelta >= 1 ? '#d97706' : '#059669', fontWeight: 600 }}>
                      🔲 Base: Δ {breakdown.base.maxDelta.toFixed(1)}
                    </span>
                  )}
                  {!ftCount && !baseCount && <span>{(item.inter_rater.max_delta || 0).toFixed(1)}</span>}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem' }}>
                  {ftCount > 0 && (
                    <span>🎯 FT: <b>{breakdown.ft.conflicts.join(', ') || 'Không'}</b></span>
                  )}
                  {baseCount > 0 && (
                    <span>🔲 Base: <b>{breakdown.base.conflicts.join(', ') || 'Không'}</b></span>
                  )}
                  {!ftCount && !baseCount && <span>{item.inter_rater.conflict_criteria.join(', ') || '—'}</span>}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {item.inter_rater.status === 'resolved' ? (
                    <span className="ham-status resolved">Đã chốt</span>
                  ) : (
                    <>
                      {ftCount > 0 && (
                        <span className={`ham-status ${breakdown.ft.maxDelta >= 2 ? 'conflict' : 'agreement'}`} style={{ fontSize: '0.7rem' }}>
                          🎯 FT: {breakdown.ft.maxDelta >= 2 ? 'Critical Conflict' : breakdown.ft.maxDelta >= 1 ? 'Minor Conflict' : 'Đồng thuận'}
                        </span>
                      )}
                      {baseCount > 0 && (
                        <span className={`ham-status ${breakdown.base.maxDelta >= 2 ? 'conflict' : 'agreement'}`} style={{ fontSize: '0.7rem', background: breakdown.base.maxDelta >= 2 ? '#fff7ed' : undefined, color: breakdown.base.maxDelta >= 2 ? '#c2410c' : undefined }}>
                          🔲 Base: {breakdown.base.maxDelta >= 2 ? 'Critical Conflict' : breakdown.base.maxDelta >= 1 ? 'Minor Conflict' : 'Đồng thuận'}
                        </span>
                      )}
                      {!ftCount && !baseCount && (
                        <span className={`ham-status ${item.inter_rater.status} ${item.inter_rater.severity}`}>
                          {item.inter_rater.status === 'conflict' ? `${item.inter_rater.severity} conflict` : 'Chưa có bản chấm'}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </td>
              <td><button type="button" onClick={() => openResolution(item)} disabled={!uniqueReviews.length}><Scale size={14} /> Xem & xử lý</button></td>
            </tr>
          );
        })}</tbody></table>{!visibleItems.length && <div className="ham-empty">Chưa có replay phù hợp bộ lọc.</div>}</div>
      </section>

      {detail?.inter_rater_summary?.reviewer_count >= 2 && (
        <details className="ham-agreement-card">
          <summary><div><Users size={16} /><span>Độ đồng thuận giữa Staff</span></div><strong>{detail.inter_rater_summary.reviewer_count} người chấm · {detail.inter_rater_summary.reviewed_item_count} replay có điểm</strong></summary>
          <div><table><thead><tr><th>Tiêu chí</th><th>Số cặp điểm</th><th>Khớp tuyệt đối</th><th>Lệch ≤ 1</th><th>MAE</th><th>Weighted κ</th></tr></thead><tbody>{HUMAN_AUDIT_RUBRIC.map(({ key, title }) => { const metric = detail.inter_rater_summary.criteria?.[key] || {}; return <tr key={key}><td><b>{key}</b> · {title}</td><td>{metric.pair_count || 0}</td><td>{metric.exact_agreement_rate == null ? '—' : `${(metric.exact_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.within_one_agreement_rate == null ? '—' : `${(metric.within_one_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.mean_absolute_difference == null ? '—' : metric.mean_absolute_difference.toFixed(2)}</td><td>{metric.quadratic_weighted_kappa == null ? '—' : metric.quadratic_weighted_kappa.toFixed(3)}</td></tr>; })}</tbody></table><p>κ có hiệu chỉnh trùng hợp ngẫu nhiên; MAE là độ lệch điểm trung bình. Replay “Bỏ qua” không được tính.</p></div>
        </details>
      )}

      {selectedItem && (() => {
        const allUniqueReviews = deduplicateReviews(selectedItem.reviews || []);
        const ftReviews = allUniqueReviews.filter((r: any) => (r.targetModel || r.target_model || 'ft') === 'ft');
        const baseReviews = allUniqueReviews.filter((r: any) => (r.targetModel || r.target_model) === 'base');

        return (
          <div className="ham-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
            <section className="ham-modal">
              <header>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>UNIFIED ADJUDICATION · {selectedItem.item_id}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e7ff', color: '#4338ca', fontSize: '0.72rem', fontWeight: 600 }}>
                      🎯 Fine-tuned: {detail?.evaluation?.ftModelRepo || selectedEvaluation?.ftModelRepo || 'FT Model'}
                    </span>
                    {Boolean(detail?.evaluation?.baseModelRepo || selectedEvaluation?.baseModelRepo) && (
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontSize: '0.72rem', fontWeight: 600 }}>
                        🔲 Base: {detail?.evaluation?.baseModelRepo || selectedEvaluation?.baseModelRepo}
                      </span>
                    )}
                  </div>
                  <h2>Đối chiếu AI Judge và tất cả Staff</h2>
                </div>
                <button type="button" onClick={() => setSelectedItem(null)}><X size={18} /></button>
              </header>
              <div className="ham-replay">
                <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}><b>Học sinh:</b> {selectedItem.question}</p>
                <div style={{ display: 'grid', gridTemplateColumns: selectedItem.baseAnswer ? '1fr 1fr' : '1fr', gap: '12px', marginTop: '8px' }}>
                  <div style={{ background: 'rgba(99,102,241,0.06)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', display: 'block', marginBottom: '4px' }}>🎯 FINE-TUNED MODEL</span>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>{selectedItem.answer}</p>
                  </div>
                  {selectedItem.baseAnswer && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', display: 'block', marginBottom: '4px' }}>🔲 BASE MODEL</span>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>{selectedItem.baseAnswer}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: CRITERIA COMPARISON MATRIX (Hiển thị các điểm bị lệch nhau theo Model được chọn) */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#312e81', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        📊 BẢNG ĐỐI CHIẾU TIÊU CHÍ (AI JUDGE VS STAFFS)
                      </span>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                        Chọn mô hình muốn xem đối chiếu độ lệch điểm (Δ ≥ 1.5).
                      </small>
                    </div>

                    {/* Model Switcher for Comparison Matrix Table */}
                    <div style={{ display: 'flex', gap: '6px', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTargetFilter('ft');
                          setResolution('accept_ai');
                          if (ftReviews[0]) setSelectedReviewId(ftReviews[0]._id);
                        }}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          border: 0,
                          background: modalTargetFilter === 'ft' ? '#4f46e5' : 'transparent',
                          color: modalTargetFilter === 'ft' ? '#ffffff' : '#475569',
                          cursor: 'pointer',
                          boxShadow: modalTargetFilter === 'ft' ? '0 2px 6px rgba(79,70,229,0.3)' : 'none',
                        }}
                      >
                        🎯 Fine-tuned ({ftReviews.length} Staff + AI)
                      </button>
                      {baseReviews.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalTargetFilter('base');
                            setResolution('accept_staff');
                            if (baseReviews[0]) setSelectedReviewId(baseReviews[0]._id);
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            border: 0,
                            background: modalTargetFilter === 'base' ? '#b45309' : 'transparent',
                            color: modalTargetFilter === 'base' ? '#ffffff' : '#475569',
                            cursor: 'pointer',
                            boxShadow: modalTargetFilter === 'base' ? '0 2px 6px rgba(180,83,9,0.3)' : 'none',
                          }}
                        >
                          🔲 Base Model ({baseReviews.length} Staff)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setModalTargetFilter('all')}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          border: 0,
                          background: modalTargetFilter === 'all' ? '#1e293b' : 'transparent',
                          color: modalTargetFilter === 'all' ? '#ffffff' : '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ Tất cả
                      </button>
                    </div>
                  </div>

                  {(() => {
                    // Filter table columns based on selected modalTargetFilter
                    const displayReviews = modalTargetFilter === 'ft'
                      ? ftReviews
                      : modalTargetFilter === 'base'
                        ? baseReviews
                        : allUniqueReviews;

                    const includeAi = modalTargetFilter === 'ft' || modalTargetFilter === 'all';

                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                              <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Tiêu chí</th>
                              {includeAi && (
                                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: '#e0e7ff', color: '#3730a3' }}>
                                  🤖 AI Judge<br /><small style={{ fontWeight: 500 }}>(Fine-tuned)</small>
                                </th>
                              )}
                              {displayReviews.map((rev: any) => {
                                const isBase = (rev.targetModel || rev.target_model) === 'base';
                                return (
                                  <th
                                    key={rev._id}
                                    style={{
                                      padding: '10px 12px',
                                      textAlign: 'center',
                                      borderBottom: '1px solid #e2e8f0',
                                      background: isBase ? '#fffbeb' : '#f0fdf4',
                                      color: isBase ? '#b45309' : '#047857',
                                    }}
                                  >
                                    👤 {rev.reviewerName}<br />
                                    <small style={{ fontWeight: 600 }}>({isBase ? 'Base' : 'Fine-tuned'})</small>
                                  </th>
                                );
                              })}
                              <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: '#fff1f2', color: '#9f1239' }}>
                                Chênh lệch max (Δ)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {HUMAN_AUDIT_RUBRIC.map(({ key, title }) => {
                              const aiVal = includeAi ? (selectedItem.ai_scores?.[key] ?? null) : null;
                              const revVals = displayReviews.map((r: any) => r.humanScores?.[key] ?? null);
                              const validVals = [aiVal, ...revVals].filter((v): v is number => typeof v === 'number');
                              const minV = validVals.length ? Math.min(...validVals) : 0;
                              const maxV = validVals.length ? Math.max(...validVals) : 0;
                              const delta = maxV - minV;
                              const hasConflict = delta >= 1.5;

                              return (
                                <tr key={key} style={{ borderBottom: '1px solid #f1f5f9', background: hasConflict ? '#fff5f5' : 'transparent' }}>
                                  <td style={{ padding: '9px 12px', fontWeight: 600, color: '#334155' }}>
                                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', fontSize: '0.75rem', marginRight: '6px' }}>{key}</span>
                                    {title}
                                  </td>
                                  {includeAi && (
                                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#3730a3' }}>
                                      {aiVal ?? '—'}
                                    </td>
                                  )}
                                  {displayReviews.map((rev: any) => {
                                    const val = rev.humanScores?.[key] ?? null;
                                    const baselineVal = includeAi ? aiVal : (revVals[0] ?? null);
                                    const isDiff = baselineVal !== null && val !== null && Math.abs(val - baselineVal) >= 1.5;
                                    return (
                                      <td
                                        key={rev._id}
                                        style={{
                                          padding: '9px 12px',
                                          textAlign: 'center',
                                          fontWeight: 700,
                                          color: isDiff ? '#be123c' : '#334155',
                                          background: isDiff ? '#ffe4e6' : 'transparent',
                                        }}
                                      >
                                        {val ?? '—'}
                                      </td>
                                    );
                                  })}
                                  <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: hasConflict ? '#be123c' : '#059669' }}>
                                    {delta > 0 ? `Δ ${delta.toFixed(1)}` : '0 (Khớp)'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {/* SECTION: CANDIDATE SELECTION (Chỉ chọn trường hợp 2+ người cùng chấm hoặc chọn AI/Staff) */}
                <div style={{ border: '1px solid #c7d2fe', borderRadius: '12px', background: '#f8fafc', padding: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#312e81', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      ⚖️ CHỌN BẢN CHẤM CHÍNH THỨC ĐỂ CHỐT XUNG ĐỘT
                    </span>
                    <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                      {ftReviews.length >= 2 || baseReviews.length >= 2
                        ? `Phát hiện có ${ftReviews.length >= 2 ? `${ftReviews.length} Staff cùng chấm Fine-tuned` : ''} ${baseReviews.length >= 2 ? `${baseReviews.length} Staff cùng chấm Base Model` : ''}. Hãy chọn 1 bản chấm hợp lý nhất.`
                        : 'Chọn giữa kết quả AI Judge và bản chấm của Staff.'}
                    </small>
                  </div>

                  <div className="ham-review-grid" style={{ padding: 0 }}>
                    {/* Candidate Option: AI Judge (Only when FT or All is selected) */}
                    {(modalTargetFilter === 'ft' || modalTargetFilter === 'all') && (
                      <label className={resolution === 'accept_ai' ? 'selected' : ''}>
                        <input type="radio" name="adjudication_candidate" checked={resolution === 'accept_ai'} onChange={() => setResolution('accept_ai')} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong>AI Judge</strong>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: '#e0e7ff', color: '#4338ca' }}>🎯 Fine-tuned</span>
                          </div>
                          <small>Đề xuất tự động từ AI Judge · cần đối chiếu bằng chứng</small>
                          <div className="ham-score-strip" style={{ marginTop: '8px' }}>
                            {HUMAN_AUDIT_RUBRIC.map(({ key }) => <span key={key}>{key}<b>{selectedItem.ai_scores?.[key] ?? '—'}</b></span>)}
                          </div>
                        </div>
                      </label>
                    )}

                    {/* Candidate Options: Filtered Staff Reviews based on active modalTargetFilter */}
                    {(modalTargetFilter === 'ft' ? ftReviews : modalTargetFilter === 'base' ? baseReviews : allUniqueReviews).map((review: any) => {
                      const isBase = (review.targetModel || review.target_model) === 'base';
                      return (
                        <label key={review._id} className={selectedReviewId === review._id && resolution === 'accept_staff' ? 'selected' : ''}>
                          <input
                            type="radio"
                            name="adjudication_candidate"
                            checked={selectedReviewId === review._id && resolution === 'accept_staff'}
                            onChange={() => { setResolution('accept_staff'); setSelectedReviewId(review._id); }}
                          />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <strong>{review.reviewerName}</strong>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: isBase ? '#fef3c7' : '#e0e7ff', color: isBase ? '#b45309' : '#4338ca' }}>
                                {isBase ? '🔲 Base Model' : '🎯 Fine-tuned'}
                              </span>
                            </div>
                            <small>{review.verdict === 'skip' ? 'Đã bỏ qua' : `K ${review.humanScores?.B1 || review.humanScores?.K || '—'} · A1 ${review.humanScores?.A1 || '—'} · S ${review.humanOutcomes?.socratic_s || review.humanScores?.S || '—'}`}</small>
                            <p>{review.note || 'Không có nhận xét tổng quát.'}</p>
                            {review.humanScores && <div className="ham-score-strip">{HUMAN_AUDIT_RUBRIC.map(({ key }) => <span key={key}>{key}<b>{review.humanScores[key]}</b></span>)}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="ham-resolution-tabs">
                <button type="button" className={resolution === 'accept_ai' ? 'active' : ''} onClick={() => setResolution('accept_ai')}>Chọn AI Judge</button>
                <button type="button" className={resolution === 'accept_staff' ? 'active' : ''} onClick={() => setResolution('accept_staff')}>Chọn bản Staff</button>
                <button type="button" className={resolution === 'manual' ? 'active' : ''} onClick={() => setResolution('manual')}>{isChecker ? 'Checker chấm lại' : 'Chấm lại thủ công'}</button>
              </div>

              {resolution === 'manual' && (
                <div className="ham-manual-grid">
                  {HUMAN_AUDIT_RUBRIC.map(criterion => {
                    const value = finalScores[criterion.key];
                    const intermediate = [2, 3, 4].includes(Number(value));
                    return (
                      <article key={criterion.key}>
                        <header><b>{criterion.key}</b><span>{criterion.title}</span></header>
                        <div>{[0,1,2,3,4,5].map(score => <button type="button" className={value === score ? 'active' : ''} key={score} onClick={() => setFinalScores(previous => ({ ...previous, [criterion.key]: score }))}>{score}</button>)}</div>
                        {value !== null && <small>{SCORE_ANCHORS[Number(value)]}</small>}
                        <input value={finalReasons[criterion.key] || ''} onChange={event => setFinalReasons(previous => ({ ...previous, [criterion.key]: event.target.value }))} placeholder={intermediate ? 'Bắt buộc nêu lý do điểm trung gian' : 'Bằng chứng/lý do'} />
                      </article>
                    );
                  })}
                </div>
              )}

              <label className="ham-note">
                Lý do chốt kết quả
                <textarea value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} placeholder="Nêu bằng chứng và lý do chọn AI, một bản Staff hoặc chấm lại..." />
              </label>
              <footer>
                <div><AlertTriangle size={15} /> Quyết định mới tạo canonical; không xóa bản chấm gốc.</div>
                <button type="button" onClick={adjudicate} disabled={saving}>{saving ? <RefreshCw className="spin" size={15} /> : <Scale size={15} />} Chốt kết quả</button>
              </footer>
            </section>
          </div>
        );
      })()}
    </div>
  );
}
