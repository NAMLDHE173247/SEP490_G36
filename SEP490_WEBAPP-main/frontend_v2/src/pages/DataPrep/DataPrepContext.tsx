import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { apiService } from '../../services/api';

// --- Constants ---
export const STAGES = [
  { num: 1, label: 'Upload & Convert', sub: 'Step 1' },
  { num: 2, label: 'Preprocessing', sub: 'Step 2-4' },
  { num: 3, label: 'Labeling', sub: 'Step 5-7' },
  { num: 4, label: 'Classification', sub: 'Step 8-12' },
  { num: 5, label: 'Finish', sub: 'Step 13-15' },
];

export const SUB_STEPS_STAGE2 = [
  { num: 1, label: 'Clean' },
  { num: 2, label: 'Find K' },
  { num: 3, label: 'K-means Cluster' },
];

export const SAMPLE_RAW_DATA = `[
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

export const SAMPLE_OUTPUT = `{
  "conversation_id": "conv_001",
  "messages": [
    { "role": "user", "content": "I need help resetting my password" },
    { "role": "assistant", "content": "Go to Settings > Security to reset it." }
  ]
}`;

export const CONVERSATIONS = [
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

export const SUB_STEPS_STAGE3 = [
  { num: 5, label: 'Phân loại & Lọc nhiễu' },
  { num: 6, label: 'Giao việc (Assign)' },
  { num: 7, label: 'Kết quả & Export' }
];

export const SUB_STEPS_STAGE4 = [
  { num: 8, label: 'Classification' },
  { num: 9, label: 'Quality Management' },
  { num: 10, label: 'Distribution' },
  { num: 11, label: 'Rewrite' },
];

export const SUB_STEPS_STAGE6 = [
  { num: 13, label: 'System Prompt' },
  { num: 14, label: 'Split Guard' },
  { num: 15, label: 'Export' },
];

export const PROMPT_VERSIONS = [
  { id: 1, name: 'Project 27/05 09:30', desc: 'Initial baseline prompt', date: '2026-05-27 09:30', content: 'You are a Socratic tutor. Guide students through questions without giving direct answers.' },
  { id: 2, name: 'Project_27/05_10:15', desc: 'Added encouragement phrases', date: '2026-05-27 10:15', content: 'You are a Socratic tutor. Guide students through questions. Use encouraging phrases like "Great thinking!" and "You\'re on the right track!"' },
  { id: 3, name: 'Project 27/05 11:11', desc: 'Added Socratic method', date: '2026-05-27 11:11', content: 'You are a Socratic tutor specializing in STEM education. Always ask guiding questions. Never give direct answers. Encourage step-by-step reasoning.' },
];

export const EXPORT_ROWS = [
  { user: 'Hãy giải phương trình bậc hai sau đây: x^2 - 5x + 6 = 0', assistant: 'Để giải phương trình bậc hai này, mình sẽ hỏi một số câu hỏi...' },
  { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
  { user: 'Cách tính biệt thức delta và delta phẩy của phương trình bậc hai', assistant: 'Biệt thức Delta được tính bằng công thức b^2 - 4ac...' },
  { user: 'Phương trình bậc hai có hai nghiệm phân biệt khi nào?', assistant: 'Để hiểu kỹ hơn phương trình có hai nghiệm phân biệt, điều này có ý...' },
  { user: 'Giải phương trình bậc hai có chứa tham số m', assistant: 'Mối giá trị của tham số bậc hai như thế nào với thi dùng chưa có một...' },
];

export const PREVIEW_BEFORE = [
  { id: 'conv_18', user: 'Hello how are you?', assistant: 'I am good. <think>This is a thinking process.</think> How can I help you?', issue: 'Contains <think> tag', status: 'has-issue' },
  { id: 'conv_19', user: 'Can you help me with math?', assistant: 'Sure, <think> Need to ask what kind of math.', issue: 'Unclosed <think> tag', status: 'has-issue' },
  { id: 'conv_20', user: 'What is physics?', assistant: 'Physics is the study of matter and energy.', issue: null, status: 'clean' },
  { id: 'conv_21', user: 'Ah', assistant: 'Yes?', issue: 'Too short (< 5 chars)', status: 'has-issue' },
];

export const PREVIEW_AFTER = [
  { id: 'conv_18', user: 'Hello how are you?', assistant: 'I am good. How can I help you?', action: 'Removed <think> tags', status: 'fixed' },
  { id: 'conv_19', user: 'Can you help me with math?', assistant: 'Sure, Need to ask what kind of math.', action: 'Removed unclosed <think> tag', status: 'fixed' },
  { id: 'conv_20', user: 'What is physics?', assistant: 'Physics is the study of matter and energy.', action: 'No changes needed', status: 'clean' },
];

export const PREVIEW_REMOVED = [
  { id: 'conv_21', user: 'Ah', assistant: 'Yes?', reason: 'Too short (< 5 chars)' },
];

const DataPrepContext = createContext<any>(null);

const resolveStageFromResumeStep = (step: number) => {
  if (step >= 13) return 5;
  if (step >= 7) return 4;
  if (step >= 5) return 3;
  if (step >= 2) return 2;
  return 1;
};

const buildConversationRowsFromVersionItems = (items: any[]) => {
  if (!Array.isArray(items)) return [];
  return items.map((item: any, index: number) => {
    const data = item.data || {};
    const sourceMessages = Array.isArray(data.messages)
      ? data.messages
      : Array.isArray(data.conversations)
        ? data.conversations
        : [];
    const messages: any[] = [];

    if (sourceMessages.length) {
      for (let i = 0; i < sourceMessages.length; i++) {
        const current = sourceMessages[i];
        const role = current.role || current.from;
        if (role === 'user' || role === 'human') {
          const assistant = sourceMessages.slice(i + 1).find((msg: any) => ['assistant', 'gpt'].includes(msg.role || msg.from));
          messages.push({
            user: current.content || current.value || '',
            assistant: assistant ? assistant.content || assistant.value || '' : '',
          });
        }
      }
    }

    if (!messages.length && data.instruction) {
      messages.push({
        user: data.instruction + (data.input ? '\n' + data.input : ''),
        assistant: data.output || '',
      });
    }

    return {
      id: data.conversation_id || data.id || item.sampleKey || `conv_${String(index + 1).padStart(3, '0')}`,
      sampleObjectId: item._id || item.sampleId,
      datasetVersionId: item.datasetVersionId,
      subject: data.subject || data.metadata?.subject || '',
      messages: messages.length ? messages : [{ user: 'No user message', assistant: 'No assistant message' }],
      groupId: data.groupId || data.group_id || data.clusterId || ((index % 15) + 1),
      groupLabel: data.groupLabel || data.group_label || data.subject || '',
      groupColor: data.groupColor || '#64748b',
      groupBg: data.groupBg || '#f8fafc',
      subGroup: data.subGroup || data.sub_group || 'A',
      confidence: data.confidence || 0,
    };
  });
};

export const DataPrepProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentStage, setCurrentStage] = useState(() => {
    const saved = localStorage.getItem('dp_currentStage');
    const parsed = saved ? parseInt(saved, 10) : 1;
    return parsed > 5 ? 5 : parsed;
  });
  const [currentSubStep, setCurrentSubStep] = useState(() => {
    const saved = localStorage.getItem('dp_currentSubStep');
    return saved ? parseInt(saved, 10) : 1;
  });

  React.useEffect(() => {
    localStorage.setItem('dp_currentStage', currentStage.toString());
  }, [currentStage]);

  React.useEffect(() => {
    localStorage.setItem('dp_currentSubStep', currentSubStep.toString());
  }, [currentSubStep]);
  const [file, setFile] = useState<any>(null);
  const [rawPreviewText, setRawPreviewText] = useState('');
  const [sampleOutputText, setSampleOutputText] = useState('');
  const [conversationsList, setConversationsList] = useState<any[]>([]);
  const [conversionStats, setConversionStats] = useState<any>(null);
  const [stage3Convs, setStage3Convs] = useState<any[]>([]);
  const [pendingCleanedList, setPendingCleanedList] = useState<any[]>([]);
  const [isCleaningLoading, setIsCleaningLoading] = useState(false);
  const [projectName, setProjectName] = useState('Project_01/06_16:14');
  const [rawPreviewOpen, setRawPreviewOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('openai');
  const [removeThinkTags, setRemoveThinkTags] = useState(true);
  const [cleaningEnabled, setCleaningEnabled] = useState(true);
  const [cleaningApplied, setCleaningApplied] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTab, setPreviewTab] = useState('before');

  /* Cleaning options */
  const [removeErrorKeywords, setRemoveErrorKeywords] = useState(true);
  const [removeUnclosedThink, setRemoveUnclosedThink] = useState(true);
  const [removeCompleteThink, setRemoveCompleteThink] = useState(true);
  const [minChars, setMinChars] = useState('5');
  const [maxChars, setMaxChars] = useState('4000');
  const [minPairs, setMinPairs] = useState('1');

  /* Stage 2 pagination - by conversations */
  const [currentPage, setCurrentPage] = useState(1);
  const [convsPerPage, setConvsPerPage] = useState(10);
  const [expandedConvs, setExpandedConvs] = useState<any>({});
  const [expandedCells, setExpandedCells] = useState<any>({});
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
  const [compareSlot1, setCompareSlot1] = useState<any>(null);
  const [compareSlot2, setCompareSlot2] = useState<any>(null);
  const [activeCompareDropdown, setActiveCompareDropdown] = useState<any>(null);

  /* Clustering Options Popup */
  const [showClusterOptionsPopup, setShowClusterOptionsPopup] = useState(false);

  /* Data Cleaning Pipeline Popup */
  const [showCleaningPopup, setShowCleaningPopup] = useState(false);
  const [cleaningPopupView, setCleaningPopupView] = useState('settings'); // 'settings' | 'preview'

  /* Conversation Detail Popup */
  const [selectedConv, setSelectedConv] = useState<any>(null);

  /* Stage 3 state */
  const [currentSubStep3, setCurrentSubStep3] = useState(() => {
    const saved = localStorage.getItem('dp_currentSubStep3');
    return saved ? parseInt(saved, 10) : 5;
  });

  React.useEffect(() => {
    localStorage.setItem('dp_currentSubStep3', currentSubStep3.toString());
  }, [currentSubStep3]);
  const [stage3Page, setStage3Page] = useState(1);
  const [stage3PerPage, setStage3PerPage] = useState(10);
  const [stage3Search, setStage3Search] = useState('');
  const [showCompareLabels, setShowCompareLabels] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [iaActiveTab, setIaActiveTab] = useState('assignment');
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [selectedGroup3, setSelectedGroup3] = useState<any>(null);
  const [selectedConv3, setSelectedConv3] = useState<any>(null);
  const [selectedIaMsgId, setSelectedIaMsgId] = useState<any>(null);
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

  const getLabelBadgeStyle = (labelName: string) => {
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

  const handleToggleLabel = (msgId: number, groupName: string, tagName: string) => {
    setIaMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;
      
      const newLabels = { ...msg.labels };
      newLabels[groupName] = newLabels[groupName].map((tag: any) => {
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

  const handleRemoveMessageSingleLabel = (msgId: number, tagName: string) => {
    setIaMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;
      
      const newLabels = { ...msg.labels };
      Object.keys(newLabels).forEach(g => {
        newLabels[g] = newLabels[g].map((tag: any) => {
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
  const [currentSubStep4, setCurrentSubStep4] = useState(() => {
    const saved = localStorage.getItem('dp_currentSubStep4');
    return saved ? parseInt(saved, 10) : 7;
  });

  React.useEffect(() => {
    localStorage.setItem('dp_currentSubStep4', currentSubStep4.toString());
  }, [currentSubStep4]);
  const [classPage, setClassPage] = useState(1);
  const [qualityTab, setQualityTab] = useState('all');
  const [rewriteConvIdx, setRewriteConvIdx] = useState(8);
  const [rewriteTab, setRewriteTab] = useState('original');

  /* Stage 5 state */
  const [judgeModels, setJudgeModels] = useState({ gemini: true, openai: false, deepseek: true });
  const [evalExpanded, setEvalExpanded] = useState('eval_428051');
  const [sepQualityModal, setSepQualityModal] = useState<any>(null);
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
  const [sepQualityRatings, setSepQualityRatings] = useState<any>({});
  const [sepQualityLabels, setSepQualityLabels] = useState<any>({});

  /* Stage 6 state */
  const [currentSubStep6, setCurrentSubStep6] = useState(() => {
    const saved = localStorage.getItem('dp_currentSubStep6');
    return saved ? parseInt(saved, 10) : 13;
  });

  React.useEffect(() => {
    localStorage.setItem('dp_currentSubStep6', currentSubStep6.toString());
  }, [currentSubStep6]);
  const [promptText, setPromptText] = useState('');
  const [promptName, setPromptName] = useState('Project_27/05_11:11');
  const [promptDesc, setPromptDesc] = useState('Example: Added Socratic method');
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [sampleQuestion, setSampleQuestion] = useState('Hãy giải phương trình bậc hai sau đây: x² - 5x + 6 = 0');
  const [trialResponse, setTrialResponse] = useState('');
  const [exportPage, setExportPage] = useState(1);
  const [cloudProvider, setCloudProvider] = useState('gcloud');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workflowVersions, setWorkflowVersions] = useState<any[]>([]);
  const [activeWorkflowVersion, setActiveWorkflowVersion] = useState<any>(null);
  const [isHydratingWorkflow, setIsHydratingWorkflow] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadWorkflowVersions = React.useCallback(async () => {
    try {
      const res = await apiService.listDatasetVersions();
      setWorkflowVersions(Array.isArray(res.data) ? res.data : []);
      return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      console.error('Failed to load workflow versions', error);
      return [];
    }
  }, []);

  const openWorkflowVersion = React.useCallback(async (versionId: string) => {
    if (!versionId) return;
    setIsHydratingWorkflow(true);
    try {
      const detail = await apiService.getDatasetVersionDetail(versionId);
      const version = detail.datasetVersion;
      const rows = buildConversationRowsFromVersionItems(detail.items || []);
      localStorage.setItem('current_version_id', versionId);
      setActiveWorkflowVersion(version);
      setProjectName(version?.projectName || 'Dataset');
      setConversationsList(rows);
      setStage3Convs(rows);
      setConversionStats({
        total: rows.length,
        converted: rows.length,
        datasetVersionId: versionId,
      });

      const resumeStep = Number(version?.prepareResumeStep || version?.checkpointResumeStep || 1);
      const stage = resolveStageFromResumeStep(resumeStep);
      setCurrentStage(stage);
      if (stage === 2) setCurrentSubStep(Math.max(1, Math.min(3, resumeStep)));
      if (stage === 3) setCurrentSubStep3(Math.max(5, Math.min(6, resumeStep)));
      if (stage === 4) setCurrentSubStep4(Math.max(7, Math.min(12, resumeStep)));
      if (stage === 5) setCurrentSubStep6(Math.max(13, Math.min(14, resumeStep)));
    } catch (error) {
      console.error('Failed to open workflow version', error);
    } finally {
      setIsHydratingWorkflow(false);
    }
  }, []);

  const startNewWorkflow = React.useCallback(() => {
    localStorage.removeItem('current_version_id');
    localStorage.removeItem('dp_currentStage');
    localStorage.removeItem('dp_currentSubStep');
    localStorage.removeItem('dp_currentSubStep3');
    localStorage.removeItem('dp_currentSubStep4');
    localStorage.removeItem('dp_currentSubStep6');
    setActiveWorkflowVersion(null);
    setCurrentStage(1);
    setCurrentSubStep(1);
    setCurrentSubStep3(5);
    setCurrentSubStep4(7);
    setCurrentSubStep6(13);
    setFile(null);
    setConversationsList([]);
    setStage3Convs([]);
    setConversionStats(null);
  }, []);

  React.useEffect(() => {
    loadWorkflowVersions().then((versions) => {
      const versionId = localStorage.getItem('current_version_id');
      if (versionId) {
        openWorkflowVersion(versionId);
        return;
      }
      setActiveWorkflowVersion(null);
      setCurrentStage(1);
      setCurrentSubStep(1);
      setCurrentSubStep3(5);
      setCurrentSubStep4(7);
      setCurrentSubStep6(13);
    });
  }, [loadWorkflowVersions, openWorkflowVersion]);

  React.useEffect(() => {
    if (isHydratingWorkflow) return;
    const versionId = localStorage.getItem('current_version_id');
    if (!versionId) return;

    const step =
      currentStage === 5 ? currentSubStep6
      : currentStage === 4 ? currentSubStep4
      : currentStage === 3 ? currentSubStep3
      : currentStage === 2 ? currentSubStep
      : 1;
    if (step <= 1) return;

    const timeoutId = window.setTimeout(() => {
      apiService.updateDatasetVersionPrepareProgress(versionId, step).catch((error) => {
        console.error('Failed to save workflow progress', error);
      });
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [currentStage, currentSubStep, currentSubStep3, currentSubStep4, currentSubStep6, isHydratingWorkflow]);

  const handleFileUpload = async (e: any) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      localStorage.removeItem('current_version_id');
      setActiveWorkflowVersion(null);
      try {
        setUploadProgress(0);
        setFile({
          name: uploaded.name,
          format: 'Đang tải lên và phân tích...',
          messages: 0,
          conversations: 0,
          size: '...'
        });
        setRawPreviewText('Đang phân tích dữ liệu tệp...');
        setSampleOutputText('Đang tạo mẫu đầu ra...');

        const res = await apiService.uploadFile(uploaded, (progressEvent: any) => {
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
        enableCleaning: cleaningEnabled,
        removeThinkTags: removeThinkTags
      });

      const mapped = mapConvertedToConversations(res.data);
      setConversationsList(mapped);
      setConversionStats(res);

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

  /* Page numbers with ellipsis */
  const getPageNumbers = (current: number, total: number) => {
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

  return (
    <DataPrepContext.Provider value={{
      currentStage, setCurrentStage,
      currentSubStep, setCurrentSubStep,
      file, setFile,
      rawPreviewText, setRawPreviewText,
      sampleOutputText, setSampleOutputText,
      conversationsList, setConversationsList,
      conversionStats, setConversionStats,
      stage3Convs, setStage3Convs,
      pendingCleanedList, setPendingCleanedList,
      isCleaningLoading, setIsCleaningLoading,
      projectName, setProjectName,
      rawPreviewOpen, setRawPreviewOpen,
      selectedFormat, setSelectedFormat,
      removeThinkTags, setRemoveThinkTags,
      cleaningEnabled, setCleaningEnabled,
      cleaningApplied, setCleaningApplied,
      showPreviewModal, setShowPreviewModal,
      previewTab, setPreviewTab,
      removeErrorKeywords, setRemoveErrorKeywords,
      removeUnclosedThink, setRemoveUnclosedThink,
      removeCompleteThink, setRemoveCompleteThink,
      minChars, setMinChars,
      maxChars, setMaxChars,
      minPairs, setMinPairs,
      mapConvertedToConversations,
      currentPage, setCurrentPage,
      convsPerPage, setConvsPerPage,
      expandedConvs, setExpandedConvs,
      expandedCells, setExpandedCells,
      searchQuery, setSearchQuery,
      maxK, setMaxK,
      eps, setEps,
      minSamples, setMinSamples,
      showVisualization, setShowVisualization,
      targetK, setTargetK,
      clusterEps, setClusterEps,
      clusterMinSamples, setClusterMinSamples,
      clusterRan, setClusterRan,
      simThreshold, setSimThreshold,
      clusterPage, setClusterPage,
      clusterPerPage,
      showCompareModal, setShowCompareModal,
      compareSlot1, setCompareSlot1,
      compareSlot2, setCompareSlot2,
      activeCompareDropdown, setActiveCompareDropdown,
      showClusterOptionsPopup, setShowClusterOptionsPopup,
      showCleaningPopup, setShowCleaningPopup,
      cleaningPopupView, setCleaningPopupView,
      selectedConv, setSelectedConv,
      currentSubStep3, setCurrentSubStep3,
      stage3Page, setStage3Page,
      stage3PerPage, setStage3PerPage,
      stage3Search, setStage3Search,
      showCompareLabels, setShowCompareLabels,
      showCreateTaskModal, setShowCreateTaskModal,
      iaActiveTab, setIaActiveTab,
      showUserGuide, setShowUserGuide,
      selectedGroup3, setSelectedGroup3,
      selectedConv3, setSelectedConv3,
      selectedIaMsgId, setSelectedIaMsgId,
      iaMessages, setIaMessages,
      getLabelBadgeStyle,
      handleToggleLabel,
      handleRemoveMessageSingleLabel,
      currentSubStep4, setCurrentSubStep4,
      classPage, setClassPage,
      qualityTab, setQualityTab,
      rewriteConvIdx, setRewriteConvIdx,
      rewriteTab, setRewriteTab,
      judgeModels, setJudgeModels,
      evalExpanded, setEvalExpanded,
      sepQualityModal, setSepQualityModal,
      sepDistributionTab, setSepDistributionTab,
      sepEvalRecommendation, setSepEvalRecommendation,
      sepEvalConflictOnly, setSepEvalConflictOnly,
      sepEvalMinScore, setSepEvalMinScore,
      sepRunningClass, setSepRunningClass,
      sepRunningQuality, setSepRunningQuality,
      sepRunningEval, setSepRunningEval,
      sepSubjectFilter, setSepSubjectFilter,
      sepSelectedDistSubject, setSepSelectedDistSubject,
      sepSelectedDistQuality, setSepSelectedDistQuality,
      sepSelectedError, setSepSelectedError,
      sepBalanceApplied, setSepBalanceApplied,
      sepRewriteGenerated, setSepRewriteGenerated,
      sepRewriteDecision, setSepRewriteDecision,
      sepQualityRatings, setSepQualityRatings,
      sepQualityLabels, setSepQualityLabels,
      currentSubStep6, setCurrentSubStep6,
      promptText, setPromptText,
      promptName, setPromptName,
      promptDesc, setPromptDesc,
      selectedVersion, setSelectedVersion,
      sampleQuestion, setSampleQuestion,
      trialResponse, setTrialResponse,
      exportPage, setExportPage,
      cloudProvider, setCloudProvider,
      uploadProgress, setUploadProgress,
      workflowVersions,
      activeWorkflowVersion,
      isHydratingWorkflow,
      loadWorkflowVersions,
      openWorkflowVersion,
      startNewWorkflow,
      fileInputRef,
      handleFileUpload,
      handleRemoveFile,
      handleConvert,
      getPageNumbers
    }}>
      {children}
    </DataPrepContext.Provider>
  );
};

export const useDataPrep = () => {
  const context = useContext(DataPrepContext);
  if (!context) {
    throw new Error('useDataPrep must be used within a DataPrepProvider');
  }
  return context;
};
