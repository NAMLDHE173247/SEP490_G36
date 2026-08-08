import '../styles/dataprep.css';
import { apiService } from '../services/api';
import React, { useState, useRef } from 'react';
import { Stage1Upload } from './DataPrep/stages/Stage1Upload';
import { Stage6Finish } from './DataPrep/stages/Stage6Finish';
import { Stage3Labeling } from './DataPrep/stages/Stage3Labeling';
import { Stage4Labeling } from '../components/dataprep/Stage4Labeling';
import { DataPrepProvider, useDataPrep } from './DataPrep/DataPrepContext';
import { Stage2Preprocessing } from './DataPrep/stages/Stage2Preprocessing';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, HelpCircle, MessageSquare, Plus, RefreshCw, RotateCcw, Scissors, Settings, Sparkles, Upload, X } from 'lucide-react';

const STAGES = [
  { num: 1, label: 'Tải lên & Chuyển đổi', sub: 'Bước 1' },
  { num: 2, label: 'Tiền xử lý', sub: 'Bước 2-4' },
  { num: 3, label: 'Gán nhãn', sub: 'Bước 5-7' },
  { num: 4, label: 'Xem xét & Phân loại', sub: 'Bước 8-11' },
  { num: 5, label: 'Hoàn tất', sub: 'Bước 12-14' },
];

const SUB_STEPS_STAGE2 = [
  { num: 1, label: 'Clean' },
  { num: 2, label: 'Find K' },
  { num: 3, label: 'K-means Cluster' },
];

const SAMPLE_RAW_DATA = `[
  {
    "conversations": [
      {
        "conversation_id": "conv_001",
        "messages": [
          {
            "role": "user",
            "content": "Hello!"
          },
          {
            "role": "assistant",
            "content": "Hi there!"
          }
        ]
      }
    ]
  }
]`;

const SAMPLE_OUTPUT = `{
  "conversation_id": "conv_001",
  "messages": [
    { "role": "user", "content": "I need help resetting my password" },
    { "role": "assistant", "content": "Go to Settings > Security to reset it." }
  ]
}`;

