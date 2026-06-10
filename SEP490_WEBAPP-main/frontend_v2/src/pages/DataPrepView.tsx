import React, { useState, useRef } from 'react';
import { apiService } from '../services/api';
import {
  Upload,
  X,
  Eye,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  FileText,
  Settings,
  Check,
  Sparkles,
  RotateCcw,
  Scissors,
  Plus,
  Calendar,
  BarChart2,
  AlertCircle,
  Filter,
  Download,
  RefreshCw,
  MessageSquare,
  HelpCircle
} from 'lucide-react';
import '../styles/dataprep.css';

const STAGES = [
  { num: 1, label: 'Upload & Convert', sub: 'Step 1' },
  { num: 2, label: 'Preprocessing', sub: 'Step 2-4' },
  { num: 3, label: 'Clustering', sub: 'Step 5-7' },
  { num: 4, label: 'Classification', sub: 'Step 8-11' },
  { num: 5, label: 'Evaluation', sub: 'Step 12' },
  { num: 6, label: 'Finish', sub: 'Step 13-15' },
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

function DataPrepView() {
  const [currentStage, setCurrentStage] = useState(1);
  const [currentSubStep, setCurrentSubStep] = useState(1);
  const [file, setFile] = useState(null);
  const [rawPreviewText, setRawPreviewText] = useState('');
  const [sampleOutputText, setSampleOutputText] = useState('');
  const [projectName, setProjectName] = useState(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `Project Dataset ${dd}/${mm}/${yyyy}`;
  });
  const [rawPreviewOpen, setRawPreviewOpen] = useState(false);
  const [conversationsList, setConversationsList] = useState<any[]>(CONVERSATIONS);
  const [selectedFormat, setSelectedFormat] = useState('openai');
  const [removeThinkTags, setRemoveThinkTags] = useState(true);
  const [cleaningEnabled, setCleaningEnabled] = useState(false);
  const [cleaningApplied, setCleaningApplied] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTab, setPreviewTab] = useState('before');
  const [conversionStats, setConversionStats] = useState<any>(null);
  const [cleaningPreviewBefore, setCleaningPreviewBefore] = useState<any[]>([]);
  const [cleaningPreviewAfter, setCleaningPreviewAfter] = useState<any[]>([]);
  const [cleaningPreviewRemoved, setCleaningPreviewRemoved] = useState<any[]>([]);
  const [isCleaningLoading, setIsCleaningLoading] = useState(false);
  const [pendingCleanedList, setPendingCleanedList] = useState<any[]>([]);

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

  /* K-means Cluster state */
  const [targetK, setTargetK] = useState('14');
  const [clusterEps, setClusterEps] = useState('0.1');
  const [clusterMinSamples, setClusterMinSamples] = useState('3');
  const [clusterRan, setClusterRan] = useState(false);
  const [simThreshold, setSimThreshold] = useState(0.9);
  const [clusterPage, setClusterPage] = useState(1);
  const clusterPerPage = 5;

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

  /* Stage 3 state */
  const SUB_STEPS_STAGE3 = [
    { num: 5, label: 'Clustering & Labeling' },
    { num: 6, label: 'Save & Assign' },
    { num: 7, label: 'Intent-Action' }
  ];
  const [currentSubStep3, setCurrentSubStep3] = useState(5);
  const [stage3Page, setStage3Page] = useState(1);
  const [stage3PerPage, setStage3PerPage] = useState(10);
  const [stage3Search, setStage3Search] = useState('');
  const [showCompareLabels, setShowCompareLabels] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [iaActiveTab, setIaActiveTab] = useState('assignment');
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [selectedGroup3, setSelectedGroup3] = useState(null);
  const [selectedConv3, setSelectedConv3] = useState(null);
  const [stage3SubGroup, setStage3SubGroup] = useState('A');
  const [stage3Convs, setStage3Convs] = useState<any[]>(() => {
    const INITIAL_GROUP_DATA = [
      { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
      { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
      { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
      { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
      { id: 5, label: 'NOISE (Outliers)', color: '#dc2626', bg: '#fef2f2' },
      { id: 6, label: 'PHYSICS', color: '#7c3aed', bg: '#f5f3ff' },
      { id: 7, label: 'CODING', color: '#2563eb', bg: '#eff6ff' },
      { id: 8, label: 'HISTORY', color: '#9333ea', bg: '#faf5ff' },
      { id: 9, label: 'MATH', color: '#ea580c', bg: '#fff7ed' },
      { id: 10, label: 'BIOLOGY', color: '#16a34a', bg: '#f0fdf4' },
      { id: 11, label: 'CODING', color: '#0284c7', bg: '#f0f9ff' },
      { id: 12, label: 'NOISE (Outliers)', color: '#e11d48', bg: '#fff1f2' },
      { id: 13, label: 'PHYSICS', color: '#4f46e5', bg: '#eef2ff' },
      { id: 14, label: 'CHEMISTRY', color: '#c026d3', bg: '#fdf4ff' },
      { id: 15, label: 'MATH', color: '#b45309', bg: '#fef3c7' },
    ];
    const multipliedConvs = [...CONVERSATIONS, ...CONVERSATIONS, ...CONVERSATIONS, ...CONVERSATIONS];
    return multipliedConvs.map((conv, idx) => {
      const gIdx = idx % INITIAL_GROUP_DATA.length;
      const group = INITIAL_GROUP_DATA[gIdx];
      return {
        ...conv,
        id: `conv_${String(idx + 1).padStart(3, '0')}`,
        groupId: group.id,
        groupLabel: group.label,
        groupColor: group.color,
        groupBg: group.bg,
        subGroup: 'A',
        confidence: Math.floor(Math.random() * 10 + 90),
      };
    });
  });
  const [checkedConvIds, setCheckedConvIds] = useState<string[]>([]);

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
    { num: 10, label: 'Distribution' },
    { num: 11, label: 'Rewrite' },
  ];
  const [currentSubStep4, setCurrentSubStep4] = useState(8);
  const [classPage, setClassPage] = useState(1);
  const [qualityTab, setQualityTab] = useState('all');
  const [rewriteConvIdx, setRewriteConvIdx] = useState(8);
  const [rewriteTab, setRewriteTab] = useState('original');

  /* Stage 5 state */
  const [judgeModels, setJudgeModels] = useState({ gemini: true, openai: false, deepseek: true });
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
  const [cloudProvider, setCloudProvider] = useState('gcloud');
  const EXPORT_ROWS = [
    { user: 'Hãy giải phương trình bậc hai sau đây: x^2 - 5x + 6 = 0', assistant: 'Để giải phương trình bậc hai này, mình sẽ hỏi một số câu hỏi...' },
    { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
    { user: 'Cách tính biệt thức delta và delta phẩy của phương trình bậc hai', assistant: 'Biệt thức Delta được tính bằng công thức b^2 - 4ac...' },
    { user: 'Phương trình bậc hai có hai nghiệm phân biệt khi nào?', assistant: 'Để hiểu kỹ hơn phương trình có hai nghiệm phân biệt, điều này có ý...' },
    { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
  ];

  const fileInputRef = useRef(null);

  const handleFileUpload = async (e: any) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      try {
        setFile({
          name: uploaded.name,
          format: 'Đang tải lên và phân tích...',
          messages: 0,
          conversations: 0,
          size: '...'
        });
        setRawPreviewText('Đang phân tích dữ liệu tệp...');
        setSampleOutputText('Đang tạo mẫu đầu ra...');

        const res = await apiService.uploadFile(uploaded);

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
        enableCleaning: cleaningEnabled,
        removeThinkTags: removeThinkTags
      });

      const mapped = mapConvertedToConversations(res.data);
      setConversationsList(mapped);
      setConversionStats(res);

      // Cập nhật cả danh sách Stage 3
      setStage3Convs(mapped.map((c, idx) => {
        const INITIAL_GROUP_DATA = [
          { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
          { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
          { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
          { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
          { id: 5, label: 'NOISE (Outliers)', color: '#dc2626', bg: '#fef2f2' }
        ];
        const group = INITIAL_GROUP_DATA[idx % INITIAL_GROUP_DATA.length];
        return {
          ...c,
          groupId: group.id,
          groupLabel: group.label,
          groupColor: group.color,
          groupBg: group.bg,
          confidence: Math.floor(Math.random() * 10 + 90)
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
        removeThinkTags: removeThinkTags,
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
        accept=".json,.csv,.jsonl"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {!file ? (
        /* ── Upload zone (no file selected) ── */
        <div className="dataprep-upload-zone" onClick={() => fileInputRef.current?.click()}>
          <Upload size={36} className="upload-icon" />
          <div className="upload-title">Drop your file here, or click to browse</div>
          <div className="upload-sub">Supports .jsonl, .json, .csv files up to 100MB</div>
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
              className={`dataprep-radio-option ${selectedFormat === 'openai' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('openai')}
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
              <div className="toolbar-search">
                <input
                  type="text"
                  className="toolbar-search-input"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
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
                    <th style={{ width: '4%', textAlign: 'center' }}>STT</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>Conv ID</th>
                    <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                    <th style={{ width: '30%' }}>User</th>
                    <th style={{ width: '43%' }}>Assistant</th>
                    <th style={{ width: '8%', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageConvs.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
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
                        <td className="col-conv-num-cell">{convGlobalIdx}</td>
                        <td className="col-conv-id-cell">
                          <span className="conv-id-badge">{conv.id}</span>
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
                                      <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx+1}:</span>
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
                                      <span style={{ fontWeight: '600', color: '#0ea5e9', flexShrink: 0 }}>A{idx+1}:</span>
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
                      <div className="conv-detail-text">{msg.user}</div>
                    </div>
                    <div className="conv-detail-msg conv-detail-assistant">
                      <div className="conv-detail-role">🤖 Assistant</div>
                      <div className="conv-detail-text">{msg.assistant}</div>
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

                        {/* Min pairs */}
                        <div className="cleaning-input-group" style={{ maxWidth: '50%' }}>
                          <label>Số cặp hỏi đáp tối thiểu:</label>
                          <input type="number" value={minPairs} onChange={(e) => setMinPairs(e.target.value)} />
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
                      setMinPairs('1');
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
                                  <tr key={row.id} className={row.status === 'fixed' ? 'row-fixed' : 'row-clean'}>
                                    <td><span className="conv-id-badge">{row.id}</span></td>
                                    <td><span className={`status-badge ${row.status === 'fixed' ? 'badge-fixed' : 'badge-clean'}`}>{row.action}</span></td>
                                    <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                    <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
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
                          const INITIAL_GROUP_DATA = [
                            { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
                            { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
                            { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
                            { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
                            { id: 5, label: 'NOISE (Outliers)', color: '#dc2626', bg: '#fef2f2' }
                          ];
                          const group = INITIAL_GROUP_DATA[idx % INITIAL_GROUP_DATA.length];
                          return {
                            ...c,
                            groupId: group.id,
                            groupLabel: group.label,
                            groupColor: group.color,
                            groupBg: group.bg,
                            confidence: Math.floor(Math.random() * 10 + 90)
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
                <button className="findk-visualize-btn" onClick={() => setShowVisualization(true)}>
                  <Sparkles size={16} />
                  Visualize (GPU)
                </button>
              </div>
            </div>

            {showVisualization && (
              <>
                <div className="findk-result-banner">
                  <Sparkles size={16} className="banner-icon" />
                  <div>
                    <strong>120 points analyzed, 0 noise points filtered by DBSCAN</strong>
                    <div className="banner-sub">Recommended K: <strong>14</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</div>
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
                      <span className="legend-item legend-rec"><span className="legend-dot"></span> Recommended K = 14</span>
                    </div>
                  </div>
                  <div className="chart-area">
                    <svg viewBox="0 0 800 340" className="findk-svg">
                      {/* Grid lines */}
                      {[0, 1, 2, 3, 4].map(i => (
                        <line key={`grid-${i}`} x1="60" y1={40 + i * 65} x2="760" y2={40 + i * 65} stroke="#f1f5f9" strokeWidth="1" />
                      ))}
                      {/* Y-axis left labels (WCSS) */}
                      <text x="8" y="44" className="axis-label">12</text>
                      <text x="16" y="109" className="axis-label">9</text>
                      <text x="16" y="174" className="axis-label">6</text>
                      <text x="16" y="239" className="axis-label">3</text>
                      <text x="16" y="304" className="axis-label">0</text>
                      <text x="10" y="175" className="axis-title" transform="rotate(-90, 10, 175)">WCSS</text>
                      {/* Y-axis right labels (Silhouette) */}
                      <text x="770" y="44" className="axis-label-right">0.22</text>
                      <text x="770" y="109" className="axis-label-right">0.165</text>
                      <text x="770" y="174" className="axis-label-right">0.11</text>
                      <text x="770" y="239" className="axis-label-right">0.055</text>
                      <text x="770" y="304" className="axis-label-right">0</text>
                      <text x="795" y="175" className="axis-title-right" transform="rotate(90, 795, 175)">Silhouette</text>
                      {/* X-axis labels */}
                      {Array.from({length: 20}, (_, i) => (
                        <text key={`x-${i}`} x={60 + (i * 700 / 19)} y="330" className="axis-label" textAnchor="middle">{i + 1}</text>
                      ))}
                      {/* Recommended K=14 dotted line */}
                      <line x1={60 + (13 * 700 / 19)} y1="40" x2={60 + (13 * 700 / 19)} y2="300" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />
                      {/* WCSS line (blue) */}
                      <polyline
                        fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round"
                        points={[
                          [60, 52], [60+700/19*1, 85], [60+700/19*2, 105], [60+700/19*3, 125],
                          [60+700/19*4, 140], [60+700/19*5, 155], [60+700/19*6, 168],
                          [60+700/19*7, 178], [60+700/19*8, 188], [60+700/19*9, 196],
                          [60+700/19*10, 205], [60+700/19*11, 212], [60+700/19*12, 218],
                          [60+700/19*13, 226], [60+700/19*14, 235], [60+700/19*15, 243],
                          [60+700/19*16, 250], [60+700/19*17, 255], [60+700/19*18, 262],
                          [60+700/19*19, 268]
                        ].map(p => p.join(',')).join(' ')}
                      />
                      {/* WCSS dots */}
                      {[
                        [60, 52], [60+700/19*1, 85], [60+700/19*2, 105], [60+700/19*3, 125],
                        [60+700/19*4, 140], [60+700/19*5, 155], [60+700/19*6, 168],
                        [60+700/19*7, 178], [60+700/19*8, 188], [60+700/19*9, 196],
                        [60+700/19*10, 205], [60+700/19*11, 212], [60+700/19*12, 218],
                        [60+700/19*13, 226], [60+700/19*14, 235], [60+700/19*15, 243],
                        [60+700/19*16, 250], [60+700/19*17, 255], [60+700/19*18, 262],
                        [60+700/19*19, 268]
                      ].map((p, i) => (
                        <circle key={`wc-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
                      ))}
                      {/* Silhouette line (green) */}
                      <polyline
                        fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round"
                        points={[
                          [60, 280], [60+700/19*1, 125], [60+700/19*2, 110],
                          [60+700/19*3, 100], [60+700/19*4, 95], [60+700/19*5, 88],
                          [60+700/19*6, 82], [60+700/19*7, 78], [60+700/19*8, 72],
                          [60+700/19*9, 68], [60+700/19*10, 62], [60+700/19*11, 56],
                          [60+700/19*12, 50], [60+700/19*13, 48], [60+700/19*14, 50],
                          [60+700/19*15, 48], [60+700/19*16, 50], [60+700/19*17, 48],
                          [60+700/19*18, 44], [60+700/19*19, 44]
                        ].map(p => p.join(',')).join(' ')}
                      />
                      {/* Silhouette dots */}
                      {[
                        [60, 280], [60+700/19*1, 125], [60+700/19*2, 110],
                        [60+700/19*3, 100], [60+700/19*4, 95], [60+700/19*5, 88],
                        [60+700/19*6, 82], [60+700/19*7, 78], [60+700/19*8, 72],
                        [60+700/19*9, 68], [60+700/19*10, 62], [60+700/19*11, 56],
                        [60+700/19*12, 50], [60+700/19*13, 48], [60+700/19*14, 50],
                        [60+700/19*15, 48], [60+700/19*16, 50], [60+700/19*17, 48],
                        [60+700/19*18, 44], [60+700/19*19, 44]
                      ].map((p, i) => (
                        <circle key={`sl-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#16a34a" strokeWidth="2" />
                      ))}
                    </svg>
                  </div>
                </div>
              </>
            )}
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
                <div className="toolbar-search">
                  <input
                    type="text"
                    className="toolbar-search-input"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  />
                </div>
                <div className="toolbar-stats">
                  <span className="toolbar-stat-tag">{totalConvs} conversations</span>
                  <span className="toolbar-stat-tag">{totalMessages} messages</span>
                </div>
              </div>

              <div className="preview-table-wrapper cluster-table-full">
                <table className="preview-table conv-grouped">
                  <thead>
                    <tr>
                      <th className="col-conv-id">Conversation ID</th>
                      <th className="col-msg-num">#</th>
                      <th>User</th>
                      <th>Assistant</th>
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
                      <p className="cluster-recommend">Recommended K: <strong>14</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</p>
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
                      <button className="cluster-run-btn" onClick={() => setClusterRan(true)}>
                        <Sparkles size={16} />
                        Cluster
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
                            <button className="cluster-btn-noise">Remove Noise</button>
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
                              {CLUSTER_GROUPS.map((g, i) => (
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
    /* Group data with distinct colors */
    const INITIAL_GROUP_DATA = [
      { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
      { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
      { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
      { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
      { id: 5, label: 'NOISE (Outliers)', color: '#dc2626', bg: '#fef2f2' },
      { id: 6, label: 'PHYSICS', color: '#7c3aed', bg: '#f5f3ff' },
      { id: 7, label: 'CODING', color: '#2563eb', bg: '#eff6ff' },
      { id: 8, label: 'HISTORY', color: '#9333ea', bg: '#faf5ff' },
      { id: 9, label: 'MATH', color: '#ea580c', bg: '#fff7ed' },
      { id: 10, label: 'BIOLOGY', color: '#16a34a', bg: '#f0fdf4' },
      { id: 11, label: 'CODING', color: '#0284c7', bg: '#f0f9ff' },
      { id: 12, label: 'NOISE (Outliers)', color: '#e11d48', bg: '#fff1f2' },
      { id: 13, label: 'PHYSICS', color: '#4f46e5', bg: '#eef2ff' },
      { id: 14, label: 'CHEMISTRY', color: '#c026d3', bg: '#fdf4ff' },
      { id: 15, label: 'MATH', color: '#b45309', bg: '#fef3c7' },
    ];

    const GROUP_DATA = INITIAL_GROUP_DATA.map(g => ({
      ...g,
      count: stage3Convs.filter(c => c.groupId === g.id).length
    }));

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
                <button style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      <th style={{ width: '4%', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Conv ID</th>
                      <th style={{ width: '27%' }}>User</th>
                      <th style={{ width: '35%' }}>Assistant</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Subject Label</th>
                      <th style={{ width: '8%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage3PageRows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
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
                        <td className="col-conv-num-cell" style={{ verticalAlign: 'middle' }}>{(stage3Page - 1) * stage3PerPage + idx + 1}</td>
                        <td className="col-conv-id-cell">
                          <span className="conv-id-badge">{conv.id}</span>
                          <span className="conv-msg-count">{conv.messages.length} msgs</span>
                        </td>
                        <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                          <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {conv.messages.length === 1 ? (
                              /* Đơn lượt: Hiển thị câu hỏi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                <span style={{ marginRight: '6px', fontSize: '13px' }}>📌</span>
                                {highlightSearch(conv.messages[0].user, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '13px' }}>📌 Chủ đề:</span>
                                  <span style={{ fontSize: '13.5px', color: '#4f46e5' }}>
                                    {getConversationTopic(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                      <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx+1}:</span>
                                      <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                        {highlightSearch(truncateText(msg.user, 150), stage3Search)}
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
                        <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                          <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {conv.messages.length === 1 ? (
                              /* Đơn lượt: Hiển thị phản hồi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                <span style={{ marginRight: '6px', fontSize: '13px' }}>💡</span>
                                {highlightSearch(conv.messages[0].assistant, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '13px' }}>💡 Phản hồi:</span>
                                  <span style={{ fontSize: '13.5px', color: '#0891b2' }}>
                                    {getAssistantSummary(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                      <span style={{ fontWeight: '600', color: '#0ea5e9', flexShrink: 0 }}>A{idx+1}:</span>
                                      <span style={{ color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                        {highlightSearch(truncateText(msg.assistant, 150), stage3Search)}
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
                            defaultValue={conv.groupLabel}
                          >
                            <option value="MATH">MATH</option>
                            <option value="CODING">CODING</option>
                            <option value="PHYSICS">PHYSICS</option>
                            <option value="NOISE">NOISE</option>
                            <option value="HISTORY">HISTORY</option>
                            <option value="BIOLOGY">BIOLOGY</option>
                            <option value="CHEMISTRY">CHEMISTRY</option>
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
                    <select className="label-model-select" style={{ flex: 1 }}>
                      <option>Deepseek</option>
                      <option>ChatGPT</option>
                    </select>
                    <button className="label-ai-btn" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                      <Sparkles size={14} /> Label with AI
                    </button>
                  </div>
                </div>

                {/* Group Cards */}
                <div className="group-cards-container">
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
                    <div style={{ width: '24px', textAlign: 'center', marginRight: '24px' }}>Count</div>
                    <div style={{ width: '90px', textAlign: 'left', paddingLeft: '4px' }}>Label</div>
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
                        <select className="inline-label-select" onClick={e => e.stopPropagation()} defaultValue={g.label}>
                          <option>PHYSICAL</option>
                          <option>MATH</option>
                          <option>CODING</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="label-bottom-actions">
                  <button className="compare-labels-btn" onClick={() => setShowCompareLabels(true)}>
                    <FileText size={14} /> Compare Labels
                  </button>
                  <button className="save-labels-btn">
                    <Check size={14} /> Save
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
                      <div className="conv-detail-text">{msg.user}</div>
                    </div>
                    <div className="conv-detail-msg conv-detail-assistant">
                      <div className="conv-detail-role">🤖 Assistant</div>
                      <div className="conv-detail-text">{msg.assistant}</div>
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
              {['ASSIGNED','ASSIGNEES','IN PROGRESS','SUBMITTED','SAVED DECISIONS','NEEDS REVIEW','PUBLISHED'].map(label => (
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
                          <th style={{width:'5%'}}>ID</th>
                          <th style={{width:'65%'}}>SAMPLE KEY & CONTENT</th>
                          <th style={{width:'30%'}}>ASSIGNEES</th>
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

              {/* Right Sidebar */}
              <div className="sa-right">
                <div className="sa-section-card">
                  <h4 className="sa-section-title"><FileText size={14} /> Realtime Productivity</h4>
                  <div className="sa-productivity-info">
                    <span className="sa-prod-name">hoang22</span>
                    <span className="sa-prod-detail">Last active: 0 seconds ago</span>
                    <span className="sa-prod-detail">0/30 pages · 05:0h samples</span>
                    <span className="sa-prod-detail">0.00s/page (avg. 0 samples)</span>
                  </div>
                </div>

                <div className="sa-section-card sa-conflict-card">
                  <h4 className="sa-section-title sa-conflict-title">⊘ Conflict Review Queue</h4>
                  <div className="sa-conflict-item">
                    <div className="sa-conflict-left">
                      <span className="sa-conflict-id">#1 : conv-1</span>
                      <span className="sa-conflict-meta">IAA 0.11 · 3 annotators</span>
                    </div>
                    <span className="sa-pending-count">3 pending</span>
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
                      <option>Gemini</option>
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
          <button className="dataprep-btn-reset" onClick={handleRemoveFile}>
            <RotateCcw size={16} /> Reset & Upload New
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep3 < 7) {
              setCurrentSubStep3(currentSubStep3 + 1);
            } else {
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

  const renderSep490Stage4 = () => {
    const baseSubjects = sepBalanceApplied ? [
      { group: 'MATH', label: 'Math', count: 300, percentage: 42, color: '#6366f1' },
      { group: 'PHYSICAL', label: 'Physics', count: 280, percentage: 40, color: '#06b6d4' },
      { group: 'CHEMISTRY', label: 'Chemistry', count: 290, percentage: 41, color: '#10b981' },
      { group: 'BIOLOGY', label: 'Biology', count: 275, percentage: 39, color: '#f59e0b' },
      { group: 'HISTORY', label: 'History', count: 285, percentage: 40, color: '#ef4444' },
      { group: 'GEOGRAPHY', label: 'Geography', count: 270, percentage: 38, color: '#ec4899' },
      { group: 'LITERATURE', label: 'Literature', count: 295, percentage: 41, color: '#8b5cf6' },
    ] : [
      { group: 'MATH', label: 'Math', count: 450, percentage: 85, color: '#6366f1' },
      { group: 'PHYSICAL', label: 'Physics', count: 300, percentage: 70, color: '#06b6d4' },
      { group: 'CHEMISTRY', label: 'Chemistry', count: 200, percentage: 55, color: '#10b981' },
      { group: 'BIOLOGY', label: 'Biology', count: 150, percentage: 40, color: '#f59e0b' },
      { group: 'HISTORY', label: 'History', count: 100, percentage: 20, color: '#ef4444' },
      { group: 'GEOGRAPHY', label: 'Geography', count: 80, percentage: 18, color: '#ec4899' },
      { group: 'LITERATURE', label: 'Literature', count: 320, percentage: 65, color: '#8b5cf6' },
    ];

    const subjectTotal = baseSubjects.reduce((sum, item) => sum + item.count, 0);

    const subjectGroups = [
      { group: 'ALL', label: 'All', count: subjectTotal, percentage: 100, color: '#64748b' },
      ...baseSubjects
    ];

    const conversations = [
      {
        id: 'conv_428051',
        subject: 'MATH',
        messages: [
          { role: 'user', text: 'Em khong hieu dao ham cua x^2 tinh the nao a?' },
          { role: 'assistant', text: 'Dao ham cua x^2 la 2x.' },
          { role: 'user', text: 'Vi sao lai la 2x a?' },
          { role: 'assistant', text: 'Em thu nho lai cong thuc dao ham cua x^n: n*x^(n-1). Neu n = 2 thi em thay ket qua la gi?' },
        ],
      },
      {
        id: 'conv_42D67D',
        subject: 'PHYSICAL',
        messages: [
          { role: 'user', text: 'Luc ma sat la gi a?' },
          { role: 'assistant', text: 'Truoc het em thu nghi vi sao xe phanh lai dung duoc tren mat duong?' },
          { role: 'user', text: 'Co le vi banh xe bi mat duong can lai?' },
          { role: 'assistant', text: 'Dung huong roi. Luc can do chinh la luc ma sat, no xuat hien khi hai be mat tiep xuc va can tro chuyen dong.' },
        ],
      },
      {
        id: 'conv_42DE5T',
        subject: 'HISTORY',
        messages: [
          { role: 'user', text: 'Cho em dap an luon di, em dang voi.' },
          { role: 'assistant', text: 'Dap an la 1939, em ghi vao bai nhe.' },
        ],
      },
    ];

    const visibleConversations = sepSubjectFilter === 'ALL'
      ? conversations
      : conversations.filter((item) => item.subject === sepSubjectFilter);
    const activeConversation = visibleConversations[(classPage - 1) % Math.max(visibleConversations.length, 1)] || conversations[0];

    const baseQualitySamples = [
      {
        id: 'sample_428051',
        convId: 'conv_428051',
        subject: 'MATH',
        bucket: 'Rewrite',
        score: 4.3,
        issueKey: 'direct-answer',
        issue: 'Direct answer too early',
        errorMessageIndex: 1,
        reason: 'Assistant gave "2x" immediately before checking whether the learner remembered the derivative rule.',
        messages: conversations[0].messages,
      },
      {
        id: 'sample_42D67D',
        convId: 'conv_42D67D',
        subject: 'PHYSICAL',
        bucket: 'Gold',
        score: 9.1,
        issueKey: 'none',
        issue: 'No critical issue',
        errorMessageIndex: null,
        reason: 'Good Socratic framing, uses a familiar braking example before defining friction.',
        messages: conversations[1].messages,
      },
      {
        id: 'sample_42DE5T',
        convId: 'conv_42DE5T',
        subject: 'HISTORY',
        bucket: 'Reject',
        score: 2.1,
        issueKey: 'low-training-value',
        issue: 'Direct answer and low training value',
        errorMessageIndex: 1,
        reason: 'The reply gives the final answer directly and does not guide the learner.',
        messages: conversations[2].messages,
      },
    ];

    const getQualityLabel = (item) => sepQualityLabels[item.id] || (item.bucket === 'Reject' ? 'Bad' : item.bucket);
    const qualityClass = (label) => label === 'Bad' ? 'bad' : label.toLowerCase();

    const qualityDistribution = [
      { label: 'Gold', count: 8, tone: 'emerald', summary: 'Ready for training with strong Socratic guidance.' },
      { label: 'Rewrite', count: 9, tone: 'amber', summary: 'Needs tutor reply rewrite before evaluation.' },
      { label: 'Bad', count: 3, tone: 'rose', summary: 'Reject or send to supervisor because quality is too low.' },
      { label: 'Incomplete', count: 0, tone: 'slate', summary: 'Missing turns or incomplete context.' },
    ];

    const qualitySamples = Array.from({ length: 20 }, (_, idx) => {
      const source = baseQualitySamples[idx % baseQualitySamples.length];
      const cycle = Math.floor(idx / baseQualitySamples.length);
      const bucket = idx < 8 ? 'Gold' : idx < 17 ? 'Rewrite' : 'Reject';
      const issueKey = bucket === 'Gold' ? 'none' : idx % 2 === 0 ? 'direct-answer' : 'low-training-value';
      return {
        ...source,
        id: `${source.id}_${idx + 1}`,
        convId: `${source.convId}_${idx + 1}`,
        subject: baseSubjects[idx % baseSubjects.length].group,
        bucket,
        score: bucket === 'Gold' ? 8.6 + (idx % 3) * 0.2 : bucket === 'Rewrite' ? 4.1 + (idx % 5) * 0.35 : 2.0 + (idx % 3) * 0.25,
        issueKey,
        issue: bucket === 'Gold'
          ? 'No critical issue'
          : issueKey === 'direct-answer'
            ? 'Direct answer too early'
            : 'Low training value',
        errorMessageIndex: bucket === 'Gold' ? null : 1,
        reason: bucket === 'Gold'
          ? 'Good Socratic guidance and usable for training.'
          : issueKey === 'direct-answer'
            ? 'Assistant answers too directly before checking learner understanding.'
            : 'The response does not guide the learner enough for training.',
        messages: source.messages.map((msg, msgIdx) => ({
          ...msg,
          text: cycle === 0 ? msg.text : `${msg.text} (${baseSubjects[idx % baseSubjects.length].label} sample ${idx + 1}.${msgIdx + 1})`,
        })),
      };
    });

    const filteredQualitySamples = qualitySamples.filter((item) => {
      const itemLabel = getQualityLabel(item);
      const labelLower = itemLabel.toLowerCase();
      const tabLower = qualityTab.toLowerCase();
      const bucketOk = tabLower === 'all' ||
                       labelLower === tabLower ||
                       (tabLower === 'gold' && labelLower === 'good') ||
                       (tabLower === 'good' && labelLower === 'gold');
      const errorOk = !sepSelectedError || item.issueKey === sepSelectedError;
      return bucketOk && errorOk;
    });

    // subjectTotal computed earlier
    const qualityTotal = qualityDistribution.reduce((sum, item) => sum + item.count, 0);
    const selectedSubject = subjectGroups.find((item) => item.group === sepSelectedDistSubject) || subjectGroups[0];
    const selectedQuality = qualityDistribution.find((item) => item.label === sepSelectedDistQuality) || qualityDistribution[1];
    const getQualityScore = (sampleId, rubricName, defaultScore) => sepQualityRatings[`${sampleId}-${rubricName}`] ?? defaultScore;

    const rewriteRows = [
      {
        title: 'CONVERSATION 8',
        user: 'Tinh dao ham cua x^2 nhu the nao?',
        original: 'Dao ham cua x^2 la 2x.',
        ai: 'Voi ham x^n, dao ham se la n*x^(n-1). Em thu thay n = 2 vao cong thuc do xem ket qua la gi?',
        manual: 'Em con nho quy tac dao ham cua x^n khong? Neu thay n bang 2, em thu viet tung buoc xem sao.',
        intent: 'REQUEST_EXPLANATION',
        action: 'DIRECT_ANSWER',
        expected: 'SCAFFOLDING',
      },
      {
        title: 'CONVERSATION 9',
        user: 'Chien tranh the gioi thu hai bat dau nam nao?',
        original: 'Dap an la 1939.',
        ai: 'Em thu nho lai su kien Duc tan cong Ba Lan. Theo em su kien do dien ra vao nam nao?',
        manual: 'Minh cung nho lai moc su kien nhe: khi Duc tan cong Ba Lan, do la nam nao?',
        intent: 'ASK_THEORY',
        action: 'DIRECT_ANSWER',
        expected: 'HINTING',
      },
    ];
    const currentRewrite = rewriteRows[Math.max(0, rewriteConvIdx - 8) % rewriteRows.length];
    const rewriteText = sepRewriteDecision === 'manual' ? currentRewrite.manual : sepRewriteDecision === 'ai' ? currentRewrite.ai : currentRewrite.original;

    return (
      <div className="dataprep-stage2 sep490-stage">
        <div className="sub-stepper">
          {SUB_STEPS_STAGE4.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep4 ? 'active' : ''} ${step.num < currentSubStep4 ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep4(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num < currentSubStep4 ? <Check size={14} /> : step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE4.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {currentSubStep4 === 8 && (
          <div className="sep490-grid sep490-grid-2-1 sep490-classification">
            <section className="sep490-panel">
              <div className="sep490-panel-head">
                <div>
                  <h3>Converted Dataset Preview</h3>
                  <p>Conversation preview keeps the old chat-bubble style and supports multi-message dialogs.</p>
                </div>
                <span className="sep490-count">{visibleConversations.length} conversations</span>
              </div>
              <div className="sep490-toolbar">
                <button className="sep490-chip active" onClick={() => setSepSubjectFilter('ALL')}>Show all</button>
                <button className="sep490-chip" onClick={() => setClassPage((p) => (p % Math.max(visibleConversations.length, 1)) + 1)}>Next conversation</button>
                <select className="sep490-select" value={classPage} onChange={(e) => setClassPage(Number(e.target.value))}>
                  {visibleConversations.map((conv, idx) => <option key={conv.id} value={idx + 1}>{conv.id}</option>)}
                </select>
              </div>
              <div className="sep490-chat-shell">
                <div className="sep490-chat-head">
                  <span className="sep490-mono">{activeConversation.id}</span>
                  <span className="sep490-badge indigo">{activeConversation.subject}</span>
                </div>
                <div className="sep490-chat-body">
                  {activeConversation.messages.map((msg, idx) => (
                    <div key={idx} className={`sep490-chat-bubble ${msg.role}`}>
                      <span>{msg.role === 'user' ? 'USER' : 'ASSISTANT'}</span>
                      <p>{msg.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="sep490-panel sep490-side">
              <div className="sep490-panel-head compact">
                <h3>Subject Classification</h3>
                <button
                  className="sep490-primary"
                  onClick={() => {
                    setSepRunningClass(true);
                    window.setTimeout(() => setSepRunningClass(false), 700);
                  }}
                >
                  <RefreshCw size={14} className={sepRunningClass ? 'sep490-spin' : ''} />
                  Run
                </button>
              </div>
              <div className="sep490-kpi">
                <span>Total samples</span>
                <strong>129</strong>
              </div>
              <button className={`sep490-filter-row ${sepSubjectFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setSepSubjectFilter('ALL'); setClassPage(1); }}>
                <span>All samples</span>
                {sepSubjectFilter === 'ALL' && <Check size={15} />}
              </button>
              {baseSubjects.map((item) => (
                <button key={item.group} className={`sep490-filter-row ${sepSubjectFilter === item.group ? 'active' : ''}`} onClick={() => { setSepSubjectFilter(item.group); setClassPage(1); }}>
                  <span>{item.group}</span>
                  <span>{item.percentage}% <strong>{item.count}</strong>{sepSubjectFilter === item.group && <Check size={15} />}</span>
                </button>
              ))}
              <div className="sep490-note">
                <AlertCircle size={15} />
                Run subject classification before moving into quality and distribution checks.
              </div>
            </aside>
          </div>
        )}

        {currentSubStep4 === 9 && (
          <>
            <section className="sep490-hero-panel">
              <div className="sep490-icon-box"><Sparkles size={22} /></div>
              <div>
                <h3>Pedagogical Quality Management <span>Stage 4</span></h3>
                <p>Review conversation quality, resolve conflicts, and prepare samples for rewrite.</p>
              </div>
              <button
                className="sep490-primary"
                onClick={() => {
                  setSepRunningQuality(true);
                  window.setTimeout(() => setSepRunningQuality(false), 700);
                }}
              >
                <RefreshCw size={14} className={sepRunningQuality ? 'sep490-spin' : ''} />
                Run Quality Classification
              </button>
            </section>

            <div className="sep490-alert">
              <Check size={15} />
              Assignment labeling check: reviewed <strong>18</strong> / <strong>24</strong> conversations.
            </div>

            <div className="sep490-grid sep490-grid-3-1">
              <main>
                <div className="sep490-tabs">
                  {[
                    ['all', 'All', '24 HT / 96 MSG'],
                    ['gold', 'Gold', '6 HT / 24 MSG'],
                    ['rewrite', 'Needs Rewrite', '14 HT / 56 MSG'],
                    ['bad', 'Bad', '4 HT / 16 MSG'],
                  ].map(([key, label, sub]) => (
                    <button key={key} className={qualityTab === key ? 'active' : ''} onClick={() => { setQualityTab(key); setSepSelectedError(''); }}>
                      <span>{label}</span>
                      <small>{sub}</small>
                    </button>
                  ))}
                </div>

                <div className="sep490-card-grid">
                  {filteredQualitySamples.map((item) => {
                    const itemLabel = getQualityLabel(item);
                    return (
                      <button
                        key={item.id}
                        className={`sep490-quality-card ${qualityClass(itemLabel)}`}
                        onClick={() => setSepQualityModal(item)}
                      >
                        <div className="sep490-card-top">
                          <span className="sep490-mono">{item.id}</span>
                          <span className={`sep490-badge ${itemLabel === 'Gold' ? 'emerald' : itemLabel === 'Bad' ? 'rose' : itemLabel === 'Incomplete' ? 'slate' : 'amber'}`}>{itemLabel}</span>
                        </div>
                        <h4>{item.subject}</h4>
                        <p>{item.issue}</p>
                        <div className="sep490-card-meta">
                          <span>{item.messages.length} messages</span>
                          <strong>Score {item.score.toFixed(1)}</strong>
                        </div>
                        <span className="sep490-open-review">Open review</span>
                      </button>
                    );
                  })}
                </div>
              </main>

              <aside className="sep490-stack">
                <div className="sep490-panel">
                  <div className="sep490-panel-head compact">
                    <h3>Review Progress</h3>
                    <span>18 / 24</span>
                  </div>
                  <div className="sep490-progress"><span style={{ width: '75%' }} /></div>
                  <p className="sep490-muted">75% of conversations have supervisor-ready quality labels.</p>
                </div>
                <div className="sep490-panel danger">
                  <h3>Error Pattern</h3>
                  {[
                    ['direct-answer', 'Student asks theory -> AI gives direct answer', '68%'],
                    ['low-training-value', 'Low training value or reject-level answer', '32%'],
                  ].map(([key, label, width]) => (
                    <button key={key} className={`sep490-error-row ${sepSelectedError === key ? 'active' : ''}`} onClick={() => setSepSelectedError((prev) => prev === key ? '' : key)}>
                      <span>{label}</span>
                      <div className="sep490-progress rose"><span style={{ width }} /></div>
                    </button>
                  ))}
                </div>
                <div className="sep490-panel">
                  <h3>Adjudication Guide</h3>
                  <p className="sep490-muted">Expanded cards show exactly which message failed and why, matching the old project review flow.</p>
                </div>
              </aside>
            </div>
          </>
        )}

        {currentSubStep4 === 10 && (
          <div className="s4-distribution sep490-distribution-old">
            <div className="s4-dist-header">
              <div>
                <h3>Dataset Distribution</h3>
                <p>Overview of subject distribution and data quality metrics.</p>
              </div>
              <div className="s4-dist-actions" style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={`s4-btn-outline ${sepBalanceApplied ? 'active' : ''}`}
                  onClick={() => setSepBalanceApplied(!sepBalanceApplied)}
                  style={{
                    borderColor: sepBalanceApplied ? '#10b981' : '#e2e8f0',
                    color: sepBalanceApplied ? '#10b981' : '#334155',
                    background: sepBalanceApplied ? '#f0fdf4' : '#ffffff',
                  }}
                >
                  <Sparkles size={14} />
                  {sepBalanceApplied ? 'Balanced' : 'Balance Dataset'}
                </button>
                <button className="s4-btn-primary"><Download size={14} /> Export report</button>
              </div>
            </div>

            <div className="s4-dist-stats">
              <div className="s4-stat-card">
                <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-blue">#</span><span className="s4-stat-change s4-change-up">+12%</span></div>
                <div className="s4-stat-value">{subjectTotal}</div>
                <div className="s4-stat-label">TOTAL SAMPLES</div>
              </div>
              <div className="s4-stat-card">
                <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-purple">S</span><span className="s4-stat-badge">stable</span></div>
                <div className="s4-stat-value">{subjectGroups.length - 1}</div>
                <div className="s4-stat-label">SUBJECTS</div>
              </div>
              <div className="s4-stat-card">
                <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-green">✓</span><span className="s4-stat-change s4-change-up">+2.4%</span></div>
                <div className="s4-stat-value">{qualityTotal}</div>
                <div className="s4-stat-label">QUALITY LABELED</div>
              </div>
              <div className="s4-stat-card">
                <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-red">!</span><span className="s4-stat-change s4-change-down">-0.5%</span></div>
                <div className="s4-stat-value">{selectedQuality.count}</div>
                <div className="s4-stat-label">{selectedQuality.label.toUpperCase()}</div>
              </div>
            </div>

            <div className="s4-dist-charts">
              <div className="s4-chart-card">
                <h4><BarChart2 size={16} /> SUBJECT DISTRIBUTION</h4>
                <div className="s4-bar-chart">
                  {subjectGroups.map((item) => (
                    <button
                      key={item.group}
                      className={`s4-bar-row s4-bar-row-click ${sepSelectedDistSubject === item.group ? 'active' : ''}`}
                      onClick={() => {
                        setSepSelectedDistSubject(item.group);
                        setSepSubjectFilter(item.group);
                      }}
                    >
                      <span className="s4-bar-label">{item.label}</span>
                      <div className="s4-bar-track">
                        <div className="s4-bar-fill-dist" style={{ width: `${item.percentage}%`, background: item.color }} />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="s4-chart-selected">
                  Selected: <strong>{selectedSubject.label}</strong> - {selectedSubject.count} samples ({selectedSubject.percentage}%)
                </div>
              </div>

              <div className="s4-chart-card">
                <h4>⏳ QUALITY CLASSIFICATION</h4>
                <div className="s4-donut-container">
                  <div className="s4-donut-wrapper" style={{ position: 'relative', width: '230px', height: '230px', flexShrink: 0 }}>
                    <svg viewBox="0 0 200 200" className="s4-donut-svg" style={{ width: '100%', height: '100%' }}>
                      <circle cx="100" cy="100" r="70" fill="none" stroke="#f1f5f9" strokeWidth="28" />
                      <circle cx="100" cy="100" r="70" fill="none" stroke="#10b981" strokeWidth="28" strokeDasharray="175.93 263.89" strokeDashoffset="0" transform="rotate(-90 100 100)" strokeLinecap="round" />
                      <circle cx="100" cy="100" r="70" fill="none" stroke="#f59e0b" strokeWidth="28" strokeDasharray="197.92 241.90" strokeDashoffset="-175.93" transform="rotate(-90 100 100)" />
                      <circle cx="100" cy="100" r="70" fill="none" stroke="#ef4444" strokeWidth="28" strokeDasharray="65.97 373.85" strokeDashoffset="-373.85" transform="rotate(-90 100 100)" />
                    </svg>
                    <div className="s4-donut-center" style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <strong style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', lineHeight: '1.1' }}>{qualityTotal}</strong>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</span>
                    </div>
                  </div>
                  <div className="s4-donut-legend">
                    {qualityDistribution.slice(0, 3).map(({ label, count, tone }) => (
                      <button
                        key={label}
                        className={`s4-legend-item s4-legend-click ${sepSelectedDistQuality === label ? 'active' : ''}`}
                        onClick={() => {
                          setSepSelectedDistQuality(label);
                          setQualityTab(label.toLowerCase());
                        }}
                        style={sepSelectedDistQuality === label ? (
                          label === 'Gold' ? { borderColor: '#bbf7d0', background: '#f0fdf4' } :
                          label === 'Rewrite' ? { borderColor: '#fde68a', background: '#fffbeb' } :
                          { borderColor: '#fecaca', background: '#fef2f2' }
                        ) : {}}
                      >
                        <span className="s4-legend-dot" style={{ background: tone === 'emerald' ? '#10b981' : tone === 'amber' ? '#f59e0b' : '#ef4444' }} />
                        <span>{label === 'Gold' ? 'Gold (Excellent)' : label === 'Rewrite' ? 'Needs Rewrite' : 'Bad (Reject)'}</span>
                        <strong>{Math.round((count / qualityTotal) * 100)}%</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
        {currentSubStep4 === 11 && (
          <div className="sep490-rewrite">
            <section className="sep490-panel sep490-rewrite-header">
              <div className="sep490-panel-head">
                <div>
                  <h3>Rewrite Workspace</h3>
                  <p>Review the flagged tutor turn, compare suggestions, and choose the final training response.</p>
                </div>
                <div className="sep490-actions">
                  <select className="sep490-select" defaultValue="gemini">
                    <option value="gemini">AI Judge: GEMINI</option>
                    <option value="openai">AI Judge: OPENAI</option>
                    <option value="deepseek">AI Judge: DEEPSEEK</option>
                  </select>
                  <button className="sep490-outline" onClick={() => { setSepRewriteGenerated(true); setSepRewriteDecision('ai'); }}><Sparkles size={14} /> AI fix all</button>
                  <button className="sep490-outline" onClick={() => setSepRewriteDecision('ai')}><Check size={14} /> Quick approve all</button>
                  <button className="sep490-primary" onClick={() => setSepRewriteDecision('ai')}><Check size={14} /> Save rewrite</button>
                </div>
              </div>
              <div className="sep490-metric-grid">
                <div><span>Need Rewrite</span><strong>10</strong></div>
                <div><span>AI Suggestions</span><strong>{sepRewriteGenerated ? 11 : 7}</strong></div>
                <div><span>AI Accepted</span><strong>{sepRewriteDecision === 'ai' ? 5 : 4}</strong></div>
                <div><span>Manual Edited</span><strong>2</strong></div>
                <div><span>Original Kept</span><strong>1</strong></div>
              </div>
            </section>

            <div className="sep490-rewrite-workspace">
              <aside className="sep490-panel sep490-rewrite-queue">
                <div className="sep490-panel-head compact">
                  <h3>Rewrite Queue</h3>
                  <span className="sep490-pill amber">10 pending</span>
                </div>
                {rewriteRows.map((row, idx) => {
                  const convNumber = idx + 8;
                  return (
                    <button
                      key={row.title}
                      className={rewriteConvIdx === convNumber ? 'active' : ''}
                      onClick={() => setRewriteConvIdx(convNumber)}
                    >
                      <span>{row.title}</span>
                      <strong>{row.intent}</strong>
                      <small>{row.action} {'->'} {row.expected}</small>
                    </button>
                  );
                })}
                <div className="sep490-nav-pair">
                  <button onClick={() => setRewriteConvIdx(Math.max(8, rewriteConvIdx - 1))}><ChevronLeft size={14} /> Previous</button>
                  <button onClick={() => setRewriteConvIdx(Math.min(9, rewriteConvIdx + 1))}>Next <ChevronRight size={14} /></button>
                </div>
              </aside>

              <main className="rw-content sep490-rw-full">
                <div className="rw-turn-card rw-turn-rewrite">
                  <div className="rw-turn-header">
                    <span className="rw-turn-title">Turn #1 needs edit</span>
                    <span className="rw-turn-badge-required">REWRITE REQUIRED</span>
                  </div>
                  <div className="rw-turn-tags">
                    <span className="rw-tag rw-tag-blue">INTENT: {currentRewrite.intent}</span>
                    <span className="rw-tag rw-tag-green">ACTION: {currentRewrite.action}</span>
                    <span className="rw-tag rw-tag-purple">EXPECTED: {currentRewrite.expected}</span>
                  </div>

                  <div className="rw-turn-columns">
                    <div className="rw-col">
                      <span className="rw-col-title">STUDENT (USER)</span>
                      <div className="rw-col-box">{currentRewrite.user}</div>
                    </div>
                    <div className="rw-col">
                      <span className="rw-col-title">ORIGINAL ANSWER</span>
                      <div className="rw-col-box">{currentRewrite.original}</div>
                    </div>
                    <div className="rw-col rw-col-edit">
                      <div className="rw-col-title-row">
                        <span className="rw-col-title">REWRITE</span>
                        <div className="rw-edit-tabs">
                          {[
                            ['original', 'Original'],
                            ['ai', 'AI'],
                            ['manual', 'Manual'],
                          ].map(([tab, label]) => (
                            <button key={tab} className={`rw-edit-tab ${sepRewriteDecision === tab ? 'active' : ''}`} onClick={() => setSepRewriteDecision(tab)}>{label}</button>
                          ))}
                        </div>
                      </div>
                      {sepRewriteDecision === 'manual' ? (
                        <textarea defaultValue={currentRewrite.manual} className="rw-col-box rw-col-editable sep490-textarea" />
                      ) : (
                        <div className="rw-col-box rw-col-editable">
                          <p>{rewriteText}</p>
                          <p className="rw-hint-text">{sepRewriteDecision === 'ai' ? 'AI suggestion is selected.' : 'Original answer is selected.'}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <button className="rw-suggest-btn" onClick={() => { setSepRewriteGenerated(true); setSepRewriteDecision('ai'); }}><Sparkles size={14} /> Generate AI suggestion for this turn</button>
                </div>

                <div className="rw-turn-card rw-turn-context">
                  <div className="rw-turn-header">
                    <span className="rw-turn-title">Turn #2 (context only)</span>
                    <span className="rw-turn-badge-ok">VALID - NO EDIT</span>
                  </div>
                  <div className="rw-turn-columns rw-turn-cols-2">
                    <div className="rw-col">
                      <span className="rw-col-title">STUDENT</span>
                      <div className="rw-col-box">Hinh nhu nam 1939 a.</div>
                    </div>
                    <div className="rw-col">
                      <span className="rw-col-title">AI TUTOR</span>
                      <div className="rw-col-box">Chinh xac. Su kien do thuong duoc xem la moc khoi dau cua cuoc chien.</div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        )}

        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep4 > 8) setCurrentSubStep4(currentSubStep4 - 1);
            else setCurrentStage(3);
          }}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep4 < 11) setCurrentSubStep4(currentSubStep4 + 1);
            else setCurrentStage(5);
          }}>
            Next
          </button>
        </div>

        {sepQualityModal && (
          <div className="compare-modal-overlay" onClick={() => setSepQualityModal(null)}>
            <div className="sep490-modal sep490-quality-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sep490-modal-head">
                <div>
                  <h3>Quality Review & Pedagogy Finalization</h3>
                  <p>{sepQualityModal.id} - {sepQualityModal.subject} - score {sepQualityModal.score.toFixed(1)}</p>
                </div>
                <button className="compare-close-btn" onClick={() => setSepQualityModal(null)}><X size={14} /> Close</button>
              </div>

              <div className="sep490-quality-modal-body">
                <section className="sep490-modal-thread">
                  <div className="sep490-review-section-title">Conversation thread</div>
                  {sepQualityModal.errorMessageIndex !== null && (
                    <div className="sep490-error-banner">
                      <AlertCircle size={16} />
                      <div>
                        <strong>Error detected at Turn #{sepQualityModal.errorMessageIndex + 1}</strong>
                        <span>{sepQualityModal.reason}</span>
                      </div>
                    </div>
                  )}
                  {sepQualityModal.messages.map((msg, idx) => (
                    <div key={idx} className={`sep490-review-bubble ${msg.role} ${idx === sepQualityModal.errorMessageIndex ? 'error' : ''}`}>
                      <div>
                        <span>{msg.role === 'user' ? 'Câu hỏi - Học sinh' : 'Câu trả lời - AI Tutor'}</span>
                        <em>#Turn {idx + 1}</em>
                      </div>
                      <div className="sep490-message-tags">
                        <b>{msg.role === 'user' ? 'QUESTION' : 'ANSWER'}</b>
                        <b>{sepQualityModal.subject}</b>
                        {idx === sepQualityModal.errorMessageIndex && <b className="danger">ERROR</b>}
                      </div>
                      <p>{msg.text}</p>
                      {idx === sepQualityModal.errorMessageIndex && <small>{sepQualityModal.reason}</small>}
                    </div>
                  ))}
                </section>

                <aside className="sep490-modal-score">
                  <div className="sep490-quality-classifier">
                    <strong>Phân loại chất lượng hội thoại</strong>
                    <div>
                      {['Gold', 'Rewrite', 'Bad', 'Incomplete'].map((label) => {
                        const active = getQualityLabel(sepQualityModal) === label;
                        return (
                          <button
                            key={label}
                            className={`${qualityClass(label)} ${active ? 'active' : ''}`}
                            onClick={() => setSepQualityLabels((prev) => ({ ...prev, [sepQualityModal.id]: label }))}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sep490-rubric-grid">
                    {[
                      ['Factuality', sepQualityModal.bucket === 'Reject' ? 2 : 5, 'Correct knowledge, no hallucination.'],
                      ['Socratic method', sepQualityModal.bucket === 'Gold' ? 5 : 2, 'Guides learner instead of answering too soon.'],
                      ['Encouragement', sepQualityModal.bucket === 'Reject' ? 2 : 5, 'Patient and motivating tone.'],
                      ['Vietnamese quality', 5, 'Natural wording and clean grammar.'],
                      ['Completeness', sepQualityModal.bucket === 'Reject' ? 2 : 4, 'No broken or missing context.'],
                      ['Training readiness', Math.max(1, Math.round(sepQualityModal.score / 2)), 'Ready to use for fine-tuning.'],
                    ].map(([name, defaultScore, desc]) => {
                      const score = getQualityScore(sepQualityModal.id, name, defaultScore);
                      return (
                        <div key={name} className="sep490-rubric-card">
                          <div><strong>{name}</strong><span>{score}/5</span></div>
                          <div className="sep490-star-buttons" aria-label={`${score} out of 5`}>
                            {Array.from({ length: 5 }, (_, starIndex) => (
                              <button
                                key={starIndex}
                                className={starIndex < score ? 'filled' : ''}
                                onClick={() => setSepQualityRatings((prev) => ({ ...prev, [`${sepQualityModal.id}-${name}`]: starIndex + 1 }))}
                              >
                                {'★'}
                              </button>
                            ))}
                          </div>
                          <small>{desc}</small>
                        </div>
                      );
                    })}
                  </div>

                  <div className="sep490-alert amber">
                    <FileText size={15} />
                    <span>{sepQualityModal.reason}</span>
                  </div>

                  <div className="sep490-review-checks">
                    <strong>Detected issues</strong>
                    {['Wrong fact', 'Direct answer too early', 'Needs supervisor review', 'Vietnamese wording issue'].map((label) => (
                      <label key={label}>
                        <input type="checkbox" defaultChecked={sepQualityModal.bucket !== 'Gold' && label !== 'Wrong fact'} />
                        {label}
                      </label>
                    ))}
                  </div>

                  <label className="sep490-review-note">
                    Detailed note
                    <textarea defaultValue={sepQualityModal.reason} />
                  </label>

                  <div className="sep490-actions end">
                    <button className="sep490-outline" onClick={() => { setSepQualityModal(null); setCurrentSubStep4(11); }}>Mark Rewrite</button>
                    <button className="sep490-primary" onClick={() => setSepQualityModal(null)}>Save quality decision</button>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSep490Stage5 = () => {
    const evalItems = [
      {
        id: 'eval_428051',
        subject: 'MATH',
        score: 4.3,
        recommendation: 'Reject',
        conflict: true,
        messages: [
          ['Student', 'Em khong hieu dao ham cua x^2 tinh the nao a?'],
          ['AI Tutor', 'Hay nho quy tac dao ham cua x^n va thu ap dung voi n = 2.'],
          ['Student', 'Hinh nhu la n*x^(n-1) a?'],
        ],
        models: [
          { name: 'GEMINI', rec: 'Reject', score: 4.0, color: 'rose' },
          { name: 'DEEPSEEK', rec: 'Pass', score: 7.8, color: 'emerald' },
          { name: 'OPENAI', rec: 'Need Rewrite', score: 6.2, color: 'amber' },
        ],
      },
      {
        id: 'eval_42D67D',
        subject: 'PHYSICAL',
        score: 8.7,
        recommendation: 'Pass',
        conflict: false,
        messages: [
          ['Student', 'Luc ma sat la gi a?'],
          ['AI Tutor', 'Em thu nghi xem vi sao xe phanh lai dung duoc tren mat duong?'],
        ],
        models: [
          { name: 'GEMINI', rec: 'Pass', score: 8.8, color: 'emerald' },
          { name: 'DEEPSEEK', rec: 'Pass', score: 8.4, color: 'emerald' },
        ],
      },
    ];

    const visibleEvalItems = evalItems.filter((item) => {
      const matchesRec = sepEvalRecommendation === 'all' || item.recommendation === sepEvalRecommendation;
      const matchesConflict = !sepEvalConflictOnly || item.conflict;
      const matchesScore = item.score >= Number(sepEvalMinScore || 0);
      return matchesRec && matchesConflict && matchesScore;
    });

    return (
      <div className="dataprep-stage2 sep490-stage">
        <div className="sep490-grid sep490-grid-1-2">
          <section className="sep490-panel">
            <div className="sep490-panel-head compact">
              <h3>AI Judge Setup</h3>
              <span className="sep490-pill indigo">1-3 models</span>
            </div>
            <div className="sep490-check-list">
              {[
                ['gemini', 'Gemini (Flash 1.5)', 'Default education judge'],
                ['openai', 'OpenAI (GPT-4o)', 'High precision verification'],
                ['deepseek', 'Deepseek (R1/V3)', 'Advanced logic judge'],
              ].map(([key, label, desc]) => (
                <label key={key} className={judgeModels[key] ? 'active' : ''}>
                  <input
                    type="checkbox"
                    checked={judgeModels[key]}
                    onChange={() => setJudgeModels((prev) => ({ ...prev, [key]: !prev[key] }))}
                  />
                  <span><strong>{label}</strong><small>{desc}</small></span>
                </label>
              ))}
            </div>
            <label className="sep490-field">
              Context window
              <select className="sep490-select">
                <option>n - 2 to n + 2 (recommended)</option>
                <option>n - 1 to n + 1</option>
                <option>Whole conversation</option>
              </select>
            </label>
            <button
              className="sep490-primary full"
              onClick={() => {
                setSepRunningEval(true);
                window.setTimeout(() => setSepRunningEval(false), 900);
              }}
            >
              <Sparkles size={14} className={sepRunningEval ? 'sep490-spin' : ''} />
              Start AI verification & refinement
            </button>
          </section>

          <section className="sep490-panel">
            <div className="sep490-panel-head compact">
              <h3>Verification Status</h3>
              <span className="sep490-pill emerald">{sepRunningEval ? 'RUNNING' : 'COMPLETE'}</span>
            </div>
            <div className="sep490-progress large"><span style={{ width: sepRunningEval ? '62%' : '100%' }} /></div>
            <div className="sep490-status-grid">
              <div><span>Evaluated</span><strong>{sepRunningEval ? 6 : 9}</strong></div>
              <div><span>Processing</span><strong>{sepRunningEval ? 3 : 0}</strong></div>
              <div><span>Auto refined</span><strong>2</strong></div>
              <div><span>API errors</span><strong>0</strong></div>
              <div><span>Conflicts</span><strong className="amber">1</strong></div>
            </div>
          </section>
        </div>

        <div className="sep490-filterbar">
          <span><Sparkles size={14} /> Auto filter</span>
          <label>Recommendation
            <select value={sepEvalRecommendation} onChange={(e) => setSepEvalRecommendation(e.target.value)}>
              <option value="all">All</option>
              <option value="Pass">Pass</option>
              <option value="Need Rewrite">Need Rewrite</option>
              <option value="Reject">Reject</option>
            </select>
          </label>
          <label>Min score
            <input type="number" min="0" max="10" step="0.5" value={sepEvalMinScore} onChange={(e) => setSepEvalMinScore(parseFloat(e.target.value) || 0)} />
          </label>
          <label className="sep490-inline-check">
            <input type="checkbox" checked={sepEvalConflictOnly} onChange={() => setSepEvalConflictOnly(!sepEvalConflictOnly)} />
            Conflict only
          </label>
          <button className="sep490-outline"><RefreshCw size={14} /> Refresh</button>
        </div>

        <div className="sep490-stack">
          {visibleEvalItems.length === 0 ? (
            <div className="sep490-empty">No evaluation result matches this filter.</div>
          ) : visibleEvalItems.map((item) => (
            <section key={item.id} className="sep490-eval-card">
              <div className="sep490-eval-head" onClick={() => setEvalExpanded(evalExpanded === item.id ? "" : item.id)}>
                <div>
                  <span className={`sep490-score ${item.score >= 8 ? 'emerald' : item.score >= 6 ? 'amber' : 'rose'}`}>{item.score.toFixed(1)} / 10</span>
                  {item.conflict && <span className="sep490-badge rose">Conflict</span>}
                  <strong>{item.subject} - sample #{item.id.slice(-6).toUpperCase()}</strong>
                </div>
                <div>
                  <span className={`sep490-badge ${item.recommendation === 'Pass' ? 'emerald' : item.recommendation === 'Reject' ? 'rose' : 'amber'}`}>Suggest: {item.recommendation}</span>
                  <ChevronDown size={16} style={{ transform: evalExpanded === item.id ? 'rotate(180deg)' : 'none' }} />
                </div>
              </div>
              {evalExpanded === item.id && (
                <div className="sep490-eval-body">
                  <div className="sep490-context">
                    <div className="sep490-context-head">
                      <span>Conversation context</span>
                      <button>Score history</button>
                    </div>
                    {item.messages.map(([role, content], idx) => (
                      <p key={idx} className={idx === 1 ? 'target' : ''}><strong>{role}:</strong> {content}{idx === 1 && <span>TARGET</span>}</p>
                    ))}
                  </div>

                  <div className="sep490-model-grid">
                    {item.models.map((model) => (
                      <div key={model.name} className={`sep490-model-card ${model.color}`}>
                        <div><strong>{model.name}</strong><span>{model.rec} ({model.score.toFixed(1)})</span></div>
                        <dl>
                          <dt>Factuality</dt><dd>{Math.min(10, model.score + 0.8).toFixed(1)}/10</dd>
                          <dt>Socratic</dt><dd>{Math.max(0, model.score - 0.6).toFixed(1)}/10</dd>
                          <dt>Vietnamese quality</dt><dd>{Math.min(10, model.score + 1).toFixed(1)}/10</dd>
                          <dt>Training readiness</dt><dd>{model.score.toFixed(1)}/10</dd>
                        </dl>
                        <p>The response is checked for correctness, Socratic guidance, context fit, and training readiness.</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => setCurrentStage(4)}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => setCurrentStage(6)}>
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderStage6 = () => {
    const livePreviewJSON = {
      messages: [
        { role: 'system', content: promptText || '[No system prompt yet]' },
        { role: 'user', content: sampleQuestion },
        { role: 'assistant', content: '"Chào bạn, phương trình này có thể giải bằng cách nhân nghiệm theo hệ thức Vi et: x1 + x2 = 5 và x1 * x2 = 6. Vậy nghiệm là x = 2 và x = 3. Có điều gì mà bạn muốn thảo luận thêm về cách giải này?"' }
      ]
    };

    return (
      <div className="dataprep-stage2">
        {/* Sub-stepper */}
        <div className="sub-stepper">
          {SUB_STEPS_STAGE6.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep6 ? 'active' : ''} ${step.num < currentSubStep6 ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep6(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num < currentSubStep6 ? <Check size={14} /> : step.num}
                </div>
                <div className="sub-step-label" style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE6.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {/* Sub-step 13: System Prompt */}
        {currentSubStep6 === 13 && (
          <div className="s6-prompt">
            <div className="s6-prompt-title">
              <h3>System Prompt Versioning</h3>
              <p>Manage prompt history, compare versions, and test with trial run before saving.</p>
            </div>

            {/* Two-column: History + Editor */}
            <div className="s6-prompt-layout">
              {/* Left: History */}
              <div className="s6-history-card">
                <div className="s6-history-header">
                  <h4>History</h4>
                  <div className="s6-history-actions">
                    <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Compare Mode</button>
                    <span className="s6-version-count">{PROMPT_VERSIONS.length} versions</span>
                  </div>
                </div>

                <input className="s6-search-input" placeholder="Search by description or version" />

                <div className="s6-version-list">
                  {PROMPT_VERSIONS.map(v => (
                    <div
                      key={v.id}
                      className={`s6-version-item ${selectedVersion?.id === v.id ? 's6-version-selected' : ''}`}
                      onClick={() => setSelectedVersion(v)}
                    >
                      <div className="s6-version-item-left">
                        <span className="s6-version-name">{v.name}</span>
                        <span className="s6-version-desc">{v.desc}</span>
                      </div>
                      <span className="s6-version-date">{v.date}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Viewer + Editor */}
              <div className="s6-editor-col">
                {/* Selected Version (Read-only) */}
                <div className="s6-viewer-card">
                  <h4>Selected Version (Read-only)</h4>
                  <textarea
                    className="s6-viewer-textarea"
                    readOnly
                    value={selectedVersion ? selectedVersion.content : ''}
                    placeholder="Select a version from History to inspect its content."
                  />
                </div>

                {/* Editor */}
                <div className="s6-editor-card">
                  <h4>Editor - Current Prompt</h4>
                  <label className="s6-field-label">Current Prompt</label>
                  <textarea
                    className="s6-editor-textarea"
                    placeholder="Write your current system prompt here..."
                    value={promptText}
                    onChange={e => setPromptText(e.target.value)}
                  />

                  <label className="s6-field-label">Prompt Name (Unique)</label>
                  <input
                    className="s6-field-input"
                    value={promptName}
                    onChange={e => setPromptName(e.target.value)}
                  />

                  <label className="s6-field-label">Description</label>
                  <input
                    className="s6-field-input"
                    value={promptDesc}
                    onChange={e => setPromptDesc(e.target.value)}
                  />

                  <span className="s6-library-source">Library Source: {promptName}</span>

                  <button className="s6-save-btn">Save as New Version</button>
                </div>
              </div>
            </div>

            {/* Trial Run */}
            <div className="s6-trial-card">
              <div className="s6-trial-header">
                <div>
                  <h4>Trial Run</h4>
                  <p>Test your current prompt with a sample question before saving.</p>
                </div>
                <button className="s6-trial-btn"><Sparkles size={14} /> Run Trial</button>
              </div>
              <div className="s6-trial-body">
                <div className="s6-trial-col">
                  <label className="s6-field-label">Sample Question</label>
                  <textarea
                    className="s6-trial-textarea"
                    value={sampleQuestion}
                    onChange={e => setSampleQuestion(e.target.value)}
                  />
                </div>
                <div className="s6-trial-col">
                  <label className="s6-field-label">Generated Response</label>
                  <textarea
                    className="s6-trial-textarea s6-trial-response"
                    readOnly
                    value={trialResponse}
                    placeholder="Click 'Run Trial' to generate a response..."
                  />
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="s6-preview-card">
              <div className="s6-preview-header">
                <div>
                  <h4>Live Preview</h4>
                  <p>Preview of the first sample after inserting system prompt.</p>
                </div>
                <span className="s6-source-badge">Source: Editor</span>
              </div>
              <pre className="s6-json-preview">
                {JSON.stringify(livePreviewJSON, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Sub-step 14: Split Guard */}
        {currentSubStep6 === 14 && (
          <div className="sg-container">
            {/* Header */}
            <div className="sg-header">
              <div>
                <h3>Split Guard</h3>
                <p>Generate a train/test split with semantic conflict checking handled by the GPU service.</p>
              </div>
              <button className="s6-trial-btn"><Sparkles size={14} /> Generate safe split</button>
            </div>

            {/* Config Cards */}
            <div className="sg-config-row">
              <div className="sg-config-card">
                <span className="sg-config-label">TOTAL SAMPLES</span>
                <span className="sg-config-value">72</span>
              </div>
              <div className="sg-config-card">
                <div className="sg-config-label-row">
                  <span className="sg-config-label">TEST PERCENTAGE</span>
                  <span className="sg-config-pct">50%</span>
                </div>
                <input type="range" min="10" max="90" defaultValue={50} className="sg-slider sg-slider-purple" />
              </div>
              <div className="sg-config-card">
                <div className="sg-config-label-row">
                  <span className="sg-config-label">SEMANTIC THRESHOLD</span>
                  <span className="sg-config-pct">1.000</span>
                </div>
                <input type="range" min="0" max="100" defaultValue={100} className="sg-slider sg-slider-purple" />
              </div>
            </div>

            {/* Max Attempts */}
            <div className="sg-attempts-card">
              <span className="sg-config-label">MAX ATTEMPTS</span>
              <p className="sg-attempts-desc">The GPU service will reshuffle until the split is clean or this limit is reached.</p>
              <input type="number" defaultValue={20} className="sg-attempts-input" />
            </div>

            {/* Split Generated Result */}
            <div className="sg-result-card">
              <div className="sg-result-title"><Check size={16} /> Split Generated</div>
              <div className="sg-result-stats">
                <div className="sg-result-stat">
                  <span className="sg-result-label">TRAIN</span>
                  <span className="sg-result-value">36</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">TEST</span>
                  <span className="sg-result-value">36</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">ATTEMPTS</span>
                  <span className="sg-result-value">1</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">CONFLICTS</span>
                  <span className="sg-result-value sg-value-red">4</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">MAX SIMILARITY</span>
                  <span className="sg-result-value">0.96</span>
                </div>
              </div>
            </div>

            {/* Venn Diagram */}
            <div className="sg-venn-card">
              <h4>Semantic Overlap Visualization</h4>
              <p className="sg-venn-sub">Visual representation of semantic similarity between <span style={{ color: '#7c3aed' }}>Train</span> and <span style={{ color: '#3b82f6' }}>Test</span> sets.</p>
              <div className="sg-venn-wrap">
                <svg viewBox="0 0 400 220" className="sg-venn-svg">
                  {/* Train circle */}
                  <circle cx="155" cy="110" r="80" fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth="2" />
                  {/* Test circle */}
                  <circle cx="245" cy="110" r="80" fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2" />
                  {/* Overlap area - dashed */}
                  <ellipse cx="200" cy="110" rx="35" ry="55" fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                  {/* Labels */}
                  <text x="115" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#7c3aed">TRAIN</text>
                  <text x="115" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#7c3aed">32 unique</text>
                  <text x="285" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#3b82f6">TEST</text>
                  <text x="285" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#3b82f6">32 unique</text>
                  <text x="200" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#ef4444">OVERLAP</text>
                  <text x="200" y="120" textAnchor="middle" className="sg-venn-text-sub" fill="#ef4444">4 conflicts</text>
                </svg>
              </div>

              {/* Summary Cards */}
              <div className="sg-summary-row">
                <div className="sg-summary-card sg-summary-train">
                  <span className="sg-summary-value">32</span>
                  <span className="sg-summary-label">Train Only</span>
                </div>
                <div className="sg-summary-card sg-summary-conflict">
                  <span className="sg-summary-value">4</span>
                  <span className="sg-summary-label">Semantic Conflicts</span>
                </div>
                <div className="sg-summary-card sg-summary-test">
                  <span className="sg-summary-value">32</span>
                  <span className="sg-summary-label">Test Only</span>
                </div>
              </div>
            </div>

            {/* Manual Exclusion Tool */}
            <div className="sg-exclusion-card">
              <div className="sg-exclusion-header">
                <div>
                  <h4>Manual Exclusion Tool</h4>
                  <p>Select samples below to exclude them from the dataset and resolve conflicts.</p>
                </div>
                <span className="sg-excluded-count">0 excluded</span>
              </div>
              <div className="sg-conflict-list">
                {[
                  { text: 'Giải phương trình bậc hai x² - 5x + 6 = 0', sim: 0.92 },
                  { text: 'Tìm nghiệm của phương trình x² + 3x - 4 = 0', sim: 0.87 },
                  { text: 'Phương trình bậc hai có delta âm thì có mấy nghiệm?', sim: 0.95 },
                  { text: 'Công thức Vi-et dùng để làm gì?', sim: 0.89 },
                ].map((item, idx) => (
                  <div key={idx} className="sg-conflict-item">
                    <div className="sg-conflict-left">
                      <X size={14} className="sg-conflict-x" />
                      <div>
                        <span className="sg-conflict-text">{item.text}</span>
                        <div className="sg-conflict-meta">
                          <span className="sg-dot sg-dot-train"></span> In Train
                          <span className="sg-dot sg-dot-test"></span> In Test
                          <span className="sg-conflict-sim">Similarity: <strong style={{ color: '#dc2626' }}>{item.sim}</strong></span>
                        </div>
                      </div>
                    </div>
                    <button className="sg-exclude-btn">Click to exclude</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sub-step 15: Export */}
        {currentSubStep6 === 15 && (
          <div className="ex-container">
            {/* Dataset Preview */}
            <div className="ex-preview-card">
              <div className="ex-preview-header">
                <div>
                  <h3>Converted Dataset Preview</h3>
                  <p>Showing 1-5 of 72 records</p>
                </div>
                <div className="ex-preview-controls">
                  <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Show All</button>
                  <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Increase Limit (5)</button>
                  <select className="s5-filter-select">
                    <option>5 / page</option>
                    <option>10 / page</option>
                    <option>20 / page</option>
                  </select>
                </div>
              </div>

              <table className="ex-table">
                <thead>
                  <tr>
                    <th>System</th>
                    <th>User</th>
                    <th>Assistant</th>
                    <th>overall</th>
                    <th>reason</th>
                    <th>evaluated by</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPORT_ROWS.map((row, idx) => (
                    <tr key={idx}>
                      <td>-</td>
                      <td>
                        <span className="ex-cell-text">{row.user}</span>
                        <a href="#" className="ex-read-more">Read more</a>
                      </td>
                      <td>
                        <span className="ex-cell-text">{row.assistant}</span>
                        <a href="#" className="ex-read-more">Read more</a>
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ex-pagination">
                <button className="ex-page-btn" onClick={() => setExportPage(Math.max(1, exportPage - 1))}>Previous</button>
                <span className="ex-page-info">Page {exportPage} / 15</span>
                <button className="ex-page-btn" onClick={() => setExportPage(Math.min(15, exportPage + 1))}>Next</button>
              </div>
            </div>

            {/* Download Cards Row */}
            <div className="ex-download-row">
              <div className="ex-download-card">
                <h4>Download cooked Train/Test Split</h4>
                <p className="ex-download-stat">Train: 36 / Test: 36</p>
                <p className="ex-download-note">Export uses the safe split generated in the previous step. Handson-splitting is disabled here.</p>
                <button className="ex-btn-green"><Download size={14} /> Download train/test .zip</button>
              </div>
              <div className="ex-download-card">
                <h4>Download Split Filter by Overall Score</h4>
                <div className="ex-score-row">
                  <span className="ex-score-label">Overall Score ≥</span>
                  <span className="ex-score-value">6.0</span>
                </div>
                <input type="range" min="0" max="10" step="0.5" defaultValue={6} className="sg-slider sg-slider-purple" />
                <button className="ex-btn-purple"><Download size={14} /> Download split overall &gt;= filter</button>
              </div>
            </div>

            {/* Push & Sync Row */}
            <div className="ex-push-row">
              <div className="ex-push-card">
                <h4>🔥 Push to Hugging Face Hub</h4>
                <label className="s6-field-label" style={{ marginTop: 0 }}>Hugging Face Token</label>
                <input className="s6-field-input" defaultValue="hf_..." style={{ borderLeft: '1px solid #e2e8f0' }} />
                <label className="s6-field-label">Repository ID</label>
                <input className="s6-field-input" defaultValue="username/my-dataset" style={{ borderLeft: '1px solid #e2e8f0' }} />
                <label className="ex-checkbox-label">
                  <input type="checkbox" /> Make repository private
                </label>
                <button className="ex-btn-hub"><Upload size={14} /> Push to Hub</button>
              </div>
              <div className="ex-push-card">
                <h4>☁️ Sync to Cloud Storage</h4>
                <label className="s6-field-label" style={{ marginTop: 0 }}>Cloud Provider</label>
                <div className="ex-cloud-options">
                  <button
                    className={`ex-cloud-btn ${cloudProvider === 'gcloud' ? 'ex-cloud-active' : ''}`}
                    onClick={() => setCloudProvider('gcloud')}
                  >
                    Google Cloud
                  </button>
                  <button
                    className={`ex-cloud-btn ${cloudProvider === 'azure' ? 'ex-cloud-active' : ''}`}
                    onClick={() => setCloudProvider('azure')}
                  >
                    Azure Blob
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep6 > 13) {
              setCurrentSubStep6(currentSubStep6 - 1);
            } else {
              setCurrentStage(5);
            }
          }}>
            Back
          </button>
          <button className="s6-reset-btn"><RotateCcw size={14} /> Reset & Upload New</button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep6 < 15) {
              setCurrentSubStep6(currentSubStep6 + 1);
            }
          }}>
            Next
          </button>
        </div>
      </div>
    );
  };

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
                      { id: 5, label: 'NOISE (Outliers)', color: '#dc2626', bg: '#fef2f2' }
                    ];
                    const group = INITIAL_GROUP_DATA[idx % INITIAL_GROUP_DATA.length];
                    return {
                      ...c,
                      groupId: group.id,
                      groupLabel: group.label,
                      groupColor: group.color,
                      groupBg: group.bg,
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

      {/* Stepper */}
      <div className="dataprep-stepper">
        {STAGES.map((stage, idx) => (
          <React.Fragment key={stage.num}>
            <div
              className={`stepper-step ${stage.num === currentStage ? 'active' : ''} ${stage.num < currentStage ? 'completed' : ''}`}
              onClick={() => setCurrentStage(stage.num)}
            >
              <div className="stepper-circle">
                {stage.num < currentStage ? <Check size={16} /> : stage.num}
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
      {currentStage === 1 && renderStage1()}
      {currentStage === 2 && renderStage2()}
      {currentStage === 3 && renderStage3()}
      {currentStage === 4 && renderSep490Stage4()}
      {currentStage === 5 && renderSep490Stage5()}
      {currentStage === 6 && renderStage6()}

      {/* Compare Groups Modal */}
      {showCompareModal && (
        <div className="compare-modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="compare-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="compare-header-row">
              <div className="compare-header-titles">
                <h2>Cluster Group Comparison</h2>
                <p>Compare two groups side by side using User, &lt;think&gt;, and Assistant content.</p>
              </div>
              <button className="compare-close-btn" onClick={() => setShowCompareModal(false)}>
                <X size={14} /> Close Comparison
              </button>
            </div>

            <div className="compare-body">
              {/* Slot 1 */}
              <div className="compare-slot">
                {compareSlot1 === null ? (
                  <div className="slot-empty">
                    <div className="slot-header-empty">
                      <span>Comparison Slot 1</span>
                      <span className="empty-text">Empty slot</span>
                    </div>
                    <div className="slot-add-btn-wrapper">
                      <button className="slot-add-btn" onClick={() => setActiveCompareDropdown(activeCompareDropdown === 1 ? null : 1)}>
                        <Plus size={24} />
                      </button>
                      {activeCompareDropdown === 1 && (
                        <div className="slot-dropdown">
                          <div className="dropdown-title">SELECT GROUP</div>
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(g => (
                            <div key={g} className="dropdown-item" onClick={() => { setCompareSlot1(g); setActiveCompareDropdown(null); }}>
                              <span>Group {g}</span>
                              <span className="dropdown-count">{g === 0 || g === 1 ? 17 : g === 2 ? 12 : 8} rows</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="slot-filled">
                    <div className="slot-filled-header">
                      <div>
                        <h3>Group {compareSlot1}</h3>
                        <p>{compareSlot1 === 0 || compareSlot1 === 1 ? 17 : 8} rows</p>
                      </div>
                      <button className="slot-clear-btn" onClick={() => setCompareSlot1(null)}><X size={14} /></button>
                    </div>
                    <div className="slot-table-wrapper">
                      <table className="compare-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30%' }}>User</th>
                            <th style={{ width: '20%' }}>&lt;think&gt;</th>
                            <th style={{ width: '50%' }}>Assistant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...Array(5)].map((_, i) => (
                            <tr key={i}>
                              <td>{compareSlot1 === 0 ? "Em thấy phần Định luật I Newton khó quá, em không muốn học nữa." : "Cho em đáp án luôn phần Định luật I Newton đi ạ, em đang vội."}</td>
                              <td className="think-cell">-</td>
                              <td>{compareSlot1 === 0 ? "Không sao, mình chia nhỏ ra nhé. Em chưa cần làm bài khó ngay. Trước tiên chỉ cần trả lời một câu: đại lượng chính trong phần này đang mô tả điều gì?" : "Thầy chưa đưa đáp án ngay nhé. Với phần Định luật I Newton, em thử nói trước em đang vướng ở khái niệm, công thức hay bài tập số?"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Slot 2 */}
              <div className="compare-slot">
                {compareSlot2 === null ? (
                  <div className="slot-empty">
                    <div className="slot-header-empty">
                      <span>Comparison Slot 2</span>
                      <span className="empty-text">Empty slot</span>
                    </div>
                    <div className="slot-add-btn-wrapper">
                      <button className="slot-add-btn" onClick={() => setActiveCompareDropdown(activeCompareDropdown === 2 ? null : 2)}>
                        <Plus size={24} />
                      </button>
                      {activeCompareDropdown === 2 && (
                        <div className="slot-dropdown">
                          <div className="dropdown-title">SELECT GROUP</div>
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(g => (
                            <div key={g} className="dropdown-item" onClick={() => { setCompareSlot2(g); setActiveCompareDropdown(null); }}>
                              <span>Group {g}</span>
                              <span className="dropdown-count">{g === 0 || g === 1 ? 17 : g === 2 ? 12 : 8} rows</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="slot-filled">
                    <div className="slot-filled-header">
                      <div>
                        <h3>Group {compareSlot2}</h3>
                        <p>{compareSlot2 === 0 || compareSlot2 === 1 ? 17 : 8} rows</p>
                      </div>
                      <button className="slot-clear-btn" onClick={() => setCompareSlot2(null)}><X size={14} /></button>
                    </div>
                    <div className="slot-table-wrapper">
                      <table className="compare-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30%' }}>User</th>
                            <th style={{ width: '20%' }}>&lt;think&gt;</th>
                            <th style={{ width: '50%' }}>Assistant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...Array(5)].map((_, i) => (
                            <tr key={i}>
                              <td>{compareSlot2 === 0 ? "Em thấy phần Định luật I Newton khó quá, em không muốn học nữa." : "Cho em đáp án luôn phần Định luật I Newton đi ạ, em đang vội."}</td>
                              <td className="think-cell">-</td>
                              <td>{compareSlot2 === 0 ? "Không sao, mình chia nhỏ ra nhé. Em chưa cần làm bài khó ngay. Trước tiên chỉ cần trả lời một câu: đại lượng chính trong phần này đang mô tả điều gì?" : "Thầy chưa đưa đáp án ngay nhé. Với phần Định luật I Newton, em thử nói trước em đang vướng ở khái niệm, công thức hay bài tập số?"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compare AI Labels Modal */}
      {showCompareLabels && (
        <div className="compare-modal-overlay" onClick={() => setShowCompareLabels(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-header">
              <div>
                <h2>Compare AI Labels</h2>
                <p>Select two AI providers to compare their auto-labeling results.</p>
              </div>
              <button className="cl-close" onClick={() => setShowCompareLabels(false)}><X size={18} /></button>
            </div>

            <div className="cl-providers">
              <span className="cl-prov-label">Provider A:</span>
              <select className="cl-prov-select"><option>Gemini</option><option>Deepseek</option></select>
              <span className="cl-prov-arrow">›</span>
              <span className="cl-prov-label">Provider B:</span>
              <select className="cl-prov-select"><option>Deepseek</option><option>Gemini</option></select>
            </div>

            <div className="cl-stats">
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-green">100%</span>
                <span className="cl-stat-label">AGREEMENT RATE</span>
              </div>
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-blue">120</span>
                <span className="cl-stat-label">MATCHES</span>
              </div>
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-red">0</span>
                <span className="cl-stat-label">MISMATCHES</span>
              </div>
            </div>

            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>CONVERSATION</th>
                    <th style={{ width: '20%' }}>GEMINI LABEL</th>
                    <th style={{ width: '20%' }}>DEEPSEEK LABEL</th>
                    <th style={{ width: '20%' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { user: 'Em không hiểu chuyển động thẳng đều là gì.', asst: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Là vật đang đi chuyển a.', asst: 'Đúng rồi. Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ là gọi đó là loại chuyển động gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Chuyển động đều a?', asst: 'Rất gần rồi! Đầy đủ hơn là \'chuyển động thẳng đều\'. Em thử đoán xem \'thẳng\' ở đây có nghĩa là gì trong chuyển động?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Công thức x = x0 + vt có nghĩa là gì a?', asst: 'Câu hỏi hay. Trước khi giải thích, em đoán xem \'x\' và \'x0\' biểu diễn điều gì?', gLabel: 'PHYSICAL', gConf: 98, dLabel: 'MATH', dConf: 90, match: false },
                    { user: 'x là vị trí còn x0 là vị trí ban đầu a?', asst: 'Đúng rồi! Vậy vt là gì? Nếu v là vận tốc và t là thời gian, tích v nhân t sẽ cho ta biết điều gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Tính đạo hàm của hàm số f(x) = x² - 3x + 2.', asst: 'f\'(x) = 2x - 3. Áp dụng quy tắc đạo hàm lũy thừa.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 97, match: true },
                    { user: 'Tính tích phân ∫x² dx.', asst: '∫x² dx = x³/3 + C. Áp dụng công thức ∫xⁿ dx = xⁿ⁺¹/(n+1) + C.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 96, match: true },
                    { user: 'Giải hệ phương trình: x + y = 5 và x - y = 1.', asst: 'Cộng hai phương trình: 2x = 6 → x = 3, y = 2.', gLabel: 'MATH', gConf: 99, dLabel: 'MATH', dConf: 95, match: true },
                    { user: 'Tính xác suất để tung đồng xu 3 lần ra đúng 2 mặt ngửa.', asst: 'P(X=2) = C(3,2) · (1/2)² · (1/2)¹ = 3/8.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 94, match: true },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td>
                        <div className="cl-conv-user">{row.user}</div>
                        <div className="cl-conv-asst">{row.asst}</div>
                      </td>
                      <td><span className={`cl-pill cl-pill-${row.gLabel.toLowerCase()}`}>{row.gLabel} ({row.gConf}%)</span></td>
                      <td><span className={`cl-pill cl-pill-${row.dLabel.toLowerCase()}`}>{row.dLabel} ({row.dConf}%)</span></td>
                      <td><span className={`cl-status ${row.match ? 'cl-match' : 'cl-mismatch'}`}>{row.match ? 'Match' : 'Mismatch'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Labeling Task Modal */}
      {showCreateTaskModal && (
        <div className="compare-modal-overlay" onClick={() => setShowCreateTaskModal(false)}>
          <div className="ct-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ct-header">
              <h2>Create Labeling Task</h2>
              <p>Divide unassigned samples into a new task. (Unassigned samples left: 4)</p>
            </div>

            <div className="ct-body">
              <div className="ct-form-group">
                <label>Task Name</label>
                <input type="text" placeholder="e.g. Batch 1 - Math Labeling" className="ct-input" />
              </div>

              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Batch Size</label>
                  <input type="number" defaultValue={30} className="ct-input" />
                </div>
                <div className="ct-form-group">
                  <label>Priority</label>
                  <select className="ct-select" defaultValue="Medium">
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>
              </div>

              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Review Mode</label>
                  <select className="ct-select" defaultValue="Single Review (1 Annotator)">
                    <option>Single Review (1 Annotator)</option>
                    <option>Double Review (2 Annotators)</option>
                    <option>Triple Review (3 Annotators)</option>
                  </select>
                </div>
                <div className="ct-form-group">
                  <label>Deadline (Optional)</label>
                  <div className="ct-date-input">
                    <input type="text" placeholder="dd/mm/yyyy" className="ct-input" />
                    <Calendar size={14} className="ct-date-icon" />
                  </div>
                </div>
              </div>

              <div className="ct-form-group">
                <label>Assignees</label>
                <div className="ct-assignees-box">
                  <label className="ct-checkbox-label">
                    <input type="checkbox" />
                    <span><strong>hoang22</strong> (hoangndnhe180790@fpt.edu.vn)</span>
                  </label>
                  <label className="ct-checkbox-label">
                    <input type="checkbox" />
                    <span><strong>uhhgf</strong> (hoangndhhefff180790@fpt.edu.vn)</span>
                  </label>
                </div>
              </div>

              <div className="ct-form-group">
                <label>Guideline (URL or Instructions)</label>
                <textarea placeholder="Link to Notion/Google Doc, or short text..." className="ct-textarea"></textarea>
              </div>

              <div className="ct-form-group">
                <label className="ct-checkbox-label" style={{ marginTop: '8px' }}>
                  <input type="checkbox" />
                  <strong>Tắt gợi ý nhãn từ AI (Disable AI Suggestion)</strong>
                </label>
              </div>
            </div>

            <div className="ct-footer">
              <button className="ct-btn-cancel" onClick={() => setShowCreateTaskModal(false)}>Cancel</button>
              <button className="ct-btn-create">Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataPrepView;