/* Demo conversation data for Stage 2 preview table */
const CONVERSATIONS = [
  {
    id: 'conv_001',
    messages: [
      { user: 'Em không hiểu chuyển động thẳng đều là gì.', assistant: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?' },
      { user: 'Là vật đang đi chuyển a.', assistant: 'Đúng rồi. Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ ta gọi đó là loại chuyển động gì?' },
      { user: 'Chuyển động đều a?', assistant: 'Rất gần rồi! Đây đủ hơn là \'chuyển động thẳng đều\'. Em thử đoán xem \'thẳng\' ở đây có nghĩa là gì trong chuyển động?' },
      { user: 'Thẳng thì đi theo đường thẳng a.', assistant: 'Đúng rồi. Còn \'đều\' thì sao? Tốc độ có thay đổi không?' },
      { user: 'Chuyển động đều có gia tốc bằng 0 phải không a?', assistant: 'Em suy luận đúng rồi. Vì vận tốc không đổi nên gia tốc bằng 0. Đây là nền tảng để hiểu chuyển động biến đổi đều ở bài sau.' },
    ]
  },
  {
    id: 'conv_002',
    messages: [
      { user: 'Công thức x = x0 + vt có nghĩa là gì a?', assistant: 'Câu hỏi hay. Trước khi giải thích công thức, em cho thầy biết: trong công thức đó, em đoán x và x0 biểu diễn điều gì?' },
      { user: 'x là vị trí còn x0 là vị trí ban đầu a?', assistant: 'Đúng rồi! Vậy vt là gì? Nếu v là vận tốc và t là thời gian, tích v nhân t sẽ cho ta biết điều gì?' },
      { user: 'Cho biết quãng đường a.', assistant: 'Chính xác. Vậy công thức x = x0 + vt có nghĩa là vị trí hiện tại bằng vị trí ban đầu cộng quãng đường đi được.' },
    ]
  },
  {
    id: 'conv_003',
    messages: [
      { user: 'Cho em đáp án luôn đi, em không có thời gian.', assistant: 'Thầy hiểu em đang bận, nhưng nếu đưa đáp án ngay thì em sẽ khó nhớ lâu. Mình chỉ cần một câu thôi: em nghĩ chuyển động thẳng đều khác chuyển động cong ở điểm gì?' },
      { user: 'Thẳng thì đi thẳng còn cong thì đi cong.', assistant: 'Đúng vậy! Thêm nữa, chuyển động thẳng đều còn có đặc điểm gì về vận tốc?' },
      { user: 'Vận tốc không đổi.', assistant: 'Hoàn hảo! Em đã nắm được 2 đặc điểm quan trọng: đi theo đường thẳng và vận tốc không đổi.' },
      { user: 'Vì gia tốc là đo thay đổi vận tốc, mà vận tốc không đổi nên gia tốc = 0 a.', assistant: 'Chính xác hoàn toàn. Em đã kết nối được hai khái niệm với nhau rất tốt.' },
    ]
  },
  {
    id: 'conv_004',
    messages: [
      { user: 'Lực là gì ạ?', assistant: 'Câu hỏi rất cơ bản và quan trọng! Em thử nghĩ xem: khi em đẩy một cái bàn, em đang tác dụng gì lên bàn?' },
      { user: 'Em đang đẩy nó, tức là tác dụng lực?', assistant: 'Chính xác! Lực là đại lượng đo tác dụng đẩy hoặc kéo của vật này lên vật khác. Đơn vị của lực là Newton (N).' },
      { user: 'Newton là ai vậy thầy?', assistant: 'Isaac Newton là nhà vật lý vĩ đại người Anh. Ông đã phát hiện ra 3 định luật Newton về chuyển động, đặt nền tảng cho cơ học cổ điển.' },
    ]
  },
  {
    id: 'conv_005',
    messages: [
      { user: 'Thầy ơi, định luật 1 Newton nói gì ạ?', assistant: 'Định luật 1 Newton nói rằng: một vật sẽ giữ nguyên trạng thái đứng yên hoặc chuyển động thẳng đều nếu không có lực nào tác dụng lên nó.' },
      { user: 'Tức là nếu không ai đẩy thì nó đứng yên mãi?', assistant: 'Đúng ý rồi! Và nếu nó đang chuyển động mà không có lực cản thì nó cũng sẽ chuyển động mãi với vận tốc không đổi.' },
    ]
  },
  {
    id: 'conv_006',
    messages: [
      { user: 'Định luật 2 Newton là gì ạ?', assistant: 'Định luật 2 Newton phát biểu: F = m × a. Lực tác dụng lên vật bằng khối lượng nhân với gia tốc.' },
      { user: 'Vậy nếu m lớn thì a nhỏ phải không?', assistant: 'Chính xác! Với cùng một lực F, vật có khối lượng lớn hơn sẽ có gia tốc nhỏ hơn. Đó là lý do xe tải khó tăng tốc hơn xe máy.' },
      { user: 'À ra vậy, cảm ơn thầy ạ!', assistant: 'Không có gì! Em nhớ: F = ma là công thức quan trọng nhất trong cơ học cổ điển nhé.' },
    ]
  },
  {
    id: 'conv_007',
    messages: [
      { user: 'Định luật 3 Newton nói về gì ạ?', assistant: 'Định luật 3 nói rằng: mọi lực tác dụng đều có một phản lực bằng về độ lớn và ngược chiều. Em thử cho ví dụ xem?' },
      { user: 'Khi em đấm vào tường thì tay em cũng đau?', assistant: 'Ví dụ rất hay! Tay em tác dụng lực lên tường, đồng thời tường cũng tác dụng ngược lại lên tay em một lực bằng về độ lớn. Đó là lý do tay đau!' },
    ]
  },
  {
    id: 'conv_008',
    messages: [
      { user: 'Trọng lực là gì thầy?', assistant: 'Trọng lực là lực hút của Trái Đất tác dụng lên mọi vật. Công thức: P = m × g, trong đó g ≈ 9.8 m/s².' },
      { user: 'Vậy trên Mặt Trăng thì g khác phải không?', assistant: 'Đúng rồi! Trên Mặt Trăng g chỉ khoảng 1.6 m/s², nên em sẽ nhẹ hơn 6 lần so với trên Trái Đất.' },
      { user: 'Vậy em có thể nhảy cao hơn trên Mặt Trăng?', assistant: 'Chắc chắn rồi! Với cùng lực nhảy, em sẽ bay cao gấp khoảng 6 lần. Đó là lý do các phi hành gia nhảy rất cao trên Mặt Trăng.' },
    ]
  },
  {
    id: 'conv_009',
    messages: [
      { user: 'Lực ma sát là gì ạ?', assistant: 'Lực ma sát là lực cản trở chuyển động của vật khi nó tiếp xúc với bề mặt khác. Em thử nghĩ xem: tại sao xe phanh lại dừng được?' },
      { user: 'Vì ma sát giữa bánh xe và mặt đường?', assistant: 'Chính xác! Không có ma sát thì xe sẽ trượt mãi không dừng được, giống như trên sân băng vậy.' },
    ]
  },
  {
    id: 'conv_010',
    messages: [
      { user: 'Động năng là gì thầy?', assistant: 'Động năng là năng lượng mà vật có được nhờ chuyển động. Công thức: Eđ = ½mv². Em thấy v bình phương có ý nghĩa gì?' },
      { user: 'Tức là vận tốc tăng gấp đôi thì động năng tăng gấp 4?', assistant: 'Xuất sắc! Đúng vậy, đó là lý do va chạm ở tốc độ cao nguy hiểm hơn rất nhiều.' },
      { user: 'Vậy xe chạy 60km/h nguy hiểm gấp 4 lần 30km/h?', assistant: 'Về mặt động năng thì đúng vậy! Năng lượng va chạm tăng gấp 4 lần, nên hậu quả cũng nghiêm trọng hơn rất nhiều.' },
    ]
  },
  {
    id: 'conv_011',
    messages: [
      { user: 'Thế năng là gì ạ?', assistant: 'Thế năng là năng lượng dự trữ do vị trí của vật. Ví dụ: một quả bóng trên cao có thế năng hấp dẫn Et = mgh.' },
      { user: 'Vậy càng cao thì thế năng càng lớn?', assistant: 'Đúng rồi! Khi thả quả bóng, thế năng chuyển thành động năng. Đây là bảo toàn năng lượng.' },
    ]
  },
  {
    id: 'conv_012',
    messages: [
      { user: 'Công suất là gì ạ thầy?', assistant: 'Công suất là tốc độ thực hiện công. P = W/t, đơn vị là Watt (W). Em thử nghĩ: hai người cùng khuân 100kg lên lầu, một người mất 1 phút, người kia mất 2 phút. Ai có công suất lớn hơn?' },
      { user: 'Người mất 1 phút vì làm nhanh hơn?', assistant: 'Chính xác! Cùng một công (W), nhưng thời gian ít hơn nên công suất lớn hơn gấp đôi.' },
      { user: 'Vậy bóng đèn 100W sáng hơn 60W?', assistant: 'Đúng vậy! Bóng 100W tiêu thụ năng lượng nhanh hơn, nên phát sáng mạnh hơn, nhưng cũng tốn điện hơn.' },
      { user: 'Cảm ơn thầy, em hiểu rồi ạ!', assistant: 'Tốt lắm! Em nhớ công suất = công / thời gian. Đơn vị: 1 W = 1 J/s nhé.' },
    ]
  },
  {
    id: 'conv_013',
    messages: [
      { user: 'Áp suất là gì thầy?', assistant: 'Áp suất là lực tác dụng trên một đơn vị diện tích: P = F/S. Em thử giải thích tại sao dao sắc cắt dễ hơn dao cùn?' },
      { user: 'Vì lưỡi dao sắc có diện tích tiếp xúc nhỏ hơn, nên áp suất lớn hơn?', assistant: 'Hoàn hảo! Cùng một lực ấn, diện tích nhỏ hơn → áp suất lớn hơn → cắt dễ hơn. Em hiểu rất nhanh!' },
    ]
  },
  {
    id: 'conv_014',
    messages: [
      { user: 'Moment lực là gì ạ?', assistant: 'Moment lực là đại lượng đo tác dụng làm quay của lực. M = F × d, trong đó d là cánh tay đòn.' },
      { user: 'Cánh tay đòn là gì?', assistant: 'Cánh tay đòn là khoảng cách từ trục quay đến đường tác dụng của lực. Ví dụ: khi mở cửa, em nắm tay nắm xa bản lề thì mở dễ hơn vì cánh tay đòn lớn hơn.' },
      { user: 'À vậy nên tay nắm cửa luôn ở xa bản lề?', assistant: 'Chính xác! Đó là ứng dụng thực tế của moment lực. Cánh tay đòn lớn → cần ít lực hơn để mở cửa.' },
    ]
  },
  {
    id: 'conv_015',
    messages: [
      { user: 'Sóng âm là gì ạ?', assistant: 'Sóng âm là sóng cơ truyền trong các môi trường vật chất (rắn, lỏng, khí). Tai người nghe được sóng âm có tần số từ 20 Hz đến 20.000 Hz.' },
      { user: 'Sóng siêu âm là gì?', assistant: 'Sóng siêu âm có tần số trên 20.000 Hz, tai người không nghe được. Ứng dụng trong y tế (siêu âm thai), công nghiệp (kiểm tra khuyết tật).' },
      { user: 'Vậy dơi nghe được sóng siêu âm?', assistant: 'Đúng vậy! Dơi phát và nhận sóng siêu âm để định vị trong bóng tối, gọi là echolocation. Rất thông minh phải không?' },
      { user: 'Hay quá thầy! Em muốn tìm hiểu thêm về sóng.', assistant: 'Tốt lắm! Bài tiếp theo mình sẽ học về sóng điện từ và ánh sáng. Đó là một chủ đề rất thú vị!' },
    ]
  },
];

const Tooltip = ({ children, text }) => {
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

function DataPrepInner() {
  const {
    currentStage, setCurrentStage, currentSubStep, setCurrentSubStep,
    file, setFile, rawPreviewText, setRawPreviewText,
    sampleOutputText, setSampleOutputText, projectName, setProjectName,
    rawPreviewOpen, setRawPreviewOpen, conversationsList, setConversationsList,
    selectedFormat, setSelectedFormat, removeThinkTags, setRemoveThinkTags,
    cleaningEnabled, setCleaningEnabled, cleaningApplied, setCleaningApplied,
    showPreviewModal, setShowPreviewModal, previewTab, setPreviewTab,
    conversionStats, setConversionStats, isCleaningLoading, setIsCleaningLoading,
    pendingCleanedList, setPendingCleanedList,
    workflowVersions, activeWorkflowVersion, isHydratingWorkflow, openWorkflowVersion, startNewWorkflow
  } = useDataPrep();

  const [cleaningPreviewBefore, setCleaningPreviewBefore] = useState<any[]>([]);
  const [cleaningPreviewAfter, setCleaningPreviewAfter] = useState<any[]>([]);
  const [cleaningPreviewRemoved, setCleaningPreviewRemoved] = useState<any[]>([]);
  const pendingWorkflow = (workflowVersions || []).find((version: any) => Number(version.prepareResumeStep || 1) > 1) || null;
  const activeResumeStep = Number(activeWorkflowVersion?.prepareResumeStep || pendingWorkflow?.prepareResumeStep || 1);
  const shouldShowWorkflowBar = Boolean(activeWorkflowVersion || pendingWorkflow);
  const getResumeLabel = (step: number) => {
    if (step >= 13) return 'Continue final export';
    if (step >= 12) return 'Continue dataset distribution';
    if (step >= 11) return 'Continue rewrite review';
    if (step >= 10) return 'Continue rewrite assignment';
    if (step >= 8) return 'Continue quality review';
    if (step >= 7) return 'Waiting for staff labels';
    if (step >= 5) return 'Continue labeling setup';
    if (step >= 2) return 'Continue preprocessing';
    return 'Continue upload';
  };

  /* Cleaning options */
  const [removeErrorKeywords, setRemoveErrorKeywords] = useState(true);
  const [removeUnclosedThink, setRemoveUnclosedThink] = useState(true);
  const [removeCompleteThink, setRemoveCompleteThink] = useState(false);
  const [minChars, setMinChars] = useState('5');
  const [maxChars, setMaxChars] = useState('4000');
  const [minPairs, setMinPairs] = useState('1');

  /* Stage 2 pagination - by conversations */
  const [currentPage, setCurrentPage] = useState(1);
  const [convsPerPage, setConvsPerPage] = useState(10);
  const [expandedConvs, setExpandedConvs] = useState({});
  const [expandedCells, setExpandedCells] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  /* Find K state */
  const [maxK, setMaxK] = useState('20');
  const [eps, setEps] = useState('0.1');
  const [minSamples, setMinSamples] = useState('3');
  const [showVisualization, setShowVisualization] = useState(false);
  const [isFindingK, setIsFindingK] = useState(false);
  const [findKResults, setFindKResults] = useState<any>(null);

  /* K-means Cluster state */
  const [targetK, setTargetK] = useState('14');
  const [clusterEps, setClusterEps] = useState('0.1');
  const [clusterMinSamples, setClusterMinSamples] = useState('3');
  const [clusterRan, setClusterRan] = useState(false);
  const [simThreshold, setSimThreshold] = useState(0.9);
  const [clusterPage, setClusterPage] = useState(1);
  const clusterPerPage = 5;
  const [isClustering, setIsClustering] = useState(false);
  const [clusterResults, setClusterResults] = useState<any>(null);

  /* Compare Groups state */
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareSlot1, setCompareSlot1] = useState(null);
  const [compareSlot2, setCompareSlot2] = useState(null);
  const [activeCompareDropdown, setActiveCompareDropdown] = useState(null);

  /* Clustering Options Popup */
  const [showClusterOptionsPopup, setShowClusterOptionsPopup] = useState(false);

  /* Data Cleaning Pipeline Popup */
  const [showCleaningPopup, setShowCleaningPopup] = useState(false);
  const [cleaningPopupView, setCleaningPopupView] = useState('settings'); // 'settings' | 'preview'

  /* Conversation Detail Popup */
  const [selectedConv, setSelectedConv] = useState(null);

  // Renders message content, highlighting <think>...</think> tags visually
  // instead of letting the browser parse them as unknown HTML elements
  const renderMessageContent = (content: string) => {
    if (!content) return null;
    const parts: React.ReactNode[] = [];
    const str = content;
    const localRegex = /<think>([\s\S]*?)<\/think>|<think>([\s\S]*)$/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = localRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${idx}`}>{str.slice(lastIndex, match.index)}</span>);
        idx++;
      }
      const isUnclosed = match[2] !== undefined;
      const thinkContent = isUnclosed ? match[2] : match[1];
      parts.push(
        <span
          key={`think-${idx}`}
          style={{
            display: 'inline-block',
            background: isUnclosed ? '#fff3cd' : '#fef9c3',
            border: `1px solid ${isUnclosed ? '#f59e0b' : '#eab308'}`,
            borderRadius: '4px',
            padding: '2px 6px',
            margin: '0 2px',
            fontSize: '0.85em',
            color: '#92400e',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
          title={isUnclosed ? 'Thẻ <think> chưa đóng — cần làm sạch' : 'Thẻ <think>...</think> hoàn chỉnh — cần làm sạch'}
        >
          <span style={{ opacity: 0.6, fontSize: '0.8em' }}>{isUnclosed ? '⚠ &lt;think&gt;' : '🧠 &lt;think&gt;'}</span>
          {' '}{thinkContent}
          {!isUnclosed && <span style={{ opacity: 0.6, fontSize: '0.8em' }}>{' &lt;/think&gt;'}</span>}
        </span>
      );
      idx++;
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      parts.push(<span key={`text-end-${idx}`}>{str.slice(lastIndex)}</span>);
    }
    return parts.length > 0 ? <>{parts}</> : <>{content}</>;
  };

  /* Stage 3 state */
  const SUB_STEPS_STAGE3 = [
    { num: 5, label: 'Clustering & Labeling' },
    { num: 6, label: 'Save & Assign' },
    { num: 7, label: 'Intent-Action' }
  ];
  const [stage3Page, setStage3Page] = useState(1);
  const [stage3Search, setStage3Search] = useState('');
  const [stage3PerPage, setStage3PerPage] = useState(10);
  const [selectedConv3, setSelectedConv3] = useState(null);
  const [currentSubStep3, setCurrentSubStep3] = useState(5);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [stage3SubGroup, setStage3SubGroup] = useState('A');
  const [selectedGroup3, setSelectedGroup3] = useState(null);
  const [iaActiveTab, setIaActiveTab] = useState('assignment');
  const [showCompareLabels, setShowCompareLabels] = useState(false);
  const [pendingAiLabels, setPendingAiLabels] = useState<string[]>([]);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [customSubjectLabels, setCustomSubjectLabels] = useState<string[]>([]);
  /* AI Labeling state */
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'groq' | 'openrouter' | 'gemini' | 'openai'>('deepseek');
  const [stage3Convs, setStage3Convs] = useState<any[]>([]);
  const [isSavingLabels, setIsSavingLabels] = useState(false);
  const [isLabelingWithAI, setIsLabelingWithAI] = useState(false);
  const [checkedConvIds, setCheckedConvIds] = useState<string[]>([]);
  const [aiGroupLabels, setAiGroupLabels] = useState<Record<number, string>>({});

  React.useEffect(() => {
    if (currentStage === 4) {
      if (currentSubStep4 < 7 || currentSubStep4 > 12) {
        setCurrentSubStep4(7);
      }
    }
  }, [currentStage]);

  const cleanVietnameseGreetings = (text: string): string => {
    let cleaned = text.trim();

    // Danh sách các từ chào/lời dẫn tiếng Việt thường gặp ở đầu câu
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
      // Remove leading punctuation like comma, space, colon
      cleaned = cleaned.replace(/^[\s,.:;!?~-]+/, '').trim();
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
    return cleaned || text.trim();
  };

  const cleanAssistantGreetings = (text: string): string => {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const introPatterns = [
      /^(dạ\s+)?chào\s+(em|bạn|mọi\s+người)(xuống\s+ạ|ạ)?/i,
      /^(thầy|cô)\s+chào\s+(em|bạn)/i,
      /^chào\s+em\s+nhé/i,
      /^chào\s+em/i,
      /^dạ/i,
      /^thầy\s+rất\s+vui/i,
      /^không\s+sao/i,
      /^câu\s+hỏi\s+hay/i,
      /^câu\s+hỏi\s+rất\s+hay/i,
      /^câu\s+hỏi\s+thú\s+vị/i,
      /^cảm\s+ơn\s+em/i,
      /^chào/i,
      /^hello/i,
      /^hi/i
    ];

    let matched = true;
    while (matched) {
      matched = false;
      cleaned = cleaned.replace(/^[\s,.:;!?~-]+/, '').trim();
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

  const truncateText = (text: string, limit: number = 150) => {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
  };

  const highlightSearch = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} className="search-highlight">{part}</span>
        : part
    );
  };

  const getConversationTopic = (messages: any[]) => {
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

    const cleanText = targetText.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (cleanText.length <= 80) return cleanText;

    const sentences = cleanText.split(/[.!?\n]/);
    const firstSentence = sentences[0].trim();
    if (firstSentence.length > 15 && firstSentence.length <= 100) return firstSentence;

    const words = cleanText.split(/\s+/);
    if (words.length > 10) {
      return words.slice(0, 10).join(' ') + '...';
    }
    return cleanText.substring(0, 80) + '...';
  };

  const getAssistantSummary = (messages: any[]) => {
    if (!messages || messages.length === 0) return 'Không có phản hồi';

    const meaningfulIdx = messages.findIndex(m => {
      const rawText = m.user || '';
      const cleaned = cleanVietnameseGreetings(rawText);
      return cleaned.length >= 5;
    });

    const targetMsg = meaningfulIdx !== -1 ? messages[meaningfulIdx] : messages[0];
    const targetText = targetMsg ? targetMsg.assistant : '';
    if (!targetText) return 'Không có nội dung';

    const cleanText = cleanAssistantGreetings(targetText).trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (cleanText.length <= 80) return cleanText;

    const sentences = cleanText.split(/[.!?\n]/);
    const firstSentence = sentences[0].trim();
    if (firstSentence.length > 15 && firstSentence.length <= 100) return firstSentence;

    const words = cleanText.split(/\s+/);
    if (words.length > 10) {
      return words.slice(0, 10).join(' ') + '...';
    }
    return cleanText.substring(0, 80) + '...';
  };
  const [selectedIaMsgId, setSelectedIaMsgId] = useState(null);
  const [iaMessages, setIaMessages] = useState<any[]>([
    {
      id: 1,
      role: 'user',
      turn: 1,
      text: 'Em không hiểu chuyển động thẳng đều là gì.',
      selectedLabel: 'THEO',
      labels: {
        KNOWLEDGE: [
          { name: 'OK', count: 0, icon: '✓', colorClass: 'green' },
          { name: 'NO', count: 0, icon: '✕', colorClass: 'red' }
        ],
        REQUEST: [
          { name: 'HINT', count: 0, icon: '💡' },
          { name: 'THEO', count: 2, icon: '📖', active: true },
          { name: 'WHY', count: 0, icon: 'ⓘ' },
          { name: 'EASY', count: 0, icon: '⤢' }
        ],
        ACTION: [
          { name: 'SKIP', count: 0, icon: '⏸' },
          { name: 'NEXT', count: 0, icon: '→' },
          { name: 'WAIT', count: 0, icon: '🕒' }
        ],
        OTHER: [
          { name: 'ENC', count: 0, icon: '♡' },
          { name: 'OFF', count: 0, icon: '◯' }
        ],
        ISSUES: [
          { name: 'FACT_ERR', count: 0, icon: 'ⓘ' },
          { name: 'LANG_ISSUE', count: 0, icon: '💬' }
        ]
      }
    },
    {
      id: 2,
      role: 'assistant',
      turn: 1,
      text: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?',
      selectedLabel: 'SCAF',
      labels: {
        PEDAGOGY: [
          { name: 'SCAF', count: 2, icon: '≡', colorClass: 'blue', active: true },
          { name: 'HINT', count: 0, icon: '💡' },
          { name: 'CLR', count: 0, icon: '📖' },
          { name: 'LOG', count: 0, icon: '≡' },
          { name: 'SIMP', count: 0, icon: '⤢' }
        ],
        NAVIGATION: [
          { name: 'PR', count: 1, icon: '✧' },
          { name: 'NAV', count: 0, icon: '⌲' },
          { name: 'MOT', count: 0, icon: '♡' },
          { name: 'REDIR', count: 0, icon: '⟲' },
          { name: 'TRAN', count: 0, icon: '→' },
          { name: 'WAIT', count: 0, icon: '⏸' }
        ],
        ISSUES: [
          { name: 'DIR_ANS', count: 0, icon: '→' },
          { name: 'FACT_ERR', count: 0, icon: 'ⓘ' },
          { name: 'LANG_ISSUE', count: 0, icon: '💬' }
        ]
      }
    },
    {
      id: 3,
      role: 'user',
      turn: 2,
      text: 'Là vật đang di chuyển a.',
      selectedLabel: 'OK',
      labels: {
        KNOWLEDGE: [
          { name: 'OK', count: 3, icon: '✓', colorClass: 'green', active: true },
          { name: 'NO', count: 0, icon: '✕', colorClass: 'red' }
        ],
        REQUEST: [
          { name: 'HINT', count: 0, icon: '💡' },
          { name: 'THEO', count: 2, icon: '📖' },
          { name: 'WHY', count: 0, icon: 'ⓘ' },
          { name: 'EASY', count: 0, icon: '⤢' }
        ],
        ACTION: [
          { name: 'SKIP', count: 0, icon: '⏸' },
          { name: 'NEXT', count: 0, icon: '→' },
          { name: 'WAIT', count: 0, icon: '🕒' }
        ],
        OTHER: [
          { name: 'ENC', count: 0, icon: '♡' },
          { name: 'OFF', count: 0, icon: '◯' }
        ],
        ISSUES: [
          { name: 'FACT_ERR', count: 0, icon: 'ⓘ' },
          { name: 'LANG_ISSUE', count: 0, icon: '💬' }
        ]
      }
    },
    {
      id: 4,
      role: 'assistant',
      turn: 2,
      text: 'Đúng rồi. Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ là gọi đó là loại chuyển động gì?',
      selectedLabel: 'SCAF',
      labels: {
        PEDAGOGY: [
          { name: 'SCAF', count: 2, icon: '≡', colorClass: 'blue', active: true },
          { name: 'HINT', count: 0, icon: '💡' },
          { name: 'CLR', count: 0, icon: '📖' },
          { name: 'LOG', count: 0, icon: '≡' },
          { name: 'SIMP', count: 0, icon: '⤢' }
        ],
        NAVIGATION: [
          { name: 'PR', count: 1, icon: '✧' },
          { name: 'NAV', count: 0, icon: '⌲' },
          { name: 'MOT', count: 0, icon: '♡' },
          { name: 'REDIR', count: 0, icon: '⟲' },
          { name: 'TRAN', count: 0, icon: '→' },
          { name: 'WAIT', count: 0, icon: '⏸' }
        ],
        ISSUES: [
          { name: 'DIR_ANS', count: 0, icon: '→' },
          { name: 'FACT_ERR', count: 0, icon: 'ⓘ' },
          { name: 'LANG_ISSUE', count: 0, icon: '💬' }
        ]
      }
    },
    {
      id: 5,
      role: 'user',
      turn: 3,
      text: 'Chuyển động đều a?',
      selectedLabel: 'OK',
      labels: {
        KNOWLEDGE: [
          { name: 'OK', count: 3, icon: '✓', colorClass: 'green', active: true },
          { name: 'NO', count: 0, icon: '✕', colorClass: 'red' }
        ],
        REQUEST: [
          { name: 'HINT', count: 0, icon: '💡' },
          { name: 'THEO', count: 0, icon: '📖' },
          { name: 'WHY', count: 0, icon: 'ⓘ' },
          { name: 'EASY', count: 0, icon: '⤢' }
        ],
        ACTION: [
          { name: 'SKIP', count: 0, icon: '⏸' },
          { name: 'NEXT', count: 0, icon: '→' },
          { name: 'WAIT', count: 0, icon: '🕒' }
        ],
        OTHER: [
          { name: 'ENC', count: 0, icon: '♡' },
          { name: 'OFF', count: 0, icon: '◯' }
        ],
        ISSUES: [
          { name: 'FACT_ERR', count: 0, icon: 'ⓘ' },
          { name: 'LANG_ISSUE', count: 0, icon: '💬' }
        ]
      }
    }
  ]);

  const getLabelBadgeStyle = (labelName) => {
    const name = labelName.toUpperCase();
    if (name === 'SCAF') {
      return { backgroundColor: '#475569', color: '#ffffff' };
    }
    if (name === 'HINT') {
      return { backgroundColor: '#f97316', color: '#ffffff' };
    }
    if (name === 'PR') {
      return { backgroundColor: '#10b981', color: '#ffffff' };
    }
    if (name === 'OK') {
      return { backgroundColor: '#16a34a', color: '#ffffff' };
    }
    if (name === 'THEO') {
      return { backgroundColor: '#7c3aed', color: '#ffffff' };
    }
    return { backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };
  };

  const handleToggleLabel = (msgId, groupName, tagName) => {
    setIaMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;

      const newLabels = { ...msg.labels };
      newLabels[groupName] = newLabels[groupName].map(tag => {
        if (tag.name === tagName) {
          const newActive = !tag.active;
          return {
            ...tag,
            active: newActive,
            count: newActive ? tag.count + 1 : Math.max(0, tag.count - 1)
          };
        }
        return tag;
      });

      return {
        ...msg,
        labels: newLabels
      };
    }));
  };

  const handleRemoveMessageSingleLabel = (msgId, tagName) => {
    setIaMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;

      const newLabels = { ...msg.labels };
      Object.keys(newLabels).forEach(g => {
        newLabels[g] = newLabels[g].map(tag => {
          if (tag.name === tagName && tag.active) {
            return {
              ...tag,
              active: false,
              count: Math.max(0, tag.count - 1)
            };
          }
          return tag;
        });
      });

      return {
        ...msg,
        labels: newLabels
      };
    }));
  };

  /* Stage 4 state */
  const SUB_STEPS_STAGE4 = [
    { num: 8, label: 'Classification' },
    { num: 9, label: 'Quality Management' },
    { num: 10, label: 'Rewrite Assignment' },
    { num: 11, label: 'Assignment Review' },
  ];
  const [currentSubStep4, setCurrentSubStep4] = useState(7);
  const [classPage, setClassPage] = useState(1);
  const [qualityTab, setQualityTab] = useState('all');
  const [rewriteConvIdx, setRewriteConvIdx] = useState(8);
  const [rewriteTab, setRewriteTab] = useState('original');

  /* Stage 5 state */
  const [judgeModels, setJudgeModels] = useState({ openrouter: true, groq: false, deepseek: true });
  const [evalExpanded, setEvalExpanded] = useState('eval_428051');
  const [sepQualityModal, setSepQualityModal] = useState(null);
  const [sepDistributionTab, setSepDistributionTab] = useState('subject');
  const [sepEvalRecommendation, setSepEvalRecommendation] = useState('all');
  const [sepEvalConflictOnly, setSepEvalConflictOnly] = useState(false);
  const [sepEvalMinScore, setSepEvalMinScore] = useState(0);
  const [sepRunningClass, setSepRunningClass] = useState(false);
  const [sepRunningQuality, setSepRunningQuality] = useState(false);
  const [sepRunningEval, setSepRunningEval] = useState(false);
  const [sepSubjectFilter, setSepSubjectFilter] = useState('ALL');
  const [sepSelectedDistSubject, setSepSelectedDistSubject] = useState('ALL');
  const [sepSelectedDistQuality, setSepSelectedDistQuality] = useState('Rewrite');
  const [sepSelectedError, setSepSelectedError] = useState('');
  const [sepBalanceApplied, setSepBalanceApplied] = useState(false);
  const [sepRewriteGenerated, setSepRewriteGenerated] = useState(false);
  const [sepRewriteDecision, setSepRewriteDecision] = useState('ai');
  const [sepQualityRatings, setSepQualityRatings] = useState({});
  const [sepQualityLabels, setSepQualityLabels] = useState({});


  /* Stage 6 state */
  const SUB_STEPS_STAGE6 = [
    { num: 13, label: 'System Prompt' },
    { num: 14, label: 'Split Guard' },
    { num: 15, label: 'Export' },
  ];
  const [currentSubStep6, setCurrentSubStep6] = useState(13);
  const [promptText, setPromptText] = useState('');

  const isStageCompleted = (num: number) => {
    if (num < currentStage) return true;
    if (num === 1) return conversationsList && conversationsList.length > 0;
    if (num === 2) return clusterRan;
    if (num === 3) return Object.keys(aiGroupLabels).length > 0;
    if (num === 4) return Object.keys(sepQualityLabels).length > 0 || sepRewriteDecision !== 'ai';
    if (num === 5) return currentStage > 5;
    if (num === 6) return promptText && promptText.trim() !== '';
    return false;
  };

  const [promptName, setPromptName] = useState('Project_27/05_11:11');
  const [promptDesc, setPromptDesc] = useState('Example: Added Socratic method');
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [sampleQuestion, setSampleQuestion] = useState('Hãy giải phương trình bậc hai sau đây: x² - 5x + 6 = 0');
  const [trialResponse, setTrialResponse] = useState('');
  const PROMPT_VERSIONS = [
    { id: 1, name: 'Project 27/05 09:30', desc: 'Initial baseline prompt', date: '2026-05-27 09:30', content: 'You are a Socratic tutor. Guide students through questions without giving direct answers.' },
    { id: 2, name: 'Project_27/05_10:15', desc: 'Added encouragement phrases', date: '2026-05-27 10:15', content: 'You are a Socratic tutor. Guide students through questions. Use encouraging phrases like "Great thinking!" and "You\'re on the right track!"' },
    { id: 3, name: 'Project 27/05 11:11', desc: 'Added Socratic method', date: '2026-05-27 11:11', content: 'You are a Socratic tutor specializing in STEM education. Always ask guiding questions. Never give direct answers. Encourage step-by-step reasoning.' },
  ];
  const [exportPage, setExportPage] = useState(1);
  const [cloudProvider, setCloudProvider] = useState('azure');
  const EXPORT_ROWS = [
    { user: 'Hãy giải phương trình bậc hai sau đây: x^2 - 5x + 6 = 0', assistant: 'Để giải phương trình bậc hai này, mình sẽ hỏi một số câu hỏi...' },
    { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
    { user: 'Cách tính biệt thức delta và delta phẩy của phương trình bậc hai', assistant: 'Biệt thức Delta được tính bằng công thức b^2 - 4ac...' },
    { user: 'Phương trình bậc hai có hai nghiệm phân biệt khi nào?', assistant: 'Để hiểu kỹ hơn phương trình có hai nghiệm phân biệt, điều này có ý...' },
    { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
  ];

  const fileInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e: any) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      localStorage.removeItem('current_version_id');
      try {
        setFile({
          name: uploaded.name,
          format: 'Đang tải lên và phân tích...',
          messages: 0,
          conversations: 0,
          size: '...'
        });
        setUploadProgress(0);
        setRawPreviewText('Đang phân tích dữ liệu tệp...');
        setSampleOutputText('Đang tạo mẫu đầu ra...');

        const res = await apiService.uploadFile(uploaded, undefined, (progressEvent: any) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });

        setFile({
          fileId: res.fileId,
          name: res.filename,
          format: res.fileType === 'openai_messages' ? 'Định dạng OpenAI Messages' : 'Định dạng Chat/Conversations',
          messages: res.messageCount || 0,
          conversations: res.conversationCount || 0,
          size: (res.size / (1024 * 1024)).toFixed(2) + ' MB'
        });

        const previewRes = await apiService.getPreview(res.fileId, 5);
        setRawPreviewText(JSON.stringify(previewRes.preview, null, 2));

        const rawPreview = previewRes.preview;
        if (Array.isArray(rawPreview) && rawPreview.length > 0) {
          if (res.fileType === 'openai_messages') {
            setSampleOutputText(JSON.stringify(rawPreview[0], null, 2));
          } else if (res.fileType === 'lesson') {
            const firstRecord = rawPreview[0];
            const firstLesson = firstRecord.lessons?.[0];
            const firstExercise = firstLesson?.sections?.find((s: any) => s.type === 'exercise');
            if (firstExercise) {
              const sampleOutput = {
                messages: [
                  { role: 'user', content: firstExercise.content || '' },
                  { role: 'assistant', content: firstExercise.answer_text || firstExercise.answer || '' }
                ]
              };
              setSampleOutputText(JSON.stringify(sampleOutput, null, 2));
            } else {
              setSampleOutputText('');
            }
          } else {
            const convMap: Record<string, any[]> = {};
            rawPreview.forEach((msg: any) => {
              const cid = msg.conversation_id || 'default_conv';
              if (!convMap[cid]) {
                convMap[cid] = [];
              }
              convMap[cid].push(msg);
            });

            const firstKey = Object.keys(convMap)[0];
            const firstConvMessages = convMap[firstKey] || [];

            const formattedMessages = firstConvMessages.map((msg: any) => ({
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: msg.content || ''
            }));

            const sampleOutput = {
              conversation_id: firstKey,
              messages: formattedMessages
            };

            setSampleOutputText(JSON.stringify(sampleOutput, null, 2));
          }
        } else {
          setSampleOutputText('');
        }

      } catch (err: any) {
        console.error('Upload failed:', err);
        alert(err.response?.data?.error || err.message || 'Tải tệp lên thất bại');
        setFile(null);
        setRawPreviewText('');
        setSampleOutputText('');
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setRawPreviewText('');
    setSampleOutputText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const mapConvertedToConversations = (data: any[]): any[] => {
    if (!Array.isArray(data)) return [];

    return data.map((record: any, index: number) => {
      let messages: any[] = [];
      let id = record.conversation_id || `conv_${String(index + 1).padStart(3, '0')}`;

      if (record.messages && Array.isArray(record.messages)) {
        const raw = record.messages;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].role === 'user') {
            const nextAssistant = raw.slice(i + 1).find((m: any) => m.role === 'assistant');
            messages.push({
              user: raw[i].content || '',
              assistant: nextAssistant ? nextAssistant.content || '' : ''
            });
          }
        }
      } else if (record.conversations && Array.isArray(record.conversations)) {
        const raw = record.conversations;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].from === 'human') {
            const nextGpt = raw.slice(i + 1).find((m: any) => m.from === 'gpt');
            messages.push({
              user: raw[i].value || '',
              assistant: nextGpt ? nextGpt.value || '' : ''
            });
          }
        }
      } else if (record.instruction) {
        const user = record.instruction + (record.input ? '\n' + record.input : '');
        const assistant = record.output || '';
        messages.push({
          user,
          assistant
        });
      } else {
        messages.push({
          user: 'No user message',
          assistant: 'No assistant message'
        });
      }

      if (messages.length === 0) {
        messages.push({
          user: 'Trống',
          assistant: 'Trống'
        });
      }

      return {
        id,
        messages
      };
    });
  };

  const handleConvert = async () => {
    if (!file || !file.fileId) {
      alert('Vui lòng tải tệp lên trước.');
      return;
    }

    try {
      const res = await apiService.convertData(file.fileId, {
        format: selectedFormat as any,
        enableCleaning: false,
        // Always false for preview: think tags must be visible in conv detail so
        // users can see what has not been cleaned yet. Removed only at export.
        removeThinkTags: false
      });

      const mapped = mapConvertedToConversations(res.data);
      setConversationsList(mapped);
      setConversionStats(res);

      // Cập nhật cả danh sách Stage 3
      setStage3Convs(mapped.map((c, idx) => {
        const gId = (idx % 15) + 1;
        return {
          ...c,
          groupId: gId,
          groupLabel: '',
          groupColor: '#64748b',
          groupBg: '#f8fafc',
          subGroup: 'A',
          confidence: 0
        };
      }));

      setCurrentStage(2);
      setCurrentSubStep(1);
    } catch (err: any) {
      console.error('Conversion failed:', err);
      alert(err.response?.data?.error || err.message || 'Chuyển đổi dữ liệu thất bại');
    }
  };

  const handleApplyCleaning = async () => {
    if (!file || !file.fileId) {
      alert('Vui lòng tải tệp lên trước.');
      return;
    }

    try {
      setIsCleaningLoading(true);
      const res = await apiService.convertData(file.fileId, {
        format: selectedFormat as any,
        enableCleaning: true,
        removeThinkTags: removeThinkTags,
        removeBoilerplate: removeErrorKeywords,
        removeUnclosedThink: removeUnclosedThink,
        minCharsAssistant: parseInt(minChars, 10) || 5,
        maxCharsAssistant: parseInt(maxChars, 10) || 4000,
        minTurns: parseInt(minPairs, 10) || 1,
      });

      // Update states and lists
      setConversionStats(res);
      const mapped = mapConvertedToConversations(res.data);
      setPendingCleanedList(mapped);

      // We query the backend with enableCleaning: false to get the original data for preview.
      const originalRes = await apiService.convertData(file.fileId, {
        format: selectedFormat as any,
        enableCleaning: false,
        // Always false: preserve think tags in before/after comparison
        removeThinkTags: false,
      });
      const originalMapped = mapConvertedToConversations(originalRes.data);

      // Take a sample of 10 items for the before/after/removed list
      const originalSample = originalMapped.slice(0, 10);
      const cleanedSampleMap = new Map<string, any>();
      mapped.forEach(c => cleanedSampleMap.set(c.id, c));

      const beforePreview: any[] = [];
      const afterPreview: any[] = [];
      const removedPreview: any[] = [];

      originalSample.forEach(item => {
        const cleanedItem = cleanedSampleMap.get(item.id);
        const userMsg = item.messages[0]?.user || '';
        const assistantMsgBefore = item.messages[0]?.assistant || '';

        if (cleanedItem) {
          const assistantMsgAfter = cleanedItem.messages[0]?.assistant || '';
          const isFixed = assistantMsgBefore !== assistantMsgAfter;

          beforePreview.push({
            id: item.id,
            status: isFixed ? 'has-issue' : 'clean',
            issue: isFixed ? 'Cần làm sạch thẻ <think>/boilerplate' : null,
            user: userMsg,
            assistant: assistantMsgBefore,
          });

          afterPreview.push({
            id: item.id,
            status: isFixed ? 'fixed' : 'clean',
            action: isFixed ? 'Đã làm sạch bằng Regex' : 'Không thay đổi',
            user: userMsg,
            assistant: assistantMsgAfter,
          });
        } else {
          beforePreview.push({
            id: item.id,
            status: 'has-issue',
            issue: 'Bị lọc bỏ',
            user: userMsg,
            assistant: assistantMsgBefore,
          });

          removedPreview.push({
            id: item.id,
            reason: 'Không đạt tiêu chuẩn độ dài / từ khóa lỗi',
            user: userMsg,
            assistant: assistantMsgBefore,
          });
        }
      });

      setCleaningPreviewBefore(beforePreview);
      setCleaningPreviewAfter(afterPreview);
      setCleaningPreviewRemoved(removedPreview);
      setCleaningPopupView('preview');
      setPreviewTab('before');
    } catch (err: any) {
      console.error('Cleaning failed:', err);
      alert(err.response?.data?.error || err.message || 'Làm sạch dữ liệu thất bại');
    } finally {
      setIsCleaningLoading(false);
    }
  };

  const handleVisualizeK = async () => {
    if (!conversationsList || conversationsList.length === 0) {
      alert('Không có dữ liệu để tính toán. Vui lòng chuyển đổi dữ liệu trước.');
      return;
    }

    try {
      setIsFindingK(true);
      setShowVisualization(true);

      // format for api
      const formattedData = conversationsList.map(c => ({
        conversation_id: c.id,
        messages: c.messages.map((m: any) => [
          { role: 'user', content: m.user || '' },
          { role: 'assistant', content: m.assistant || '' }
        ]).flat()
      }));

      const res = await apiService.clusterVisualize(
        formattedData,
        parseInt(maxK, 10),
        parseFloat(eps),
        parseInt(minSamples, 10)
      );

      let recommendedK = 14; // Default fallback
      if (res.silhouette && res.silhouette.length > 0) {
        // Find K with max silhouette score
        const best = res.silhouette.reduce((prev, current) =>
          (prev.silhouette > current.silhouette) ? prev : current
        );
        recommendedK = best.k;
      }

      setFindKResults({ ...res, recommendedK });
      setTargetK(recommendedK.toString());
    } catch (err: any) {
      console.error('Visualize K failed:', err);
      alert(err.response?.data?.error || err.message || 'Lỗi khi chạy Visualize (GPU)');
      setShowVisualization(false);
    } finally {
      setIsFindingK(false);
    }
  };

  const handleCluster = async () => {
    if (!conversationsList || conversationsList.length === 0) {
      alert('Không có dữ liệu để phân cụm.');
      return;
    }

    try {
      setIsClustering(true);

      const formattedData = conversationsList.map(c => ({
        conversation_id: c.id,
        messages: c.messages.map((m: any) => [
          { role: 'user', content: m.user || '' },
          { role: 'assistant', content: m.assistant || '' }
        ]).flat()
      }));

      const res = await apiService.clusterData(
        formattedData,
        parseInt(targetK, 10),
        parseFloat(clusterEps),
        parseInt(clusterMinSamples, 10)
      );

      if (res.assignments) {
        const noiseCount = res.assignments.filter((a: number) => a === -1).length;
        if (noiseCount > 0) {
          if (!res.clusterStats) {
            res.clusterStats = [];
          }
          if (!res.clusterStats.some((g: any) => g.clusterId === -1)) {
            // Inject NOISE group so it shows in the table
            res.clusterStats.unshift({
              clusterId: -1,
              count: noiseCount,
              avgSimilarity: null
            });
          }
        }
      }

      setClusterResults(res);
      setClusterRan(true);

      // Update stage3Convs or conversationsList based on assignments if needed
      // Currently, DataPrepView uses stage3Convs for stage 3
      if (res.assignments && res.assignments.length === conversationsList.length) {
        const updatedConvs = conversationsList.map((c, idx) => {
          const groupId = res.assignments[idx];
          const groupStat = res.clusterStats?.find((g: any) => g.clusterId === groupId);

          return {
            ...c,
            groupId: groupId,
            groupLabel: '',
            // assign random color or keep existing logic
            groupColor: groupId === -1 ? '#dc2626' : '#6366f1',
            groupBg: groupId === -1 ? '#fef2f2' : '#eef2ff',
            subGroup: c.subGroup || 'A',
            confidence: Math.floor(Math.random() * 10 + 90) // Mock confidence
          };
        });
        setStage3Convs(updatedConvs);
        setConversationsList(updatedConvs);
      }

    } catch (err: any) {
      console.error('Cluster failed:', err);
      alert(err.response?.data?.error || err.message || 'Lỗi khi phân cụm K-means');
    } finally {
      setIsClustering(false);
    }
  };

  const handleRemoveNoise = () => {
    try {
      const updatedConvs = conversationsList.filter(c => c.groupId !== -1);
      const numRemoved = conversationsList.length - updatedConvs.length;

      setConversationsList(updatedConvs);
      setStage3Convs(updatedConvs);

      if (clusterResults && clusterResults.clusterStats) {
        const updatedStats = clusterResults.clusterStats.filter((g: any) => g.clusterId !== -1);
        setClusterResults({
          ...clusterResults,
          clusterStats: updatedStats
        });
      }

      alert(`Đã loại bỏ ${numRemoved} hội thoại nhiễu (Group -1).`);
    } catch (err: any) {
      console.error('Remove Noise failed:', err);
      alert('Lỗi khi loại bỏ nhiễu');
    }
  };

  /* ---- Render helpers ---- */
  const renderJsonHighlighted = (jsonStr) => {
    const lines = jsonStr.split('\n');
    return lines.map((line, lineIdx) => {
      const parts = [];
      let remaining = line;
      let partIdx = 0;

      const regex = /("(?:[^"\\]|\\.)*")/g;
      let match;
      let lastIndex = 0;

      while ((match = regex.exec(remaining)) !== null) {
        if (match.index > lastIndex) {
          parts.push(
            <span key={`${lineIdx}-${partIdx++}`} className="json-bracket">
              {remaining.substring(lastIndex, match.index)}
            </span>
          );
        }

        const afterStr = remaining.substring(match.index + match[0].length).trimStart();
        const isKey = afterStr.startsWith(':');

        parts.push(
          <span key={`${lineIdx}-${partIdx++}`} className={isKey ? 'json-key' : 'json-string'}>
            {match[0]}
          </span>
        );

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < remaining.length) {
        parts.push(
          <span key={`${lineIdx}-${partIdx++}`} className="json-bracket">
            {remaining.substring(lastIndex)}
          </span>
        );
      }

      return (
        <React.Fragment key={lineIdx}>
          {parts}
          {lineIdx < lines.length - 1 ? '\n' : ''}
        </React.Fragment>
      );
    });
  };

  /* Page numbers with ellipsis */
  const getPageNumbers = (current, total) => {
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

  /* ---- Stage 1 Content ---- */
  const renderStage1 = () => (
    <>
      {/* File upload section */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,.jsonl,.xlsx,.xls,.txt"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {!file ? (
        /* ── Upload zone (no file selected) ── */
        <div className="dataprep-upload-zone" onClick={() => fileInputRef.current?.click()}>
          <Upload size={36} className="upload-icon" />
          <div className="upload-title">Drop your file here, or click to browse</div>
          <div className="upload-sub">Supports .json, .jsonl, .csv, .xlsx, .xls, .txt files up to 100MB</div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div style={{ marginTop: '15px', width: '80%', background: '#eee', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, background: '#2563eb', height: '100%', transition: 'width 0.2s ease-in-out' }}></div>
            </div>
          )}
          <button className="upload-select-btn" type="button">Select File</button>
        </div>
      ) : (
        /* ── File selected: show full Stage 1 UI ── */
        <>
          <div className="dataprep-file-card">
            <div className="file-icon">
              <FileText size={24} />
            </div>
            <div className="file-details">
              <div className="file-name">{file.name}</div>
              <div className="file-meta-list">
                <div className="file-meta-item">
                  <span className="meta-emoji">📋</span>
                  {file.messages} tin nhắn
                </div>
                <span className="meta-dot">•</span>
                <div className="file-meta-item">
                  <span className="meta-emoji">💬</span>
                  {file.conversations} hội thoại
                </div>
                <span className="meta-dot">•</span>
                <div className="file-meta-item">
                  <span className="meta-emoji">📦</span>
                  {file.size}
                </div>
              </div>
            </div>
            <button className="file-remove-btn" onClick={handleRemoveFile} title="Remove file">
              <X size={20} />
            </button>
          </div>

          {/* Project Name */}
          <div className="dataprep-field-group">
            <label htmlFor="dp-project-name">Project Name</label>
            <input
              id="dp-project-name"
              className="dataprep-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          {/* Raw Data Preview Accordion */}
          <div className="dataprep-accordion">
            <div className="dataprep-accordion-header" onClick={() => setRawPreviewOpen(!rawPreviewOpen)}>
              <div className="accordion-title">
                <Eye size={16} />
                Xem trước dữ liệu gốc (Raw Data Preview)
              </div>
              <ChevronDown size={18} className={`accordion-chevron ${rawPreviewOpen ? 'open' : ''}`} />
            </div>
            {rawPreviewOpen && (
              <div className="dataprep-accordion-body">
                <pre className="raw-data-pre">
                  {renderJsonHighlighted(rawPreviewText || SAMPLE_RAW_DATA)}
                </pre>
              </div>
            )}
          </div>

          {/* Step 1 Options */}
          <div className="dataprep-options-card">
            <h3>Step 1 Options</h3>
            <div className="options-label">Output format</div>

            {/* Radio: OpenAI Message Format */}
            <div
              className={`dataprep-radio-option ${selectedFormat === 'groq' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('groq')}
            >
              <div className="radio-circle">
                <div className="radio-dot" />
              </div>
              <div className="radio-content">
                <h4>Convert to OpenAI Message Format</h4>
                <p>Transforms the dataset into OpenAI&apos;s chat completion format with message roles (system, user, assistant)</p>
              </div>
            </div>

            {/* Sample Output */}
            <div className="sample-output-section">
              <div className="sample-output-label">SAMPLE OUTPUT</div>
              <pre className="sample-output-pre">
                {renderJsonHighlighted(sampleOutputText || SAMPLE_OUTPUT)}
              </pre>
            </div>
          </div>

          {/* Convert Button */}
          <button className="dataprep-convert-btn" onClick={handleConvert}>
            <Scissors size={20} />
            Convert Dataset
          </button>
        </>
      )}
    </>
  );

  /* ---- Stage 2 Content ---- */
  const renderStage2 = () => {
    const totalConvs = conversationsList.length;
    const totalMessages = conversationsList.reduce((sum, c) => sum + c.messages.length, 0);

    /* Filter conversations by search */
    const filtered = searchQuery.trim()
      ? conversationsList.filter(conv =>
        conv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages.some(m =>
          m.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.assistant.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
      : conversationsList;

    const filteredTotal = filtered.length;
    const totalPages = Math.ceil(filteredTotal / convsPerPage);

    /* Slice conversations for this page */
    const startConvIdx = (currentPage - 1) * convsPerPage;
    const pageConvs = filtered.slice(startConvIdx, startConvIdx + convsPerPage);
    const pageMsgCount = pageConvs.reduce((sum, c) => sum + c.messages.length, 0);

    const handleConvsPerPageChange = (val) => {
      setConvsPerPage(parseInt(val, 10));
      setCurrentPage(1);
    };

    const toggleConv = (convId) => {
      setExpandedConvs(prev => ({
        ...prev,
        [convId]: prev[convId] !== undefined ? !prev[convId] : false,
      }));
    };

    const expandAll = () => {
      const all = {};
      filtered.forEach(c => { all[c.id] = true; });
      setExpandedConvs(all);
    };

    const collapseAll = () => {
      const all = {};
      filtered.forEach(c => { all[c.id] = false; });
      setExpandedConvs(all);
    };

    /* Click-to-expand cell */
    const toggleCell = (cellKey) => {
      setExpandedCells(prev => ({ ...prev, [cellKey]: !prev[cellKey] }));
    };

    /* using component-level highlightSearch */

    /* Cleaning status per conversation (mock) */
    const CONV_STATUS = {
      conv_001: 'clean',
      conv_002: 'fixed',
      conv_003: 'clean',
      conv_004: 'clean',
      conv_005: 'fixed',
      conv_006: 'clean',
      conv_007: 'clean',
      conv_008: 'clean',
      conv_009: 'fixed',
      conv_010: 'clean',
    };

    return (
      <>
        {/* Sub-stepper */}
        <div className="sub-stepper">
          {SUB_STEPS_STAGE2.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep ? 'active' : ''} ${step.num < currentSubStep ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num < currentSubStep ? <Check size={14} /> : step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE2.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {currentSubStep === 1 && (
          <>
            {/* Post-conversion Statistics — shown above table after cleaning is applied */}
            {cleaningApplied && (
              <div className="post-stats-card">
                <div className="post-stats-header">
                  <Check size={16} className="post-stats-icon" />
                  <span>Post-conversion Statistics</span>
                </div>
                <div className="post-stats-grid">
                  <div className="post-stat-item">
                    <div className="post-stat-label">Converted Records</div>
                    <div className="post-stat-value">{conversionStats?.stats?.totalConversations ?? conversionStats?.totalConversations ?? totalConvs}</div>
                  </div>
                  <div className="post-stat-item">
                    <div className="post-stat-label">Source Messages</div>
                    <div className="post-stat-value">{conversionStats?.stats?.totalMessages ?? (totalMessages + 47)}</div>
                  </div>
                </div>

                <div className="cleaning-report-title">CLEANING REPORT & DATA LOSS CHART</div>
                <div className="post-stats-grid" style={{ marginBottom: '16px' }}>
                  <div className="post-stat-item">
                    <div className="post-stat-label">Error keywords</div>
                    <div className="post-stat-value cleaning-red">
                      -{conversionStats?.stats?.cleaning?.removedBoilerplate ?? 28}
                    </div>
                  </div>
                  <div className="post-stat-item">
                    <div className="post-stat-label">Length</div>
                    <div className="post-stat-value cleaning-red">
                      -{((conversionStats?.stats?.cleaning?.removedTooShort ?? 0) + (conversionStats?.stats?.cleaning?.removedTooLong ?? 0)) || 14}
                    </div>
                  </div>
                  <div className="post-stat-item">
                    <div className="post-stat-label">Unclosed &lt;think&gt;</div>
                    <div className="post-stat-value cleaning-red">
                      -{conversionStats?.stats?.cleaning?.removedUnclosedThink ?? 5}
                    </div>
                  </div>
                  <div className="post-stat-item highlight">
                    <div className="post-stat-label">Final Count</div>
                    <div className="post-stat-value cleaning-green">{totalConvs}</div>
                  </div>
                </div>

                {/* Dynamic Data Loss Chart */}
                {(() => {
                  const final = conversionStats?.stats?.cleaning?.finalCount ?? totalConvs;
                  const removed = (conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0) +
                    (conversionStats?.stats?.cleaning?.removedTooShort ?? 0) +
                    (conversionStats?.stats?.cleaning?.removedTooLong ?? 0) +
                    (conversionStats?.stats?.cleaning?.removedUnclosedThink ?? 0) +
                    (conversionStats?.stats?.cleaning?.removedDuplicates ?? 0) || 47;
                  const source = conversionStats?.stats?.cleaning?.originalCount ?? (final + removed);
                  const finalPct = source > 0 ? Math.round((final / source) * 100) : 100;
                  const removedPct = source > 0 ? 100 - finalPct : 0;

                  return (
                    <div style={{ padding: '0 16px 16px', fontSize: '12px', color: '#64748b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>Source: {source} (100%)</span>
                        <span>Filtered: {removed} ({removedPct}%)</span>
                        <span>Final: {final} ({finalPct}%)</span>
                      </div>
                      <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                        <div style={{ width: `${finalPct}%`, backgroundColor: '#22c55e', transition: 'width 0.5s' }} title={`Clean Data (${finalPct}%)`}></div>
                        <div style={{ width: `${removedPct}%`, backgroundColor: '#ef4444', transition: 'width 0.5s' }} title={`Removed (${removedPct}%)`}></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Full-width content (no sidebar) */}
            <div className="cluster-fullwidth">
              <div className="preview-header">
                <h3>Converted Dataset Preview</h3>
                <div className="preview-header-right">
                  <span className="preview-count">
                    {pageMsgCount} messages · Showing {startConvIdx + 1}-{Math.min(startConvIdx + convsPerPage, filteredTotal)} of {filteredTotal} conversations
                    {searchQuery && ` (filtered from ${totalConvs})`}
                  </span>
                  <button className="cleaning-pipeline-trigger-btn" onClick={() => setShowCleaningPopup(true)}>
                    <Settings size={16} />
                    Data Cleaning Pipeline
                  </button>
                </div>
              </div>

              <div className="preview-toolbar">
                <div className="toolbar-select-wrapper">
                  <label className="toolbar-label">Conversations / page:</label>
                  <select
                    className="toolbar-select"
                    value={convsPerPage}
                    onChange={(e) => handleConvsPerPageChange(e.target.value)}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                  </select>
                </div>

                <div className="toolbar-stats">
                  <span className="toolbar-stat-tag">{totalConvs} conversations</span>
                  <span className="toolbar-stat-tag">{totalMessages} messages</span>
                </div>
              </div>

              <div className="preview-table-wrapper cluster-table-full">
                <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '16%', textAlign: 'center' }}>Conv ID</th>
                      <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '30%' }}>User</th>
                      <th style={{ width: '43%' }}>Assistant</th>
                      <th style={{ width: '8%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageConvs.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          No conversations match your search.
                        </td>
                      </tr>
                    )}
                    {pageConvs.map((conv, convPageIdx) => {
                      const groupClass = (startConvIdx + convPageIdx) % 2 === 1 ? 'conv-group-alt' : '';
                      const convGlobalIdx = startConvIdx + convPageIdx + 1;
                      const status = CONV_STATUS[conv.id] || 'clean';

                      return (
                        <tr
                          key={conv.id}
                          className={`conv-row conv-first conv-last ${groupClass} conv-clickable`}
                        >
                          <td className="col-conv-id-cell">
                            <span className="conv-id-badge" title={conv.id}>{conv.id}</span>
                            <span className="conv-msg-count">{conv.messages.length} messages</span>
                            {cleaningApplied && (
                              <span className={`conv-status-badge badge-${status}`}>
                                {status === 'clean' ? '✓ Clean' : status === 'fixed' ? '🔧 Fixed' : '✗ Removed'}
                              </span>
                            )}
                          </td>
                          <td className="col-msg-num-cell">{conv.messages.length}</td>
                          <td className="cell-text-col" style={{ padding: '12px' }}>
                            <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {conv.messages.length === 1 ? (
                                /* Đơn lượt: Hiển thị câu hỏi đầy đủ dạng bọc dòng */
                                <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                  <span style={{ marginRight: '6px', fontSize: '13px' }}>📌</span>
                                  {highlightSearch(conv.messages[0].user, searchQuery)}
                                </div>
                              ) : (
                                /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                                <>
                                  <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '13px' }}>📌 Chủ đề:</span>
                                    <span style={{ fontSize: '13.5px', color: '#4f46e5' }}>
                                      {getConversationTopic(conv.messages)}
                                    </span>
                                  </div>
                                  <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                    {conv.messages.slice(0, 3).map((msg, idx) => (
                                      <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx + 1}:</span>
                                        <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                          {highlightSearch(truncateText(msg.user, 150), searchQuery)}
                                        </span>
                                      </div>
                                    ))}
                                    {conv.messages.length > 3 && (
                                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        + {conv.messages.length - 3} lượt thoại khác (bấm Detail để xem)
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="cell-text-col" style={{ padding: '12px' }}>
                            <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {conv.messages.length === 1 ? (
                                /* Đơn lượt: Hiển thị phản hồi đầy đủ dạng bọc dòng */
                                <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                  <span style={{ marginRight: '6px', fontSize: '13px' }}>💡</span>
                                  {highlightSearch(conv.messages[0].assistant, searchQuery)}
                                </div>
                              ) : (
                                /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                                <>
                                  <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '13px' }}>💡 Phản hồi:</span>
                                    <span style={{ fontSize: '13.5px', color: '#0891b2' }}>
                                      {getAssistantSummary(conv.messages)}
                                    </span>
                                  </div>
                                  <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                    {conv.messages.slice(0, 3).map((msg, idx) => (
                                      <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: '600', color: '#0ea5e9', flexShrink: 0 }}>A{idx + 1}:</span>
                                        <span style={{ color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                          {highlightSearch(truncateText(msg.assistant, 150), searchQuery)}
                                        </span>
                                      </div>
                                    ))}
                                    {conv.messages.length > 3 && (
                                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        + {conv.messages.length - 3} phản hồi khác (bấm Detail để xem)
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="col-action-cell">
                            <button className="view-detail-btn" onClick={() => setSelectedConv(conv)}>
                              <Eye size={14} />
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="preview-pagination">
                <button
                  className="pagination-arrow"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  ‹
                </button>
                {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  className="pagination-arrow"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Conversation Detail Popup */}
            {selectedConv && (
              <div className="cluster-popup-overlay" onClick={() => setSelectedConv(null)}>
                <div className="cluster-popup-content conv-detail-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="cluster-popup-header">
                    <div className="cluster-popup-header-left">
                      <MessageSquare size={20} />
                      <div>
                        <h2>Conversation Detail</h2>
                        <p>{selectedConv.id} · {selectedConv.messages.length} messages</p>
                      </div>
                    </div>
                    <button className="cluster-popup-close-btn" onClick={() => setSelectedConv(null)}>
                      <X size={18} />
                      Close
                    </button>
                  </div>

                  <div className="conv-detail-body">
                    {selectedConv.messages.map((msg, idx) => (
                      <div key={idx} className="conv-detail-pair">
                        <div className="conv-detail-label">#{idx + 1}</div>
                        <div className="conv-detail-msg conv-detail-user">
                          <div className="conv-detail-role">👤 User</div>
                          <div className="conv-detail-text">{renderMessageContent(String(msg.user || ''))}</div>
                        </div>
                        <div className="conv-detail-msg conv-detail-assistant">
                          <div className="conv-detail-role">🤖 Assistant</div>
                          <div className="conv-detail-text">{renderMessageContent(String(msg.assistant || ''))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Data Cleaning Pipeline Popup (merged with Preview) */}
            {showCleaningPopup && (
              <div className="cluster-popup-overlay" onClick={() => { setShowCleaningPopup(false); setCleaningPopupView('settings'); }}>
                <div className={`cluster-popup-content cleaning-popup-content ${cleaningPopupView === 'preview' ? 'cleaning-popup-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <div className="cluster-popup-header">
                    <div className="cluster-popup-header-left">
                      <Settings size={20} />
                      <div>
                        <h2>{cleaningPopupView === 'settings' ? 'Data Cleaning Pipeline' : '🔍 Cleaning Preview'}</h2>
                        <p>{cleaningPopupView === 'settings' ? 'Configure cleaning rules, character limits, and preview changes before applying' : 'Xem trước kết quả làm sạch dữ liệu — file gốc không bị thay đổi'}</p>
                      </div>
                    </div>
                    <button className="cluster-popup-close-btn" onClick={() => { setShowCleaningPopup(false); setCleaningPopupView('settings'); }}>
                      <X size={18} />
                      Close
                    </button>
                  </div>

                  {/* ===== VIEW: Settings ===== */}
                  {cleaningPopupView === 'settings' && (
                    <div className="cluster-popup-body">
                      {/* Enable toggle section */}
                      <div className="cluster-popup-section">
                        <div className="cleaning-pipeline-row">
                          <span className="cleaning-label">Data Cleaning Pipeline</span>
                          <label className="cleaning-toggle">
                            <span className="toggle-text">Enable</span>
                            <input
                              type="checkbox"
                              checked={cleaningEnabled}
                              onChange={() => setCleaningEnabled(!cleaningEnabled)}
                            />
                            <span className="toggle-checkmark"></span>
                          </label>
                        </div>

                        {cleaningEnabled && (
                          <div className="cleaning-options">
                            {/* Checkbox: Xóa thẻ think hoàn chỉnh */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeCompleteThink}
                                onChange={() => setRemoveCompleteThink(!removeCompleteThink)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Xóa các cặp thẻ &lt;think&gt;...&lt;/think&gt; hoàn chỉnh</span>
                            </label>

                            {/* Checkbox: Vá lỗi thẻ think */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeUnclosedThink}
                                onChange={() => setRemoveUnclosedThink(!removeUnclosedThink)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Vá lỗi thẻ &lt;think&gt; bị thiếu thẻ đóng/mở (Regex + AI)</span>
                            </label>

                            {/* Checkbox: Lọc từ khóa lỗi */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeErrorKeywords}
                                onChange={() => setRemoveErrorKeywords(!removeErrorKeywords)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Lọc bỏ các từ khóa lỗi quy định</span>
                            </label>

                            {/* Min / Max chars */}
                            <div className="cleaning-inputs-row">
                              <div className="cleaning-input-group">
                                <label>Min chars assistant</label>
                                <input type="number" value={minChars} onChange={(e) => setMinChars(e.target.value)} />
                              </div>
                              <div className="cleaning-input-group">
                                <label>Max chars assistant</label>
                                <input type="number" value={maxChars} onChange={(e) => setMaxChars(e.target.value)} />
                              </div>
                            </div>

                            {/* Preview button — switches to preview view */}
                            <button
                              className="cleaning-accept-btn"
                              disabled={isCleaningLoading}
                              onClick={handleApplyCleaning}
                            >
                              {isCleaningLoading ? (
                                <span>Đang xử lý...</span>
                              ) : (
                                <>
                                  <Eye size={16} />
                                  Preview & Apply Cleaning
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <button className="reset-btn" onClick={() => {
                          setCleaningApplied(false);
                          setCleaningEnabled(false);
                          setRemoveErrorKeywords(true);
                          setRemoveUnclosedThink(true);
                          setRemoveCompleteThink(false);
                          setMinChars('5');
                          setMaxChars('4000');
                        }}>
                          <RotateCcw size={14} />
                          Reset to Original
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ===== VIEW: Preview ===== */}
                  {cleaningPopupView === 'preview' && (
                    <>
                      {(() => {
                        const beforeList = cleaningPreviewBefore.length > 0 ? cleaningPreviewBefore : PREVIEW_BEFORE;
                        const afterList = cleaningPreviewAfter.length > 0 ? cleaningPreviewAfter : PREVIEW_AFTER;
                        const removedList = cleaningPreviewRemoved.length > 0 ? cleaningPreviewRemoved : PREVIEW_REMOVED;
                        const totalCount = beforeList.length;
                        const keptCount = afterList.length;
                        const fixedCount = afterList.filter(r => r.status === 'fixed').length;
                        const removedCount = removedList.length;

                        return (
                          <>
                            {/* Tabs */}
                            <div className="preview-modal-tabs">
                              <button
                                className={`preview-tab ${previewTab === 'before' ? 'active' : ''}`}
                                onClick={() => setPreviewTab('before')}
                              >
                                📄 Before (Mẫu {totalCount})
                              </button>
                              <button
                                className={`preview-tab ${previewTab === 'after' ? 'active' : ''}`}
                                onClick={() => setPreviewTab('after')}
                              >
                                ✅ After (Mẫu {keptCount})
                              </button>
                              <button
                                className={`preview-tab tab-removed ${previewTab === 'removed' ? 'active' : ''}`}
                                onClick={() => setPreviewTab('removed')}
                              >
                                🗑️ Removed (Mẫu {removedCount})
                              </button>
                            </div>

                            {(() => {
                              const realTotal = conversionStats?.stats?.cleaning?.originalCount ?? conversionStats?.stats?.totalConversations ?? conversationsList.length;
                              const realKept = conversionStats?.stats?.cleaning?.finalCount ?? conversationsList.length;
                              const realRemoved = realTotal - realKept;
                              const realFixed = conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0;

                              return (
                                <>
                                  {/* Summary bar */}
                                  <div className="preview-modal-summary">
                                    <span className="summary-tag summary-total">Tổng tệp: {realTotal} hội thoại</span>
                                    <span className="summary-tag summary-kept">Giữ lại: {realKept}</span>
                                    <span className="summary-tag summary-fixed">Đã sửa: {realFixed}</span>
                                    <span className="summary-tag summary-removed">Loại bỏ: {realRemoved}</span>
                                  </div>

                                  {/* Info Alert */}
                                  <div className="preview-modal-info-alert" style={{ margin: '8px 16px', padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>ℹ️</span>
                                    <span><strong>Lưu ý:</strong> Bảng bên dưới chỉ hiển thị mẫu {totalCount} hội thoại đầu tiên để xem trước kết quả. Khi bấm "Xác nhận & Áp dụng", bộ lọc sẽ được áp dụng cho <strong>tất cả {realTotal} cuộc hội thoại</strong> trong tệp dữ liệu.</span>
                                  </div>
                                </>
                              );
                            })()}

                            {/* Tab Content */}
                            <div className="preview-modal-body">
                              {previewTab === 'before' && (
                                <table className="preview-modal-table">
                                  <thead>
                                    <tr>
                                      <th>Conv ID</th>
                                      <th>Status</th>
                                      <th>User</th>
                                      <th>Assistant (trước)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {beforeList.map((row) => (
                                      <tr key={row.id} className={row.status === 'has-issue' ? 'row-issue' : 'row-clean'}>
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td>
                                          {row.issue
                                            ? <span className="status-badge badge-issue">{row.issue}</span>
                                            : <span className="status-badge badge-clean">Clean</span>
                                          }
                                        </td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {previewTab === 'after' && (
                                <table className="preview-modal-table">
                                  <thead>
                                    <tr>
                                      <th>Conv ID</th>
                                      <th>Action</th>
                                      <th>User</th>
                                      <th>Assistant (sau)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {afterList.map((row) => (
                                      <tr key={row.id} className={row.status === 'wiped' ? 'row-removed' : row.status === 'fixed' ? 'row-fixed' : 'row-clean'}>
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td><span className={`status-badge ${row.status === 'wiped' ? 'badge-removed' : row.status === 'fixed' ? 'badge-fixed' : 'badge-clean'}`}>{row.action}</span></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>✓ Nội dung rỗng (đã xóa thẻ think)</span>}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {previewTab === 'removed' && (
                                <table className="preview-modal-table">
                                  <thead>
                                    <tr>
                                      <th>Conv ID</th>
                                      <th>Lý do loại bỏ</th>
                                      <th>User</th>
                                      <th>Assistant</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {removedList.map((row) => (
                                      <tr key={row.id} className="row-removed">
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td><span className="status-badge badge-removed">{row.reason}</span></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </>
                        );
                      })()}

                      {/* Footer */}
                      <div className="preview-modal-footer">
                        <button className="modal-cancel-btn" onClick={() => setCleaningPopupView('settings')}>
                          <ChevronLeft size={16} />
                          Quay lại cài đặt
                        </button>
                        <button className="modal-confirm-btn" onClick={() => {
                          if (pendingCleanedList.length > 0) {
                            setConversationsList(pendingCleanedList);
                            setStage3Convs(pendingCleanedList.map((c, idx) => {
                              const gId = (idx % 15) + 1;
                              return {
                                ...c,
                                groupId: gId,
                                groupLabel: '',
                                groupColor: '#64748b',
                                groupBg: '#f8fafc',
                                subGroup: c.subGroup || 'A',
                                confidence: 0
                              };
                            }));
                          }
                          setCleaningApplied(true);
                          setShowCleaningPopup(false);
                          setCleaningPopupView('settings');
                        }}>
                          <Check size={16} />
                          Xác nhận & Áp dụng
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {currentSubStep === 2 && (
          <div className="findk-container">
            <div className="findk-card">
              <h3>Find K</h3>
              <p className="findk-desc">Compute Elbow, Silhouette Score, and K-Distance curves through GPU Service before K-means clustering.</p>
              <div className="findk-params">
                <div className="findk-param">
                  <label>Max K:</label>
                  <input type="number" value={maxK} onChange={(e) => setMaxK(e.target.value)} />
                </div>
                <div className="findk-param">
                  <label>EPS:</label>
                  <input type="number" step="0.1" value={eps} onChange={(e) => setEps(e.target.value)} />
                </div>
                <div className="findk-param">
                  <label>Min Samples:</label>
                  <input type="number" value={minSamples} onChange={(e) => setMinSamples(e.target.value)} />
                </div>
                <button className="findk-visualize-btn" onClick={handleVisualizeK} disabled={isFindingK}>
                  {isFindingK ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isFindingK ? 'Calculating...' : 'Visualize (GPU)'}
                </button>
              </div>
            </div>

            {showVisualization && findKResults && (() => {
              const elbow = findKResults.elbow || [];
              const silhouette = findKResults.silhouette || [];

              const wcssMax = Math.max(...elbow.map((d: any) => d.wcss), 12);
              const wcssMin = 0;
              const silMax = Math.max(...silhouette.map((d: any) => d.silhouette), 0.22);
              const silMin = 0;

              const chartHeight = 240;
              const chartBottom = 280;
              const chartWidth = 700;
              const chartLeft = 60;

              const maxKVal = elbow.length > 0 ? elbow.length : parseInt(maxK, 10);
              const stepX = maxKVal > 1 ? chartWidth / (maxKVal - 1) : 0;

              const wcssPoints = elbow.map((d: any, i: number) => {
                const x = chartLeft + i * stepX;
                const y = chartBottom - ((d.wcss - wcssMin) / (wcssMax - wcssMin || 1)) * chartHeight;
                return [x, y];
              });

              const silPoints = silhouette.map((d: any, i: number) => {
                const x = chartLeft + i * stepX;
                const y = chartBottom - ((d.silhouette - silMin) / (silMax - silMin || 1)) * chartHeight;
                return [x, y];
              });

              const recKIndex = elbow.findIndex((d: any) => d.k === findKResults.recommendedK);
              const recommendedX = recKIndex >= 0 ? chartLeft + recKIndex * stepX : chartLeft;

              return (
                <>
                  <div className="findk-result-banner">
                    <Sparkles size={16} className="banner-icon" />
                    <div>
                      <strong>{findKResults.pointCount || conversationsList.length} points analyzed, {findKResults.noiseCount || 0} noise points filtered by DBSCAN</strong>
                      <div className="banner-sub">Recommended K: <strong>{findKResults.recommendedK}</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</div>
                    </div>
                  </div>

                  <div className="findk-chart-card">
                    <div className="chart-header-row">
                      <div>
                        <h4>Elbow Method vs. Silhouette Score</h4>
                        <p className="chart-subtitle">Use the blue curve to spot the elbow and the green curve to confirm the strongest silhouette.</p>
                      </div>
                      <div className="chart-legend">
                        <span className="legend-item legend-wcss"><span className="legend-dot"></span> Elbow (WCSS)</span>
                        <span className="legend-item legend-sil"><span className="legend-dot"></span> Silhouette</span>
                        <span className="legend-item legend-rec"><span className="legend-dot"></span> Recommended K = {findKResults.recommendedK}</span>
                      </div>
                    </div>
                    <div className="chart-area">
                      <svg viewBox="0 0 840 340" className="findk-svg">
                        {/* Grid lines */}
                        {[0, 1, 2, 3, 4].map(i => (
                          <line key={`grid-${i}`} x1="60" y1={40 + i * 60} x2="760" y2={40 + i * 60} stroke="#f1f5f9" strokeWidth="1" />
                        ))}
                        {/* Y-axis left labels (WCSS) */}
                        <text x="8" y="44" className="axis-label">{wcssMax.toFixed(1)}</text>
                        <text x="16" y="104" className="axis-label">{(wcssMax * 0.75).toFixed(1)}</text>
                        <text x="16" y="164" className="axis-label">{(wcssMax * 0.5).toFixed(1)}</text>
                        <text x="16" y="224" className="axis-label">{(wcssMax * 0.25).toFixed(1)}</text>
                        <text x="16" y="284" className="axis-label">0</text>
                        <text x="10" y="175" className="axis-title" transform="rotate(-90, 10, 175)">WCSS</text>

                        {/* Y-axis right labels (Silhouette) */}
                        <text x="770" y="44" className="axis-label-right">{silMax.toFixed(3)}</text>
                        <text x="770" y="104" className="axis-label-right">{(silMax * 0.75).toFixed(3)}</text>
                        <text x="770" y="164" className="axis-label-right">{(silMax * 0.5).toFixed(3)}</text>
                        <text x="770" y="224" className="axis-label-right">{(silMax * 0.25).toFixed(3)}</text>
                        <text x="770" y="284" className="axis-label-right">0</text>
                        <text x="825" y="175" className="axis-title-right" transform="rotate(90, 825, 175)">Silhouette</text>

                        {/* X-axis labels */}
                        {elbow.map((d: any, i: number) => (
                          <text key={`x-${i}`} x={chartLeft + i * stepX} y="310" className="axis-label" textAnchor="middle">{d.k}</text>
                        ))}

                        {/* Recommended K dotted line */}
                        <line x1={recommendedX} y1="40" x2={recommendedX} y2="280" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />

                        {/* WCSS line (blue) */}
                        <polyline
                          fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round"
                          points={wcssPoints.map(p => p.join(',')).join(' ')}
                        />
                        {/* WCSS dots */}
                        {wcssPoints.map((p, i) => (
                          <circle key={`wc-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
                        ))}

                        {/* Silhouette line (green) */}
                        {silPoints.length > 0 && (
                          <>
                            <polyline
                              fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round"
                              points={silPoints.map(p => p.join(',')).join(' ')}
                            />
                            {/* Silhouette dots */}
                            {silPoints.map((p, i) => (
                              <circle key={`sl-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#16a34a" strokeWidth="2" />
                            ))}
                          </>
                        )}
                      </svg>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {currentSubStep === 3 && (() => {

          const CLUSTER_GROUPS = [
            { name: 'Group 0', count: 17, sim: 0.9973 },
            { name: 'Group 1', count: 17, sim: 0.9957 },
            { name: 'Group 2', count: 12, sim: 0.9683 },
            { name: 'Group 3', count: 4, sim: 0.9716 },
            { name: 'Group 4', count: 8, sim: 0.9703 },
            { name: 'Group 5', count: 6, sim: 0.9673 },
            { name: 'Group 6', count: 10, sim: 0.9669 },
            { name: 'Group 7', count: 8, sim: 0.9695 },
          ];

          return (
            <>
              {/* Full-width Dataset Preview */}
              <div className="cluster-fullwidth">
                <div className="preview-header">
                  <h3>Converted Dataset Preview</h3>
                  <div className="preview-header-right">
                    <span className="preview-count">
                      {pageMsgCount} messages · Showing {startConvIdx + 1}-{Math.min(startConvIdx + convsPerPage, filteredTotal)} of {filteredTotal} conversations
                      {searchQuery && ` (filtered from ${totalConvs})`}
                    </span>
                    <button className="cluster-options-trigger-btn" onClick={() => setShowClusterOptionsPopup(true)}>
                      <Settings size={16} />
                      Clustering Options
                    </button>
                  </div>
                </div>

                <div className="preview-toolbar">
                  <div className="toolbar-select-wrapper">
                    <label className="toolbar-label">Conversations / page:</label>
                    <select
                      className="toolbar-select"
                      value={convsPerPage}
                      onChange={(e) => handleConvsPerPageChange(e.target.value)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                    </select>
                  </div>
                  <div className="toolbar-actions">
                    <button className="toolbar-btn-sm" onClick={expandAll} title="Expand all">Expand All</button>
                    <button className="toolbar-btn-sm" onClick={collapseAll} title="Collapse all">Collapse All</button>
                  </div>

                  <div className="toolbar-stats">
                    <span className="toolbar-stat-tag">{totalConvs} conversations</span>
                    <span className="toolbar-stat-tag">{totalMessages} messages</span>
                  </div>
                </div>

                <div className="preview-table-wrapper cluster-table-full">
                  <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '14%', textAlign: 'center' }}>Conversation ID</th>
                        <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                        <th style={{ width: '40%' }}>User</th>
                        <th style={{ width: '43%' }}>Assistant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageConvs.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                            No conversations match your search.
                          </td>
                        </tr>
                      )}
                      {pageConvs.map((conv, convPageIdx) => {
                        const isExpanded = expandedConvs[conv.id] !== undefined ? expandedConvs[conv.id] : true;
                        const groupClass = (startConvIdx + convPageIdx) % 2 === 1 ? 'conv-group-alt' : '';

                        if (!isExpanded) {
                          return (
                            <tr key={conv.id} className={`conv-row conv-first conv-last conv-collapsed ${groupClass}`}>
                              <td className="col-conv-id-cell">
                                <button className="conv-toggle-btn" onClick={() => toggleConv(conv.id)} title="Expand">
                                  <ChevronRight size={14} />
                                </button>
                                <span className="conv-id-badge">{conv.id}</span>
                                <span className="conv-msg-count">{conv.messages.length} messages</span>
                                {conv.groupLabel && (
                                  <span className="conv-group-badge" style={{ backgroundColor: conv.groupBg, color: conv.groupColor, border: `1px solid ${conv.groupColor}40`, marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                                    {conv.groupLabel}
                                  </span>
                                )}
                              </td>
                              <td className="col-msg-num-cell">—</td>
                              <td className="cell-text-col" title={conv.messages[0].user}>
                                <div className="cell-truncate">{conv.messages[0].user}</div>
                              </td>
                              <td className="cell-text-col" title={conv.messages[0].assistant}>
                                <div className="cell-truncate">{conv.messages[0].assistant}</div>
                              </td>
                            </tr>
                          );
                        }

                        return conv.messages.map((msg, msgIdx) => (
                          <tr
                            key={`${conv.id}-${msgIdx}`}
                            className={`conv-row ${msgIdx === 0 ? 'conv-first' : ''} ${msgIdx === conv.messages.length - 1 ? 'conv-last' : ''} ${groupClass}`}
                          >
                            {msgIdx === 0 && (
                              <td className="col-conv-id-cell" rowSpan={conv.messages.length}>
                                <button className="conv-toggle-btn" onClick={() => toggleConv(conv.id)} title="Collapse">
                                  <ChevronDown size={14} />
                                </button>
                                <span className="conv-id-badge">{conv.id}</span>
                                <span className="conv-msg-count">{conv.messages.length} messages</span>
                                {conv.groupLabel && (
                                  <span className="conv-group-badge" style={{ backgroundColor: conv.groupBg, color: conv.groupColor, border: `1px solid ${conv.groupColor}40`, marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                                    {conv.groupLabel}
                                  </span>
                                )}
                              </td>
                            )}
                            <td className="col-msg-num-cell">#{msgIdx + 1}</td>
                            <td className="cell-text-col" title={msg.user}><div className="cell-truncate">{msg.user}</div></td>
                            <td className="cell-text-col" title={msg.assistant}><div className="cell-truncate">{msg.assistant}</div></td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="preview-pagination">
                  <button
                    className="pagination-arrow"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    ‹
                  </button>
                  {getPageNumbers(currentPage, totalPages || 1).map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                    ) : (
                      <button
                        key={page}
                        className={`pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    className="pagination-arrow"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Clustering Options Popup */}
              {showClusterOptionsPopup && (
                <div className="cluster-popup-overlay" onClick={() => setShowClusterOptionsPopup(false)}>
                  <div className="cluster-popup-content" onClick={(e) => e.stopPropagation()}>
                    <div className="cluster-popup-header">
                      <div className="cluster-popup-header-left">
                        <Settings size={20} />
                        <div>
                          <h2>Clustering Options</h2>
                          <p>Configure clustering parameters, filter noise, and review group statistics</p>
                        </div>
                      </div>
                      <button className="cluster-popup-close-btn" onClick={() => setShowClusterOptionsPopup(false)}>
                        <X size={18} />
                        Close
                      </button>
                    </div>

                    <div className="cluster-popup-body">
                      {/* Clustering Parameters */}
                      <div className="cluster-popup-section">
                        <h3 className="cluster-card-title">Clustering Parameters</h3>
                        <div className="cleaning-input-group" style={{ marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Target K (Clusters)
                            <Tooltip text="Số lượng cụm K mục tiêu thuật toán K-Means sẽ chia dữ liệu. Số K càng lớn thì số cụm môn học càng nhiều.">
                              <HelpCircle size={14} color="#94a3b8" />
                            </Tooltip>
                          </label>
                          <input type="number" value={targetK} onChange={(e) => setTargetK(e.target.value)} />
                        </div>
                        <p className="cluster-recommend">
                          {findKResults?.recommendedK ? (
                            <>Recommended K: <strong>{findKResults.recommendedK}</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</>
                          ) : (
                            <>Run <strong>Find K</strong> step first to get Recommended K.</>
                          )}
                        </p>
                        <div className="cleaning-inputs-row" style={{ marginBottom: 12 }}>
                          <div className="cleaning-input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              DBSCAN EPS
                              <Tooltip text="Bán kính Epsilon của thuật toán DBSCAN. Quyết định khoảng cách tối đa để hai đoạn hội thoại được xem là cùng một cụm.">
                                <HelpCircle size={14} color="#94a3b8" />
                              </Tooltip>
                            </label>
                            <input type="number" step="0.1" value={clusterEps} onChange={(e) => setClusterEps(e.target.value)} />
                          </div>
                          <div className="cleaning-input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              Min Samples
                              <Tooltip text="Số lượng hội thoại tối thiểu cần thiết để tạo thành một cụm DBSCAN hợp lệ. Nếu ít hơn sẽ bị coi là nhiễu (Noise).">
                                <HelpCircle size={14} color="#94a3b8" />
                              </Tooltip>
                            </label>
                            <input type="number" value={clusterMinSamples} onChange={(e) => setClusterMinSamples(e.target.value)} />
                          </div>
                        </div>
                        <button className="cluster-run-btn" onClick={handleCluster} disabled={isClustering}>
                          {isClustering ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {isClustering ? 'Clustering...' : 'Cluster'}
                        </button>
                      </div>

                      {clusterRan && (
                        <>
                          {/* Similarity Threshold */}
                          <div className="cluster-popup-section">
                            <div className="sim-header">
                              <span className="sim-label">Similarity Threshold (for Deduplicate)</span>
                              <span className="sim-value">{simThreshold.toFixed(3)}</span>
                            </div>
                            <input
                              type="range" min="0" max="1" step="0.001"
                              value={simThreshold}
                              onChange={(e) => setSimThreshold(parseFloat(e.target.value))}
                              className="sim-slider"
                            />
                            <div className="cluster-action-btns">
                              <button className="cluster-btn-noise" onClick={handleRemoveNoise}>Remove Noise</button>
                              <button className="cluster-btn-dedup">Deduplicate</button>
                            </div>
                            <button className="reset-filter-btn">Reset Filter</button>
                          </div>

                          {/* Cluster Statistics */}
                          <div className="cluster-popup-section">
                            <div className="cluster-stats-header">
                              <span className="cluster-stats-title">Cluster Statistics</span>
                              <button className="compare-btn" onClick={() => setShowCompareModal(true)}>
                                <Eye size={14} />
                                Compare Groups
                              </button>
                            </div>
                            <table className="cluster-stats-table">
                              <thead>
                                <tr>
                                  <th>Select</th>
                                  <th>Group</th>
                                  <th>Count</th>
                                  <th>Avg Similarity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clusterResults?.clusterStats ? clusterResults.clusterStats.map((g: any, i: number) => (
                                  <tr key={i}>
                                    <td><input type="checkbox" /></td>
                                    <td><strong>{g.clusterId === -1 ? 'Group -1' : `Group ${g.clusterId}`}</strong></td>
                                    <td className="count-cell">{g.count}</td>
                                    <td className="sim-cell">{g.avgSimilarity?.toFixed(4) || 'N/A'}</td>
                                  </tr>
                                )) : CLUSTER_GROUPS.map((g, i) => (
                                  <tr key={i}>
                                    <td><input type="checkbox" /></td>
                                    <td><strong>{g.name}</strong></td>
                                    <td className="count-cell">{g.count}</td>
                                    <td className="sim-cell">{g.sim.toFixed(4)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep > 1) {
              setCurrentSubStep(currentSubStep - 1);
            } else {
              setCurrentStage(1);
            }
          }}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep < SUB_STEPS_STAGE2.length) {
              setCurrentSubStep(currentSubStep + 1);
            } else {
              setCurrentStage(3);
            }
          }}>
            Next
          </button>
        </div>
      </>
    );
  };
  /* Demo data for preview modal */
  const PREVIEW_BEFORE = [
    { id: 'conv_003', status: 'has-issue', issue: 'Unclosed <think>', user: 'Giải thích nguyên lý bất định Heisenberg', assistant: '<think>Nguyên lý bất định... đây là câu hỏi về cơ học lượng tử' },
    { id: 'conv_007', status: 'has-issue', issue: 'Too short', user: 'Hi', assistant: 'Hello!' },
    { id: 'conv_009', status: 'has-issue', issue: 'Error keyword', user: 'Tính toán entropy', assistant: 'I apologize, as an AI language model I cannot...' },
    { id: 'conv_011', status: 'clean', issue: null, user: 'So sánh nhiệt động lực học cổ điển và thống kê', assistant: 'Nhiệt động lực học cổ điển tập trung vào các đại lượng vĩ mô...' },
    { id: 'conv_012', status: 'has-issue', issue: 'Complete <think> tags', user: 'Phân tích phương trình Maxwell', assistant: '<think>Cần phân tích 4 phương trình...</think>Các phương trình Maxwell mô tả...' },
  ];

  const PREVIEW_AFTER = [
    { id: 'conv_003', status: 'fixed', action: 'Đã vá thẻ <think> bằng Regex+AI', user: 'Giải thích nguyên lý bất định Heisenberg', assistant: 'Nguyên lý bất định Heisenberg phát biểu rằng...' },
    { id: 'conv_011', status: 'clean', action: 'Không thay đổi', user: 'So sánh nhiệt động lực học cổ điển và thống kê', assistant: 'Nhiệt động lực học cổ điển tập trung vào các đại lượng vĩ mô...' },
    { id: 'conv_012', status: 'fixed', action: 'Đã xóa thẻ <think>...</think>', user: 'Phân tích phương trình Maxwell', assistant: 'Các phương trình Maxwell mô tả mối quan hệ giữa điện trường...' },
  ];

  const PREVIEW_REMOVED = [
    { id: 'conv_007', reason: 'Hội thoại quá ngắn (< 5 ký tự)', user: 'Hi', assistant: 'Hello!' },
    { id: 'conv_009', reason: 'Chứa từ khóa lỗi: "as an AI language model"', user: 'Tính toán entropy', assistant: 'I apologize, as an AI language model I cannot...' },
  ];

  const renderStage3 = () => {
    /* Group data — tự sinh từ dữ liệu thực tế, chỉ hiện nhóm có conversation */
    const GROUP_COLORS = [
      { color: '#6366f1', bg: '#eef2ff' },
      { color: '#0891b2', bg: '#ecfeff' },
      { color: '#059669', bg: '#ecfdf5' },
      { color: '#d97706', bg: '#fffbeb' },
      { color: '#dc2626', bg: '#fef2f2' },
      { color: '#7c3aed', bg: '#f5f3ff' },
      { color: '#2563eb', bg: '#eff6ff' },
      { color: '#9333ea', bg: '#faf5ff' },
      { color: '#ea580c', bg: '#fff7ed' },
      { color: '#16a34a', bg: '#f0fdf4' },
      { color: '#0284c7', bg: '#f0f9ff' },
      { color: '#e11d48', bg: '#fff1f2' },
      { color: '#4f46e5', bg: '#eef2ff' },
      { color: '#c026d3', bg: '#fdf4ff' },
      { color: '#b45309', bg: '#fef3c7' },
    ];

    // Đếm conversations theo groupId, chỉ lấy nhóm có ít nhất 1 conversation
    const groupCountMap = new Map<number, number>();
    stage3Convs.forEach(c => {
      groupCountMap.set(c.groupId, (groupCountMap.get(c.groupId) || 0) + 1);
    });

    const GROUP_DATA = Array.from(groupCountMap.entries())
      .sort((a, b) => a[0] - b[0]) // sắp xếp theo groupId
      .map(([groupId, count]) => {
        const colorIdx = groupId === -1 ? 4 : (groupId - 1) % GROUP_COLORS.length;
        const palette = GROUP_COLORS[colorIdx >= 0 ? colorIdx : 0];
        return {
          id: groupId,
          label: groupId === -1 ? 'NOISE' : (aiGroupLabels[groupId] || ''),
          color: groupId === -1 ? '#dc2626' : palette.color,
          bg: groupId === -1 ? '#fef2f2' : palette.bg,
          count,
        };
      });

    const allConvRows = stage3Convs;

    const filteredRows = allConvRows
      .filter(r => !selectedGroup3 || r.groupId === selectedGroup3)
      .filter(r => r.subGroup === stage3SubGroup)
      .filter(r => {
        if (!stage3Search.trim()) return true;
        const q = stage3Search.toLowerCase();
        return r.id.toLowerCase().includes(q) ||
          r.messages.some(m =>
            m.user.toLowerCase().includes(q) ||
            m.assistant.toLowerCase().includes(q)
          );
      });

    const stage3TotalPages = Math.ceil(filteredRows.length / stage3PerPage);
    const stage3PageRows = filteredRows.slice((stage3Page - 1) * stage3PerPage, stage3Page * stage3PerPage);

    return (
      <div className="dataprep-stage2">
        <div className="sub-stepper">
          {SUB_STEPS_STAGE3.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep3 ? 'active' : ''} ${step.num < currentSubStep3 ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep3(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE3.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {currentSubStep3 === 5 && (
          <div className="stage2-layout cluster-layout">
            {/* Left: Dataset Preview */}
            <div className="stage2-main">
              <div className="preview-header">
                <h3>Converted Dataset Preview</h3>
                <span className="record-count">
                  {selectedGroup3
                    ? `Group ${selectedGroup3} — ${filteredRows.length} conversations`
                    : `Showing all ${allConvRows.length} conversations`
                  }
                </span>
              </div>

              {/* Bulk Label & Split Toolbar */}
              <div className="preview-toolbar" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="toolbar-label" style={{ fontWeight: 600 }}>Bulk Actions:</span>
                <select className="toolbar-select" style={{ minWidth: '150px' }}>
                  <option value="">-- Select Subject --</option>
                  <option value="MATH">Toán học (MATH)</option>
                  <option value="CODING">Lập trình (CODING)</option>
                  <option value="PHYSICS">Vật lý (PHYSICS)</option>
                </select>
                <button style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'background 0.15s' }}>
                  Apply Bulk Label
                </button>
                <div style={{ flex: 1 }}></div>
                <button
                  style={{ backgroundColor: stage3SubGroup === 'A' ? '#ef4444' : '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkedConvIds.length === 0 ? 0.5 : 1 }}
                  title={`Di chuyển các dòng đã chọn sang Group ${stage3SubGroup === 'A' ? 'B (Nhiễu)' : 'A (Chuẩn)'}`}
                  disabled={checkedConvIds.length === 0}
                  onClick={() => {
                    setStage3Convs(prev => prev.map(c =>
                      checkedConvIds.includes(c.id)
                        ? { ...c, subGroup: stage3SubGroup === 'A' ? 'B' : 'A' }
                        : c
                    ));
                    setCheckedConvIds([]);
                  }}
                >
                  Move to Group {stage3SubGroup === 'A' ? 'B (Noise)' : 'A (Standard)'} {checkedConvIds.length > 0 ? `(${checkedConvIds.length})` : ''}
                </button>
              </div>

              {/* Toolbar */}
              <div className="preview-toolbar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <button
                    onClick={() => { setStage3SubGroup('A'); setStage3Page(1); setCheckedConvIds([]); }}
                    style={{ padding: '6px 12px', border: 'none', background: stage3SubGroup === 'A' ? '#e0f2fe' : '#fff', color: stage3SubGroup === 'A' ? '#0284c7' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                  >
                    Group A (Chuẩn bộ môn)
                  </button>
                  <button
                    onClick={() => { setStage3SubGroup('B'); setStage3Page(1); setCheckedConvIds([]); }}
                    style={{ padding: '6px 12px', border: 'none', background: stage3SubGroup === 'B' ? '#fef2f2' : '#fff', color: stage3SubGroup === 'B' ? '#dc2626' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '13px', borderLeft: '1px solid #e2e8f0' }}
                  >
                    Group B (Nhiễu bộ môn)
                  </button>
                </div>
                <div style={{ flex: 1 }}></div>
                <span className="toolbar-label">Conversations / page:</span>
                <select
                  className="toolbar-select"
                  value={stage3PerPage}
                  onChange={(e) => { setStage3PerPage(parseInt(e.target.value, 10)); setStage3Page(1); }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <input
                  type="text"
                  className="toolbar-search-input"
                  placeholder="Search conversations..."
                  value={stage3Search}
                  onChange={(e) => { setStage3Search(e.target.value); setStage3Page(1); }}
                />
              </div>

              <div className="preview-table-wrapper" style={{ maxHeight: '620px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', minWidth: '1100px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }} title="Select to move to noise group">
                        <input
                          type="checkbox"
                          checked={stage3PageRows.length > 0 && stage3PageRows.every(r => checkedConvIds.includes(r.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newIds = [...checkedConvIds];
                              stage3PageRows.forEach(r => {
                                if (!newIds.includes(r.id)) newIds.push(r.id);
                              });
                              setCheckedConvIds(newIds);
                            } else {
                              const pageIds = stage3PageRows.map(r => r.id);
                              setCheckedConvIds(prev => prev.filter(id => !pageIds.includes(id)));
                            }
                          }}
                        />
                      </th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Conv ID</th>
                      <th style={{ width: '25%' }}>User</th>
                      <th style={{ width: '36%' }}>Assistant</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Subject Label</th>
                      <th style={{ width: '8%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage3PageRows.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          No conversations in this group.
                        </td>
                      </tr>
                    )}
                    {stage3PageRows.map((conv, idx) => (
                      <tr key={conv.id} className="conv-row conv-first conv-last">
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="checkbox"
                            checked={checkedConvIds.includes(conv.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCheckedConvIds(prev => [...prev, conv.id]);
                              } else {
                                setCheckedConvIds(prev => prev.filter(id => id !== conv.id));
                              }
                            }}
                          />
                        </td>
                        <td className="col-conv-id-cell">
                          <span className="conv-id-badge" title={conv.id}>{conv.id}</span>
                          <span className="conv-msg-count">{conv.messages.length} msgs</span>
                        </td>
                        <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                          <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {conv.messages.length === 1 ? (
                              /* Đơn lượt: Hiển thị câu hỏi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '15px', color: '#1e293b', lineHeight: '1.6', whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: 500 }}>
                                <span style={{ marginRight: '6px', fontSize: '14px' }}>📌</span>
                                {highlightSearch(conv.messages[0].user, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '14px' }}>📌 Chủ đề:</span>
                                  <span style={{ fontSize: '15px', color: '#4f46e5' }}>
                                    {getConversationTopic(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: '700', color: '#6366f1', flexShrink: 0 }}>U{idx + 1}:</span>
                                      <span style={{ color: '#1e293b', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                        {highlightSearch(truncateText(msg.user, 150), stage3Search)}
                                      </span>
                                    </div>
                                  ))}
                                  {conv.messages.length > 3 && (
                                    <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      + {conv.messages.length - 3} lượt thoại khác (bấm Detail để xem)
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                          <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {conv.messages.length === 1 ? (
                              /* Đơn lượt: Hiển thị phản hồi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '15px', color: '#334155', lineHeight: '1.6', whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: 500 }}>
                                <span style={{ marginRight: '6px', fontSize: '14px' }}>💡</span>
                                {highlightSearch(conv.messages[0].assistant, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '14px' }}>💡 Phản hồi:</span>
                                  <span style={{ fontSize: '15px', color: '#0891b2' }}>
                                    {getAssistantSummary(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: '700', color: '#0ea5e9', flexShrink: 0 }}>A{idx + 1}:</span>
                                      <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                        {highlightSearch(truncateText(msg.assistant, 150), stage3Search)}
                                      </span>
                                    </div>
                                  ))}
                                  {conv.messages.length > 3 && (
                                    <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      + {conv.messages.length - 3} phản hồi khác (bấm Detail để xem)
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <select
                            className="toolbar-select"
                            style={{
                              background: conv.groupBg,
                              color: conv.groupColor,
                              borderColor: conv.groupColor,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              height: 'auto',
                              minWidth: '90px',
                              cursor: 'pointer'
                            }}
                            value={aiGroupLabels[conv.groupId] || conv.groupLabel || ''}
                            onChange={e => {
                              const newLabel = e.target.value;
                              setAiGroupLabels(prev => ({ ...prev, [conv.groupId]: newLabel }));
                              setStage3Convs(prev => prev.map(c =>
                                c.groupId === conv.groupId ? { ...c, groupLabel: newLabel } : c
                              ));
                            }}
                          >
                            <option value="">-- Select --</option>
                            <option value="MATH">MATH</option>
                            <option value="CODING">CODING</option>
                            <option value="ENGLISH">ENGLISH</option>
                            <option value="PHYSICS">PHYSICS</option>
                            <option value="CHEMISTRY">CHEMISTRY</option>
                            <option value="BIOLOGY">BIOLOGY</option>
                            <option value="HISTORY">HISTORY</option>
                            <option value="LITERATURE">LITERATURE</option>
                            <option value="ENGLISH">ENGLISH</option>
                            <option value="OTHER">OTHER</option>
                            <option value="NOISE">NOISE</option>
                            {customSubjectLabels.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                            {pendingAiLabels.map(lbl => <option key={lbl} value={lbl}>{lbl} (Mới)</option>)}
                          </select>
                        </td>
                        <td className="col-action-cell" style={{ verticalAlign: 'middle' }}>
                          <button className="view-detail-btn" onClick={() => setSelectedConv3(conv)}>
                            <Eye size={14} />
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="preview-pagination">
                <button className="pagination-arrow" disabled={stage3Page <= 1} onClick={() => setStage3Page(stage3Page - 1)}>‹</button>
                {getPageNumbers(stage3Page, stage3TotalPages).map((page, idx) =>
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`pagination-page-btn ${page === stage3Page ? 'active' : ''}`}
                      onClick={() => setStage3Page(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button className="pagination-arrow" disabled={stage3Page >= stage3TotalPages} onClick={() => setStage3Page(stage3Page + 1)}>›</button>
              </div>
            </div>

            {/* Right: Sidebar */}
            <div className="stage2-sidebar">
              <div className="cleaning-pipeline-card">
                <div className="auto-labeling-header" style={{ paddingBottom: '0', borderBottom: 'none' }}>
                  <div className="auto-labeling-actions" style={{ width: '100%', display: 'flex', gap: '8px' }}>
                    <select
                      className="label-model-select"
                      style={{ flex: 1 }}
                      value={aiProvider}
                      onChange={e => setAiProvider(e.target.value as any)}
                      disabled={isLabelingWithAI}
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">ChatGPT / OpenAI</option>
                      <option value="deepseek">Deepseek</option>
                      <option value="groq">Groq</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                    <button
                      className="label-ai-btn"
                      style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', opacity: (!clusterRan || isLabelingWithAI) ? 0.6 : 1 }}
                      disabled={!clusterRan || isLabelingWithAI}
                      onClick={async () => {
                        if (!clusterRan) return;

                        const hasExistingLabels = Object.values(aiGroupLabels).some(val => val !== '' && val !== undefined);
                        if (hasExistingLabels) {
                          const confirmRelabel = window.confirm('Dữ liệu này đã được gán nhãn. Bạn có muốn yêu cầu AI chạy lại và ghi đè nhãn mới không?');
                          if (!confirmRelabel) return;

                          // Xóa nhãn hiện tại trên UI để chạy lại
                          setAiGroupLabels({});
                          setPendingAiLabels([]);
                        }

                        setIsLabelingWithAI(true);
                        try {
                          // Lấy versionId từ metadata của dữ liệu (nếu có) hoặc từ localStorage
                          let versionId: string =
                            (stage3Convs[0] as any)?.datasetVersionId ||
                            (stage3Convs[0] as any)?.versionId ||
                            localStorage.getItem('current_version_id') ||
                            '';

                          // Nếu chưa có versionId, tự động tạo Dataset Version mới để lưu vào DB
                          if (!versionId) {
                            const payload = {
                              projectName: 'Auto-Label Dataset',
                              projectId: (localStorage.getItem('current_project_id') || undefined) as any,
                              operationType: 'labeling_base' as const,
                              similarityThreshold: 0.85,
                              format: 'openai' as const,
                              data: stage3Convs.map((conv, idx) => {
                                const messages = conv.messages.flatMap((m: any) => [
                                  { role: 'user', content: m.user },
                                  { role: 'assistant', content: m.assistant }
                                ]).filter((m: any) => m.content && String(m.content).trim() !== '');

                                return {
                                  sourceKey: `conv-${idx}`,
                                  data: {
                                    messages,
                                    cluster: conv.groupId,
                                    conversation_id: `conv-${idx}`
                                  }
                                };
                              })
                            };
                            const created = await apiService.createDatasetVersion(payload);
                            versionId = created.datasetVersion._id;
                            localStorage.setItem('current_version_id', versionId);
                          }

                          // Gọi endpoint thật: POST /dataprep/versions/:versionId/auto-label/preview
                          const res = await apiService.previewAutoLabels(versionId, aiProvider);
                          const suggestions = res.suggestions || [];

                          // BE trả về clusterId (0-indexed) → map sang groupId của GROUP_DATA
                          const labelMap: Record<number, string> = {};
                          const predefinedLabels = ['MATH', 'CODING', 'ENGLISH', 'PHYSICS', 'PHYSICAL', 'CHEMISTRY', 'BIOLOGY', 'HISTORY', 'LITERATURE', 'OTHER', 'NOISE'];
                          const newLabels = new Set<string>();

                          suggestions.forEach((s: any) => {
                            // clusterId từ BE có thể là 0,1,2... còn groupId trong UI là 1,2,3...
                            const groupId = (s.clusterId ?? s.groupId);
                            if (groupId !== undefined) {
                              labelMap[groupId] = s.label;
                              if (s.label && !predefinedLabels.includes(s.label) && !customSubjectLabels.includes(s.label)) {
                                newLabels.add(s.label);
                              }
                            }
                          });

                          if (newLabels.size > 0) {
                            setPendingAiLabels(Array.from(newLabels));
                          }
                          setAiGroupLabels(prev => ({ ...prev, ...labelMap }));
                        } catch (err: any) {
                          const msg = err?.response?.data?.error || err?.message || 'AI labeling failed.';
                          alert(`Lỗi gán nhãn AI: ${msg}`);
                        } finally {
                          setIsLabelingWithAI(false);
                        }
                      }}
                    >
                      {isLabelingWithAI
                        ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý...</>
                        : <><Sparkles size={14} /> Label with AI</>
                      }
                    </button>
                  </div>
                </div>

                {pendingAiLabels.length > 0 && (
                  <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ color: '#d97706', marginTop: '2px' }}><Sparkles size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                          AI phát hiện môn học mới
                        </div>
                        <div style={{ fontSize: '12px', color: '#b45309', marginBottom: '10px' }}>
                          Có vẻ dữ liệu của bạn có các môn: <strong>{pendingAiLabels.join(', ')}</strong>. Bạn có muốn thêm vào danh sách lựa chọn?
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            style={{ padding: '4px 10px', fontSize: '12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => {
                              setCustomSubjectLabels(prev => [...new Set([...prev, ...pendingAiLabels])]);
                              setPendingAiLabels([]);
                            }}
                          >
                            Thêm & Áp dụng
                          </button>
                          <button
                            style={{ padding: '4px 10px', fontSize: '12px', background: 'transparent', color: '#b45309', border: '1px solid #fcd34d', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => setPendingAiLabels([])}
                          >
                            Bỏ qua
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Group Cards */}
                <div className="group-cards-container" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {!clusterRan ? (
                    /* Placeholder: chưa chạy cluster */
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔬</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Chưa có dữ liệu phân cụm</div>
                      <div style={{ fontSize: '12px', lineHeight: '1.6' }}>Vui lòng quay lại <strong>Stage 2 → K-means Cluster</strong> và chạy phân cụm trước khi gán nhãn.</div>
                    </div>
                  ) : (
                    <>
                      {/* Show All button */}
                      <div
                        className={`group-card-item ${selectedGroup3 === null ? 'group-card-active' : ''}`}
                        style={{ borderColor: '#94a3b8', '--group-accent': '#64748b' } as React.CSSProperties}
                        onClick={() => { setSelectedGroup3(null); setStage3Page(1); }}
                      >
                        <div className="group-card-name" style={{ color: '#64748b' }}>All Groups</div>
                        <div className="group-card-count">{allConvRows.length}</div>
                      </div>

                      {/* Legend Header */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px 16px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <div style={{ flex: 1 }}>Group Name</div>
                        <div style={{ width: '36px', textAlign: 'center', marginRight: '12px' }}>Count</div>
                        <div style={{ width: '120px', textAlign: 'left', paddingLeft: '4px' }}>Label</div>
                      </div>

                      {GROUP_DATA.map(g => (
                        <div
                          key={g.id}
                          className={`group-card-item ${selectedGroup3 === g.id ? 'group-card-active' : ''}`}
                          style={{ borderColor: g.color, '--group-accent': g.color } as React.CSSProperties}
                          onClick={() => { setSelectedGroup3(g.id); setStage3Page(1); }}
                        >
                          <div className="group-card-name" style={{ color: g.color, fontWeight: 700 }}>Group {g.id}</div>
                          <div className="group-card-count">{g.count}</div>
                          <div className="group-card-label">
                            <select
                              className="inline-label-select"
                              onClick={e => e.stopPropagation()}
                              value={aiGroupLabels[g.id] || g.label}
                              onChange={e => {
                                const newLabel = e.target.value;
                                setAiGroupLabels(prev => ({ ...prev, [g.id]: newLabel }));
                                setStage3Convs(prev => prev.map(c =>
                                  c.groupId === g.id ? { ...c, groupLabel: newLabel } : c
                                ));
                              }}
                            >
                              <option value="">-- Select --</option>
                              <option value="MATH">MATH</option>
                              <option value="CODING">CODING</option>
                              <option value="ENGLISH">ENGLISH</option>
                              <option value="PHYSICS">PHYSICS</option>
                              <option value="PHYSICAL">PHYSICAL</option>
                              <option value="CHEMISTRY">CHEMISTRY</option>
                              <option value="BIOLOGY">BIOLOGY</option>
                              <option value="HISTORY">HISTORY</option>
                              <option value="LITERATURE">LITERATURE</option>
                            <option value="ENGLISH">ENGLISH</option>
                              <option value="OTHER">OTHER</option>
                              <option value="NOISE">NOISE</option>
                              {customSubjectLabels.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                              {pendingAiLabels.map(lbl => <option key={lbl} value={lbl}>{lbl} (Mới)</option>)}
                            </select>
                          </div>
                        </div>
                      ))}

                      {isLabelingWithAI && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          AI đang phân tích và gán nhãn...
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="label-bottom-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  {/* Clear button — luôn hiển thị khi đã chạy cluster */}
                  {clusterRan && (
                    <button
                      onClick={() => {
                        setAiGroupLabels({});
                        setStage3Convs(prev => prev.map(c => ({ ...c, groupLabel: '' })));
                      }}
                      disabled={Object.keys(aiGroupLabels).length === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'white', border: '1.5px solid #e2e8f0',
                        color: Object.keys(aiGroupLabels).length > 0 ? '#64748b' : '#cbd5e1',
                        padding: '8px 16px', borderRadius: '6px',
                        fontSize: '13px', fontWeight: 600, cursor: Object.keys(aiGroupLabels).length > 0 ? 'pointer' : 'not-allowed',
                        transition: 'all 0.15s',
                        opacity: Object.keys(aiGroupLabels).length > 0 ? 1 : 0.5
                      }}
                      onMouseEnter={e => {
                        if (Object.keys(aiGroupLabels).length === 0) return;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444';
                        (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                        (e.currentTarget as HTMLButtonElement).style.color = Object.keys(aiGroupLabels).length > 0 ? '#64748b' : '#cbd5e1';
                        (e.currentTarget as HTMLButtonElement).style.background = 'white';
                      }}
                      title="Xóa toàn bộ nhãn AI đã gán"
                    >
                      <X size={14} /> Clear
                    </button>
                  )}
                  <button
                    className="save-labels-btn"
                    disabled={!clusterRan || isSavingLabels}
                    style={{ opacity: (clusterRan && !isSavingLabels) ? 1 : 0.5 }}
                    onClick={async () => {
                      if (!clusterRan || isSavingLabels) return;
                      setIsSavingLabels(true);
                      try {
                        const versionId = localStorage.getItem('current_version_id');
                        if (!versionId) {
                          alert('Không tìm thấy versionId, không thể lưu nhãn lên DB.');
                          setIsSavingLabels(false);
                          return;
                        }

                        // Payload: { clusterId, label }
                        const payloadLabels = Object.entries(aiGroupLabels).map(([groupId, label]) => ({
                          clusterId: Number(groupId),
                          label
                        }));

                        if (payloadLabels.length === 0) {
                          alert('Chưa có nhãn nào được gắn.');
                          setIsSavingLabels(false);
                          return;
                        }

                        await apiService.saveAutoLabels(versionId, payloadLabels);

                        // Cập nhật giao diện cục bộ sau khi lưu thành công
                        setStage3Convs(prev => prev.map(c => ({
                          ...c,
                          groupLabel: aiGroupLabels[c.groupId] || c.groupLabel
                        })));
                        alert('Đã lưu nhãn thành công vào Database!');
                      } catch (err: any) {
                        console.error('Save labels error:', err);
                        alert(`Lỗi khi lưu nhãn: ${err.message || 'Unknown error'}`);
                      } finally {
                        setIsSavingLabels(false);
                      }
                    }}
                  >
                    {isSavingLabels ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                    {isSavingLabels ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Detail Popup for Stage 3 */}
        {selectedConv3 && (
          <div className="cluster-popup-overlay" onClick={() => setSelectedConv3(null)}>
            <div className="cluster-popup-content conv-detail-popup" onClick={(e) => e.stopPropagation()}>
              <div className="cluster-popup-header">
                <div className="cluster-popup-header-left">
                  <MessageSquare size={20} />
                  <div>
                    <h2>Conversation Detail</h2>
                    <p>{selectedConv3.id} · {selectedConv3.messages.length} messages · <span style={{ color: selectedConv3.groupColor, fontWeight: 700 }}>Group {selectedConv3.groupId} — {selectedConv3.groupLabel}</span></p>
                  </div>
                </div>
                <button className="cluster-popup-close-btn" onClick={() => setSelectedConv3(null)}>
                  <X size={18} /> Close
                </button>
              </div>
              <div className="conv-detail-body">
                {selectedConv3.messages.map((msg, idx) => (
                  <div key={idx} className="conv-detail-pair">
                    <div className="conv-detail-label">#{idx + 1}</div>
                    <div className="conv-detail-msg conv-detail-user">
                      <div className="conv-detail-role">👤 User</div>
                      <div className="conv-detail-text">{renderMessageContent(String(msg.user || ''))}</div>
                    </div>
                    <div className="conv-detail-msg conv-detail-assistant">
                      <div className="conv-detail-role">🤖 Assistant</div>
                      <div className="conv-detail-text">{renderMessageContent(String(msg.assistant || ''))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentSubStep3 === 6 && (
          <div className="sa-dashboard">
            {/* Public Access Bar */}
            <div className="sa-public-bar">
              <div>
                <h4>Public Access</h4>
                <p>Publish this sample publicly while managing assignee target labels.</p>
              </div>
              <div className="sa-public-actions">
                <button className="sa-btn-outline"><Settings size={14} /> Refresh</button>
                <button className="sa-btn-outline">Public: OFF</button>
              </div>
            </div>

            {/* Status Cards Row */}
            <div className="sa-status-row">
              {['ASSIGNED', 'ASSIGNEES', 'IN PROGRESS', 'SUBMITTED', 'SAVED DECISIONS', 'NEEDS REVIEW', 'PUBLISHED'].map(label => (
                <div key={label} className="sa-status-card">
                  <span className="sa-status-label">{label}</span>
                  <span className="sa-status-value">0</span>
                </div>
              ))}
            </div>

            <div className="sa-main-layout">
              {/* Left Content */}
              <div className="sa-left">
                {/* Task Allocation */}
                <div className="sa-section-card">
                  <div className="sa-section-header">
                    <div>
                      <h4>Task Allocation Dashboard</h4>
                      <p>Divide your unassigned dataset into batches and assign to annotation.</p>
                    </div>
                    <button className="sa-create-task-btn" onClick={() => setShowCreateTaskModal(true)}><Plus size={14} /> Create Task</button>
                  </div>

                  <div className="sa-alloc-cards">
                    <div className="sa-alloc-card">
                      <span className="sa-alloc-label">Total Samples</span>
                      <span className="sa-alloc-value sa-dark">120</span>
                    </div>
                    <div className="sa-alloc-card sa-alloc-green">
                      <span className="sa-alloc-label sa-green-text">Assigned</span>
                      <span className="sa-alloc-value sa-green-text">30</span>
                    </div>
                    <div className="sa-alloc-card sa-alloc-orange">
                      <span className="sa-alloc-label sa-orange-text">Unassigned</span>
                      <span className="sa-alloc-value sa-orange-text">90</span>
                    </div>
                  </div>

                  <h5 className="sa-sub-title">Active Tasks</h5>
                  <div className="sa-tasks-table-wrap">
                    <table className="sa-tasks-table">
                      <thead>
                        <tr>
                          <th>BATCH</th>
                          <th>ASSIGNEES</th>
                          <th>SAMPLES</th>
                          <th>DUE DATE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="sa-link">batch1</span></td>
                          <td>hoang22_nmgf</td>
                          <td>30 samples assigned</td>
                          <td className="sa-date">June 8, 2026</td>
                          <td><span className="sa-badge-pending">Pending</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Samples */}
                <div className="sa-section-card">
                  <h4 className="sa-section-title">Samples</h4>
                  <div className="sa-tasks-table-wrap">
                    <table className="sa-tasks-table sa-samples-table">
                      <thead>
                        <tr>
                          <th style={{ width: '5%' }}>ID</th>
                          <th style={{ width: '65%' }}>SAMPLE KEY & CONTENT</th>
                          <th style={{ width: '30%' }}>ASSIGNEES</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="sa-id-cell">#1</td>
                          <td>
                            <div className="sa-sample-key">
                              <span className="sa-conv-name">conv-1</span>
                              <span className="sa-conflict-badge">⊘ Conflict</span>
                            </div>
                            <div className="sa-sample-content">Em không hiểu hàm số bậc nhất là gì. Em cứ nhìn thế nào dạng tổng quát của đường thẳng trên mặt phẳng tọa độ không? Thử đoán hàm số bậc nhất có dạng y = ax + b với a như thế nào?</div>
                            <div className="sa-sample-meta">IAA 0.11 · 3 pending adjudication</div>
                          </td>
                          <td>
                            <div className="sa-assignee">hoang22</div>
                            <div className="sa-assignee-email">hoangndnhe180790@fpt.edu.vn</div>
                            <div className="sa-assignee">uhhgf</div>
                            <div className="sa-assignee-email">hoangndnhe180790@fpt.edu.vn</div>
                          </td>
                        </tr>
                        <tr>
                          <td className="sa-id-cell">#2</td>
                          <td>
                            <div className="sa-sample-key">
                              <span className="sa-conv-name">conv-2</span>
                            </div>
                            <div className="sa-sample-content">Hệ số góc của đường thẳng là gì? Khi x tăng 1 đơn vị mà y thay đổi bao nhiêu đơn vị, em nghĩ đại lượng nào đang có là góc dốc của đường thẳng đó?</div>
                          </td>
                          <td><span className="sa-unassigned-tag">Unassigned</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {currentSubStep3 === 7 && (
          <div className="ia-dashboard">
            {/* Coverage Bar */}
            <div className="ia-coverage-bar">
              <div>
                <h4>Intent-Action Coverage</h4>
                <p>0 / 90 samples have complete Intent-Action labels.</p>
              </div>
              <div className="ia-coverage-stats">
                <span className="ia-stat-green">Complete: 0</span>
                <span className="ia-stat-red">Missing: 90</span>
              </div>
            </div>

            <div className="ia-main-layout">
              {/* Left: Chat History */}
              <div className="ia-left">
                <div className="ia-section-card">
                  <div className="ia-chat-header">
                    <h4><FileText size={14} /> Chat History</h4>
                    <div className="ia-chat-meta">Conversation 1 &nbsp; <strong>1 / 90</strong></div>
                  </div>

                  <div className="ia-chat-tabs">
                    <button className={`ia-tab ${iaActiveTab === 'assignment' ? 'active' : ''}`} onClick={() => setIaActiveTab('assignment')}>Assignment</button>
                    <button className={`ia-tab ${iaActiveTab === 'unassigned' ? 'active' : ''}`} onClick={() => setIaActiveTab('unassigned')}>Unassigned</button>
                  </div>

                  {iaActiveTab === 'assignment' && (
                    <>
                      <div className="ia-chat-messages">
                        {iaMessages.map((msg) => {
                          const isUser = msg.role === 'user';
                          const isSelected = selectedIaMsgId === msg.id;

                          const msgClass = isUser ? 'ia-msg ia-msg-user' : 'ia-msg ia-msg-assistant';
                          const bubbleClass = isUser
                            ? `ia-msg-bubble ia-bubble-user ${isSelected ? 'ia-bubble-selected-user' : ''}`
                            : `ia-msg-bubble ia-bubble-assistant ${isSelected ? 'ia-bubble-selected-assistant' : ''}`;

                          const numClass = isUser ? 'ia-msg-num' : 'ia-msg-num ia-num-green';

                          const activeLabels = [];
                          Object.keys(msg.labels).forEach((groupName) => {
                            msg.labels[groupName].forEach((tag) => {
                              if (tag.active) {
                                activeLabels.push(tag.name);
                              }
                            });
                          });

                          return (
                            <div
                              key={msg.id}
                              className={msgClass}
                              onClick={() => setSelectedIaMsgId(prev => prev === msg.id ? null : msg.id)}
                              style={{ cursor: 'pointer', marginBottom: '8px' }}
                            >
                              {isUser ? (
                                <>
                                  <div className={bubbleClass}>
                                    <span className="ia-msg-role">USER</span>
                                    <p>{msg.text}</p>
                                  </div>
                                  <span className={numClass}>{msg.turn}</span>
                                  {activeLabels.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', marginLeft: '0' }}>
                                      {activeLabels.map((lbl) => (
                                        <div
                                          key={lbl}
                                          className="ia-msg-label"
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 10px',
                                            borderRadius: '16px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            margin: '0',
                                            ...getLabelBadgeStyle(lbl)
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveMessageSingleLabel(msg.id, lbl);
                                          }}
                                        >
                                          {lbl === 'OK' && <Check size={10} style={{ marginRight: '2px' }} />}
                                          {lbl} <X size={10} style={{ marginLeft: '4px' }} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className={numClass}>{msg.turn}</span>
                                  <div className={bubbleClass}>
                                    <span className="ia-msg-role">ASSISTANT</span>
                                    <p>{msg.text}</p>
                                  </div>
                                  {activeLabels.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', marginLeft: '32px' }}>
                                      {activeLabels.map((lbl) => (
                                        <div
                                          key={lbl}
                                          className="ia-msg-label"
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 10px',
                                            borderRadius: '16px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            margin: '0',
                                            ...getLabelBadgeStyle(lbl)
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveMessageSingleLabel(msg.id, lbl);
                                          }}
                                        >
                                          {lbl} <X size={10} style={{ marginLeft: '4px' }} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Pagination */}
                      <div className="ia-chat-pagination">
                        <button className="ia-page-btn">← Previous</button>
                        <span className="ia-page-info">1 / 90</span>
                        <button className="ia-page-btn">Next →</button>
                      </div>
                    </>
                  )}

                  {iaActiveTab === 'unassigned' && (
                    <>
                      <div className="ia-unassigned-list">
                        {[
                          { id: 'conv-4', preview: 'Thầy ơi, lực ma sát là gì ạ? Em nghe nói có 2 loại...', turns: 6, subject: 'PHYSICAL' },
                          { id: 'conv-5', preview: 'Cho em hỏi cách tính diện tích hình thang ạ?', turns: 4, subject: 'MATH' },
                          { id: 'conv-7', preview: 'Em không hiểu phản ứng oxi hóa khử, giải thích giúp em...', turns: 8, subject: 'CHEM' },
                          { id: 'conv-9', preview: 'Anh ơi giải giúp em bài toán xác suất này...', turns: 5, subject: 'MATH' },
                          { id: 'conv-12', preview: 'Quang hợp là gì ạ? Cây xanh hấp thụ ánh sáng như nào?', turns: 7, subject: 'BIO' },
                          { id: 'conv-15', preview: 'Cho em hỏi về thuyết tương đối của Einstein...', turns: 10, subject: 'PHYSICAL' },
                        ].map((conv) => (
                          <div key={conv.id} className="ia-unassigned-item">
                            <div className="ia-unassigned-info">
                              <div className="ia-unassigned-top">
                                <span className="ia-unassigned-id">{conv.id}</span>
                                <span className={`ia-unassigned-subject ia-subj-${conv.subject.toLowerCase()}`}>{conv.subject}</span>
                                <span className="ia-unassigned-turns">{conv.turns} turns</span>
                              </div>
                              <p className="ia-unassigned-preview">{conv.preview}</p>
                            </div>
                            <button className="ia-assign-btn">Assign to me</button>
                          </div>
                        ))}
                      </div>

                      <div className="ia-chat-pagination">
                        <button className="ia-page-btn">← Previous</button>
                        <span className="ia-page-info">1 / 15</span>
                        <button className="ia-page-btn">Next →</button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Labels Panel */}
              <div className="ia-right">
                {/* Current Labels */}
                <div className="ia-section-card">
                  <div className="ia-labels-header">
                    <h4>◇ Current Labels</h4>
                    <span className="ia-label-count">1</span>
                  </div>
                  <input type="text" defaultValue="Conversation" className="ia-label-input" />
                  <div className="ia-current-label-card">
                    <div className="ia-cl-info">
                      <span className="ia-cl-name">MATH</span>
                      <span className="ia-cl-meta">1 user(s)</span>
                      <span className="ia-cl-assigned">Assigned by you</span>
                    </div>
                    <button className="ia-cl-remove"><X size={14} /></button>
                  </div>
                  <div className="ia-label-actions-row">
                    <button className="ia-add-label-btn">Add Label</button>
                    <input type="number" defaultValue={1} className="ia-label-num-input" />
                    <select className="ia-label-select">
                      <option>OpenRouter</option>
                      <option>Deepseek</option>
                    </select>
                  </div>
                  <div className="ia-label-btn-row">
                    <button className="ia-auto-labeling-btn">Auto Labeling</button>
                    <button className="ia-user-guide-btn" onClick={() => setShowUserGuide(true)}>📋 User Guide</button>
                  </div>
                </div>

                {/* Hard Labels */}
                <div className="ia-section-card">
                  {selectedIaMsgId ? (
                    (() => {
                      const selectedMsg = iaMessages.find(m => m.id === selectedIaMsgId);
                      if (!selectedMsg) return null;

                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h5 className="ia-section-subtitle" style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800' }}>
                              {selectedMsg.role === 'user' ? 'USER HARD LABELS' : 'ASSISTANT HARD LABELS'}
                            </h5>
                            <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: '13px' }}>
                              Turn {selectedMsg.turn}
                            </span>
                          </div>

                          {Object.keys(selectedMsg.labels).map((groupName) => (
                            <div key={groupName} className="ia-hl-group" style={{ marginBottom: '16px' }}>
                              <span className="ia-hl-group-label" style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                                {groupName}
                              </span>
                              <div className="ia-hl-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {selectedMsg.labels[groupName].map((tag) => {
                                  const isTagActive = tag.active;
                                  const isGreen = tag.colorClass === 'green' || (selectedMsg.role === 'user' && groupName === 'KNOWLEDGE' && tag.name === 'OK');
                                  const isBlue = tag.colorClass === 'blue' || (selectedMsg.role === 'assistant' && groupName === 'PEDAGOGY' && tag.name === 'SCAF');
                                  const isRed = tag.colorClass === 'red';

                                  let tagStyle: React.CSSProperties = {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '4px 8px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease-in-out',
                                    minWidth: '75px',
                                    flex: '1 1 calc(33.33% - 6px)',
                                    background: 'white',
                                    color: '#334155',
                                    boxSizing: 'border-box'
                                  };

                                  if (isTagActive) {
                                    if (isGreen) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#e8f5e9',
                                        borderColor: '#4caf50',
                                        color: '#2e7d32',
                                        fontWeight: 700,
                                      };
                                    } else if (isBlue) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#e3f2fd',
                                        borderColor: '#2196f3',
                                        color: '#1565c0',
                                        fontWeight: 700,
                                      };
                                    } else if (isRed) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#ffebee',
                                        borderColor: '#ef5350',
                                        color: '#c62828',
                                        fontWeight: 700,
                                      };
                                    } else {
                                      // Default active: purple
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#f3e8ff',
                                        borderColor: '#a855f7',
                                        color: '#6b21a8',
                                        fontWeight: 700,
                                      };
                                    }
                                  }

                                  // Specific widths to match image:
                                  // OK and NO: 2 per row
                                  if (groupName === 'KNOWLEDGE' || groupName === 'OTHER' || (groupName === 'ISSUES' && selectedMsg.role === 'user')) {
                                    tagStyle.flex = '1 1 calc(50% - 6px)';
                                  }

                                  return (
                                    <div
                                      key={tag.name}
                                      style={tagStyle}
                                      onClick={() => handleToggleLabel(selectedMsg.id, groupName, tag.name)}
                                      className="ia-hl-tag-interactive"
                                    >
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                        <span style={{ fontSize: '11px' }}>{tag.icon}</span>
                                        <span>{tag.name}</span>
                                      </span>
                                      <span style={{ opacity: 0.8, fontSize: '11px', fontWeight: 'bold', marginLeft: '4px' }}>{tag.count}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <div>
                      <h5 className="ia-section-subtitle">HARD LABELS</h5>
                      <p className="ia-empty-hint">Chọn một tin nhắn để gán nhãn</p>
                    </div>
                  )}
                </div>

                {/* Conversation Hard Labels */}
                <div className="ia-section-card">
                  <h5 className="ia-section-subtitle">CONVERSATION HARD LABELS</h5>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">DECISION</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag">✕ REJ 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">SUBJECT</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-purple">▦ MATH 0</span>
                      <span className="ia-hl-tag ia-tag-green">⟡ PHYS 1</span>
                      <span className="ia-hl-tag ia-tag-red">⟡ CHEM 0</span>
                      <span className="ia-hl-tag">▭ LIT 0</span>
                      <span className="ia-hl-tag ia-tag-purple">⊞ BIO 0</span>
                      <span className="ia-hl-tag">▦ MULTI 0</span>
                      <span className="ia-hl-tag">◎ UNCLEAR 0</span>
                      <span className="ia-hl-tag">○ OOS 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">STATUS</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-green">✓ COMPLETED 0</span>
                      <span className="ia-hl-tag ia-tag-orange">◎ INCOMPLETE 0</span>
                      <span className="ia-hl-tag ia-tag-red">✕ DROPPED 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">QUALITY</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-green">✦ GOOD 0</span>
                      <span className="ia-hl-tag">⊞ MEDIUM 0</span>
                      <span className="ia-hl-tag ia-tag-red">✕ POOR 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">ISSUES</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag">⊙ FACT_ERR 0</span>
                      <span className="ia-hl-tag">› DIR_ANS 0</span>
                      <span className="ia-hl-tag">▭ LANG_ISSUE 0</span>
                    </div>
                  </div>
                </div>

                {/* Soft Label */}
                <div className="ia-section-card">
                  <h5 className="ia-section-subtitle">SOFT LABEL</h5>
                  <div className="ia-soft-label-row">
                    <input type="text" placeholder="e.g. grammar error" className="ia-soft-input" />
                    <button className="ia-soft-add-btn">Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Guide Modal */}
        {showUserGuide && (
          <div className="modal-overlay" onClick={() => setShowUserGuide(false)}>
            <div className="ug-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ug-header">
                <h2>Labeling User Guide</h2>
                <button className="modal-close-btn" onClick={() => setShowUserGuide(false)}>
                  <X size={20} />
                </button>
              </div>
              <p className="ug-subtitle">Reference for manual intent-action labeling, with definitions and common intent-action pairings.</p>

              <div className="ug-body">
                {/* Conversation Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Conversation Labels</h3>
                  <p className="ug-section-desc">Nhãn ở mức toàn bộ hội thoại.</p>

                  <div className="ug-cards-grid">
                    <div className="ug-card ug-card-reject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-red">✕</span>
                        <span className="ug-card-name ug-name-red">REJECT</span>
                      </div>
                      <p className="ug-card-desc">Dùng khi toàn bộ hội thoại không nên đi tiếp trong pipeline vì chất lượng hoặc phạm vi không phù hợp.</p>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-purple">▦</span>
                        <span className="ug-card-name ug-name-purple">MATH</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Toán.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">REQUEST_HINT + HINTING</span>
                      </div>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-green">⟡</span>
                        <span className="ug-card-name ug-name-green">PHYS</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Vật lý.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">EXPLAIN_CONCEPT + SCAFFOLDING</span>
                      </div>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-red">⟡</span>
                        <span className="ug-card-name ug-name-red">CHEM</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Hóa học.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">REQUEST_HINT + HINTING</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Intent Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Intent Labels (User)</h3>
                  <p className="ug-section-desc">Nhãn mô tả ý định của học sinh trong mỗi lượt nói.</p>

                  <div className="ug-table-wrap">
                    <table className="ug-table">
                      <thead>
                        <tr>
                          <th>Intent</th>
                          <th>Mô tả</th>
                          <th>Ví dụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="ug-intent-tag">REQUEST_HINT</span></td>
                          <td>Học sinh yêu cầu gợi ý hoặc hướng dẫn</td>
                          <td className="ug-example">"Em không hiểu, thầy gợi ý giúp em"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">EXPLAIN_CONCEPT</span></td>
                          <td>Học sinh yêu cầu giải thích khái niệm</td>
                          <td className="ug-example">"Chuyển động thẳng đều là gì ạ?"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">ANSWER</span></td>
                          <td>Học sinh trả lời câu hỏi của giáo viên</td>
                          <td className="ug-example">"Là vật đang di chuyển a."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">CONFIRM</span></td>
                          <td>Học sinh xác nhận hoặc đồng ý</td>
                          <td className="ug-example">"Dạ em hiểu rồi ạ!"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">ASK_FOLLOWUP</span></td>
                          <td>Học sinh hỏi thêm về chủ đề liên quan</td>
                          <td className="ug-example">"Vậy trên Mặt Trăng thì sao ạ?"</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Action Labels (Assistant)</h3>
                  <p className="ug-section-desc">Nhãn mô tả hành động của giáo viên AI trong mỗi lượt trả lời.</p>

                  <div className="ug-table-wrap">
                    <table className="ug-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Mô tả</th>
                          <th>Ví dụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="ug-action-tag">HINTING</span></td>
                          <td>Đưa ra gợi ý để dẫn dắt học sinh tự suy luận</td>
                          <td className="ug-example">"Em thử nghĩ xem: khi nói vật chuyển động..."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">SCAFFOLDING</span></td>
                          <td>Chia nhỏ vấn đề thành các bước dễ hiểu hơn</td>
                          <td className="ug-example">"Mình đi từng bước nhé..."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">DIRECT_ANSWER</span></td>
                          <td>Trả lời trực tiếp câu hỏi</td>
                          <td className="ug-example">"Công thức là F = m × a"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">POSITIVE_FEEDBACK</span></td>
                          <td>Khen ngợi, khuyến khích học sinh</td>
                          <td className="ug-example">"Chính xác! Em hiểu rất nhanh!"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">REDIRECT</span></td>
                          <td>Chuyển hướng khi học sinh lạc đề hoặc yêu cầu đáp án</td>
                          <td className="ug-example">"Mình chỉ cần một câu thôi..."</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep3 > 5) {
              setCurrentSubStep3(currentSubStep3 - 1);
            } else {
              setCurrentStage(2);
            }
          }}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep3 < 7) {
              setCurrentSubStep3(currentSubStep3 + 1);
            } else {
              setCurrentSubStep4(7);
              setCurrentStage(4);
            }
          }}>
            Next
          </button>
        </div>
      </div>
    );
  };

  const QUALITY_CONVS = [
    { id: 'CONV-1', hash: '(HỘI THOẠI #42D67D)', label: 'MATH_ADVANCED', desc: 'Nó theo xuất sắc...', quality: 'GOLD', msgs: 4, turns: 2, score: 4.80 },
    { id: 'CONV-2', hash: '(HỘI THOẠI #42D4E)', label: 'OUT_OF_SCOPE', desc: 'Chỉ viết lại phần Nó A...', quality: 'REWRITE', msgs: 4, turns: 2, score: 2.50 },
    { id: 'CONV-3', hash: '(HỘI THOẠI #42DE5T)', label: 'OUT_OF_SCOPE', desc: 'AI phản hồi sai kiến thức...', quality: 'BAD', msgs: 4, turns: 2, score: 1.20 },
    { id: 'CONV-4', hash: '(HỘI THOẠI #42D68B)', label: 'PHYSICS_MOTION', desc: 'Giải thích rõ ràng...', quality: 'GOLD', msgs: 4, turns: 2, score: 4.50 },
  ];

  return (
    <div className="dataprep-view">
      {/* Cleaning Preview Modal */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content cleaning-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔍 Cleaning Preview</h2>
              <p className="modal-subtitle">Xem trước kết quả làm sạch dữ liệu — file gốc không bị thay đổi</p>
              <button className="modal-close-btn" onClick={() => setShowPreviewModal(false)}>
                <X size={20} />
              </button>
            </div>

            {(() => {
              const beforeList = cleaningPreviewBefore.length > 0 ? cleaningPreviewBefore : PREVIEW_BEFORE;
              const afterList = cleaningPreviewAfter.length > 0 ? cleaningPreviewAfter : PREVIEW_AFTER;
              const removedList = cleaningPreviewRemoved.length > 0 ? cleaningPreviewRemoved : PREVIEW_REMOVED;
              const totalCount = beforeList.length;
              const keptCount = afterList.length;
              const fixedCount = afterList.filter(r => r.status === 'fixed').length;
              const removedCount = removedList.length;

              return (
                <>
                  {/* Tabs */}
                  <div className="preview-modal-tabs">
                    <button
                      className={`preview-tab ${previewTab === 'before' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('before')}
                    >
                      📄 Before (Mẫu {totalCount})
                    </button>
                    <button
                      className={`preview-tab ${previewTab === 'after' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('after')}
                    >
                      ✅ After (Mẫu {keptCount})
                    </button>
                    <button
                      className={`preview-tab tab-removed ${previewTab === 'removed' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('removed')}
                    >
                      🗑️ Removed (Mẫu {removedCount})
                    </button>
                  </div>

                  {(() => {
                    const realTotal = conversionStats?.stats?.cleaning?.originalCount ?? conversionStats?.stats?.totalConversations ?? conversationsList.length;
                    const realKept = conversionStats?.stats?.cleaning?.finalCount ?? conversationsList.length;
                    const realRemoved = realTotal - realKept;
                    const realFixed = conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0;

                    return (
                      <>
                        {/* Summary bar */}
                        <div className="preview-modal-summary">
                          <span className="summary-tag summary-total">Tổng tệp: {realTotal} hội thoại</span>
                          <span className="summary-tag summary-kept">Giữ lại: {realKept}</span>
                          <span className="summary-tag summary-fixed">Đã sửa: {realFixed}</span>
                          <span className="summary-tag summary-removed">Loại bỏ: {realRemoved}</span>
                        </div>

                        {/* Info Alert */}
                        <div className="preview-modal-info-alert" style={{ margin: '8px 16px', padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>ℹ️</span>
                          <span><strong>Lưu ý:</strong> Bảng bên dưới chỉ hiển thị mẫu {totalCount} hội thoại đầu tiên để xem trước kết quả. Khi bấm "Xác nhận & Áp dụng", bộ lọc sẽ được áp dụng cho <strong>tất cả {realTotal} cuộc hội thoại</strong> trong tệp dữ liệu.</span>
                        </div>
                      </>
                    );
                  })()}

                  {/* Tab Content */}
                  <div className="preview-modal-body">
                    {previewTab === 'before' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Status</th>
                            <th>User</th>
                            <th>Assistant (trước)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beforeList.map((row) => (
                            <tr key={row.id} className={row.status === 'has-issue' ? 'row-issue' : 'row-clean'}>
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td>
                                {row.issue
                                  ? <span className="status-badge badge-issue">{row.issue}</span>
                                  : <span className="status-badge badge-clean">Clean</span>
                                }
                              </td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {previewTab === 'after' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Action</th>
                            <th>User</th>
                            <th>Assistant (sau)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {afterList.map((row) => (
                            <tr key={row.id} className={row.status === 'fixed' ? 'row-fixed' : 'row-clean'}>
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td><span className={`status-badge ${row.status === 'fixed' ? 'badge-fixed' : 'badge-clean'}`}>{row.action}</span></td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {previewTab === 'removed' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Lý do loại bỏ</th>
                            <th>User</th>
                            <th>Assistant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {removedList.map((row) => (
                            <tr key={row.id} className="row-removed">
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td><span className="status-badge badge-removed">{row.reason}</span></td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="preview-modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowPreviewModal(false)}>
                Hủy
              </button>
              <button className="modal-confirm-btn" onClick={() => {
                if (pendingCleanedList.length > 0) {
                  setConversationsList(pendingCleanedList);
                  setStage3Convs(pendingCleanedList.map((c, idx) => {
                    const INITIAL_GROUP_DATA = [
                      { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
                      { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
                      { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
                      { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
                      { id: 5, label: 'Group -1', color: '#dc2626', bg: '#fef2f2' }
                    ];
                    const group = INITIAL_GROUP_DATA[idx % INITIAL_GROUP_DATA.length];
                    return {
                      ...c,
                      groupId: group.id,
                      groupLabel: group.label,
                      groupColor: group.color,
                      groupBg: group.bg,
                      subGroup: c.subGroup || 'A',
                      confidence: Math.floor(Math.random() * 10 + 90)
                    };
                  }));
                }
                setCleaningApplied(true);
                setShowPreviewModal(false);
              }}>
                <Check size={16} />
                Xác nhận & Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowWorkflowBar && (
        <div className="dataprep-workflow-bar">
          <div className="dataprep-workflow-copy">
            <span className="dataprep-workflow-label">Resume draft</span>
            <strong>{activeWorkflowVersion?.projectName || pendingWorkflow?.projectName || projectName}</strong>
            <span>
              {activeWorkflowVersion
                ? getResumeLabel(activeResumeStep)
                : getResumeLabel(Number(pendingWorkflow?.prepareResumeStep || 1))}
            </span>
          </div>
          <div className="dataprep-workflow-actions">
            {pendingWorkflow && !activeWorkflowVersion && (
              <button
                type="button"
                className="dataprep-workflow-continue"
                disabled={isHydratingWorkflow}
                onClick={() => openWorkflowVersion(pendingWorkflow.id)}
              >
                {getResumeLabel(Number(pendingWorkflow.prepareResumeStep || 1))}
              </button>
            )}
            {activeWorkflowVersion && (
              <button
                type="button"
                className="dataprep-workflow-new"
                onClick={() => startNewWorkflow ? startNewWorkflow() : null}
              >
                Start new file
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="dataprep-stepper">
        {STAGES.map((stage, idx) => (
          <React.Fragment key={stage.num}>
            <div
              className={`stepper-step ${stage.num === currentStage ? 'active' : ''} ${isStageCompleted(stage.num) ? 'completed' : ''}`}
              onClick={() => setCurrentStage(stage.num)}
            >
              <div className="stepper-circle">
                {isStageCompleted(stage.num) ? <Check size={16} /> : stage.num}
              </div>
              <div className="stepper-label">
                <span className="stepper-stage-tag">STAGE {stage.num}</span>
                <span className="stepper-title">{stage.label}</span>
                <span className="stepper-sublabel">{stage.sub}</span>
              </div>
            </div>
            {idx < STAGES.length - 1 && <div className="stepper-divider" />}
          </React.Fragment>
        ))}
      </div>

      {/* Stage Content */}
      {currentStage === 1 && <Stage1Upload />}
      {currentStage === 2 && <Stage2Preprocessing />}
      {currentStage === 3 && <Stage3Labeling />}
      {currentStage === 4 && <Stage4Labeling />}
      {currentStage === 5 && <Stage6Finish />}

      {/* Compare Groups Modal */}


    </div>
  );
};

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "#fee2e2", color: "#991b1b", height: "100vh", overflow: "auto" }}>
          <h2>Something went wrong in DataPrepView</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DataPrepView() {
  return (
    <ErrorBoundary>
      <DataPrepProvider>
        <DataPrepInner />
      </DataPrepProvider>
    </ErrorBoundary>
  );
}
