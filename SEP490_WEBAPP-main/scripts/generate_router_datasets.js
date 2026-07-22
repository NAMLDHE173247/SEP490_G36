/*
 * Creates a reproducible, synthetic v1 router dataset.
 * The train split is for calibration/future learned-router experiments;
 * the test split must remain held out for reporting benchmark metrics.
 */
const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '../docs/datasets');
const make = (intent, question, challenge = 'standard', extra = {}) => ({
  intent, question, challenge, ...extra,
});

const subjectDefinitions = {
  MATH: {
    train: {
      standard: [
        make('solve_problem', n => `Giải phương trình ${n + 2}x - ${n} = ${3 * n + 4}.`),
        make('give_hint', n => `Em chưa biết bắt đầu rút gọn phân thức (${n + 1}x)/(x + ${n + 1}) như thế nào.`),
        make('solve_problem', n => `Một tam giác có đáy ${n + 5} cm và chiều cao ${n + 2} cm. Tính diện tích.`),
        make('check_answer', n => `Em tính ${n + 12}% của ${n * 20 + 100} ra ${n * 2 + 20}. Kết quả đúng không?`),
        make('explain_concept', () => 'Giải thích giúp em vì sao phải đổi dấu khi chuyển vế trong bất phương trình.'),
        make('solve_problem', n => `Tìm nghiệm của hệ: x + y = ${n + 8}; x - y = ${n}.`),
        make('diagnose_error', () => 'Em khai triển (a + b)^2 thành a^2 + b^2, em sai ở bước nào?'),
        make('solve_problem', n => `Một hình chữ nhật có chu vi ${4 * n + 20} cm, chiều dài hơn chiều rộng ${n + 2} cm. Tìm kích thước.`),
        make('explain_concept', () => 'Hàm số bậc nhất đồng biến khi nào?'),
      ],
      typo: [
        make('solve_problem', () => 'giai pt 4x-7=13 voi a', 'typo'),
        make('give_hint', () => 'em ko biet quy dong mau phan so', 'typo'),
        make('diagnose_error', () => 'tai sao em tinh can bac 2 cua 49 lai bi sai?', 'typo'),
        make('check_answer', () => 'em tinh dt hinh tron ra vay dung chua?', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'Giúp em giải pt bậc 2: x² - 5x + 6 = 0.', 'abbreviation'),
        make('explain_concept', () => 'HSBN có dạng tổng quát thế nào?', 'abbreviation'),
        make('give_hint', () => 'Gợi ý cách làm bài HPT 2 ẩn với.', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Vậy em thay giá trị x vừa tìm vào chỗ nào tiếp ạ?', 'follow_up', {
          history: [{ role: 'user', content: 'Giải phương trình 2x + 3 = 11.' }, { role: 'assistant', content: 'Em hãy cô lập hạng tử chứa x trước nhé.' }],
        }),
        make('ask_follow_up', () => 'Tại sao ở bước đó lại nhân cả tử lẫn mẫu ạ?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang rút gọn một phân thức đại số.' }, { role: 'assistant', content: 'Hãy tìm nhân tử chung ở tử và mẫu.' }],
        }),
        make('ask_follow_up', () => 'Nếu đổi số liệu thì công thức diện tích vẫn dùng như vậy chứ?', 'follow_up', {
          history: [{ role: 'user', content: 'Em vừa tính diện tích tam giác.' }, { role: 'assistant', content: 'Em dùng một nửa tích đáy và chiều cao.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Bài phương trình này em không biết làm từ đâu.', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'Em bị kẹt ở bài hình, cần làm gì tiếp?', 'ambiguous', { clarify: true }),
      ],
    },
    test: {
      standard: [
        make('solve_problem', () => 'Tìm nghiệm của phương trình x² - 7x + 12 = 0.'),
        make('solve_problem', () => 'Một cửa hàng giảm 15% giá một chiếc áo 480000 đồng. Giá sau giảm là bao nhiêu?'),
        make('explain_concept', () => 'Phân biệt hàm số bậc nhất và hàm số bậc hai giúp em.'),
        make('give_hint', () => 'Gợi ý cho em cách chứng minh hai tam giác đồng dạng.'),
        make('check_answer', () => 'Em tính xác suất gieo được số chẵn là 1/3, có đúng không?'),
        make('solve_problem', () => 'Một hình tròn bán kính 5 cm. Tính chu vi theo π.'),
        make('diagnose_error', () => 'Em biến x² - 9 thành (x - 9)(x + 9). Lỗi ở đâu?'),
        make('solve_problem', () => 'Tìm giá trị nhỏ nhất của biểu thức x² - 6x + 11.'),
        make('explain_concept', () => 'Vì sao mẫu số của phân thức không được bằng 0?'),
        make('solve_problem', () => 'Một cấp số cộng có u1 = 3 và công sai 4. Tính u10.'),
      ],
      typo: [
        make('solve_problem', () => 'tim x biet 3x+8=26 nha', 'typo'),
        make('give_hint', () => 'em dang roi o buoc phan tich da thuc', 'typo'),
        make('check_answer', () => 'em tinh 25 phan tram cua 360 la 80 dung k', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'Cho em hỏi cách giải BPT bậc nhất một ẩn.', 'abbreviation'),
        make('explain_concept', () => 'ĐKXĐ của PTS là gì ạ?', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Sau khi tìm được hai nghiệm, em chọn nghiệm nào?', 'follow_up', {
          history: [{ role: 'user', content: 'Giải phương trình bậc hai x² - 5x + 6 = 0.' }, { role: 'assistant', content: 'Em có thể phân tích thành nhân tử.' }],
        }),
        make('ask_follow_up', () => 'Vậy số π có cần đổi sang 3,14 không?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang tính chu vi hình tròn.' }, { role: 'assistant', content: 'Công thức là C = 2πr.' }],
        }),
        make('ask_follow_up', () => 'Em đã đưa về cùng mẫu rồi, bước kế tiếp là gì?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang cộng hai phân thức.' }, { role: 'assistant', content: 'Em đã quy đồng mẫu số.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Em có một bài đại số nhưng đề thiếu số liệu, phải làm sao?', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'Bài toán này em không rõ cần tìm x hay tìm y.', 'ambiguous', { clarify: true }),
      ],
    },
  },
  PHYSICS: {
    train: {
      standard: [
        make('solve_problem', n => `Một xe đi ${n * 10 + 40} km trong ${n + 1} giờ. Tính vận tốc trung bình.`),
        make('explain_concept', () => 'Giải thích sự khác nhau giữa quãng đường và độ dời.'),
        make('solve_problem', n => `Một vật có khối lượng ${n + 2} kg chịu lực ${2 * n + 10} N. Tính gia tốc.`),
        make('check_answer', () => 'Em nói đơn vị của công là N/m, có đúng không?'),
        make('give_hint', () => 'Gợi ý cho em cách vẽ sơ đồ lực tác dụng lên quyển sách trên bàn.'),
        make('diagnose_error', () => 'Em dùng công thức v = s + t, em nhầm ở đâu?'),
        make('solve_problem', n => `Một điện trở ${n + 4} Ω nối với nguồn ${2 * n + 6} V. Tính cường độ dòng điện.`),
        make('explain_concept', () => 'Vì sao vật rơi tự do có gia tốc gần như không đổi?'),
        make('solve_problem', n => `Một vật có trọng lượng ${n * 5 + 20} N. Lấy g = 10 m/s², tính khối lượng.`),
      ],
      typo: [
        make('solve_problem', () => 'tinh vtb khi xe di 90km het 1.5h', 'typo'),
        make('explain_concept', () => 'tai sao luc ma sat lai nguoc chieu chuyen dong', 'typo'),
        make('diagnose_error', () => 'em doi don vi km/h sang m/s bi sai o dau?', 'typo'),
        make('check_answer', () => 'don vi cuong do dong dien la V dung ko?', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'Tính vtb của xe đi 54 km trong 1,5 h.', 'abbreviation'),
        make('explain_concept', () => 'CT tính P điện là gì?', 'abbreviation'),
        make('give_hint', () => 'Gợi ý bài ĐL Ôm với.', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Vậy em đổi giờ sang giây trước hay sau ạ?', 'follow_up', {
          history: [{ role: 'user', content: 'Một xe chuyển động đều, hãy tính vận tốc theo đơn vị SI.' }, { role: 'assistant', content: 'Em cần đưa quãng đường và thời gian về đơn vị SI.' }],
        }),
        make('ask_follow_up', () => 'Lực phản lực có phải luôn bằng trọng lực không?', 'follow_up', {
          history: [{ role: 'user', content: 'Em phân tích lực của vật đặt trên mặt bàn.' }, { role: 'assistant', content: 'Hãy xét các lực tác dụng lên vật.' }],
        }),
        make('ask_follow_up', () => 'Nếu điện áp tăng gấp đôi thì em thay vào công thức thế nào?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang áp dụng định luật Ôm.' }, { role: 'assistant', content: 'Giữ điện trở không đổi rồi so sánh U và I.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Bài vận tốc này em chưa biết cần đổi đơn vị nào.', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'Em không rõ vật này có những lực nào tác dụng.', 'ambiguous', { clarify: true }),
      ],
    },
    test: {
      standard: [
        make('solve_problem', () => 'Một người chạy 400 m trong 80 giây. Tính tốc độ trung bình theo m/s.'),
        make('solve_problem', () => 'Một bóng đèn 12 V có cường độ dòng điện 0,5 A. Tính công suất.'),
        make('explain_concept', () => 'Phân biệt khối lượng với trọng lượng.'),
        make('give_hint', () => 'Gợi ý cách giải bài hai lực cân bằng.'),
        make('check_answer', () => 'Em đổi 72 km/h thành 25 m/s, đúng chưa?'),
        make('solve_problem', () => 'Một vật 4 kg chịu lực kéo 20 N, bỏ qua ma sát. Tính gia tốc.'),
        make('diagnose_error', () => 'Em tính công bằng F chia s. Em sai công thức ở đâu?'),
        make('solve_problem', () => 'Dòng điện 2 A chạy qua điện trở 6 Ω. Tính hiệu điện thế.'),
        make('explain_concept', () => 'Vì sao khi lên cao áp suất khí quyển giảm?'),
        make('solve_problem', () => 'Một vật rơi tự do trong 3 giây, lấy g = 10 m/s². Tính vận tốc cuối.'),
      ],
      typo: [
        make('solve_problem', () => 'mot xe di 150km trong 3h tinh toc do', 'typo'),
        make('give_hint', () => 'em ko biet ve bieu do luc', 'typo'),
        make('check_answer', () => 'em tinh U=IR ra 18V co dung ko', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'CT tính công cơ học A là gì?', 'abbreviation'),
        make('explain_concept', () => 'ĐV của HĐT là gì?', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Sau khi có vận tốc, em có cần đổi lại sang km/h không?', 'follow_up', {
          history: [{ role: 'user', content: 'Một người chạy 400 m trong 80 giây.' }, { role: 'assistant', content: 'Em chia quãng đường cho thời gian để có m/s.' }],
        }),
        make('ask_follow_up', () => 'Nếu có ma sát thì phương trình lực thay đổi chỗ nào?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang tính gia tốc của vật bị kéo.' }, { role: 'assistant', content: 'Trước hết hãy viết tổng các lực theo chiều chuyển động.' }],
        }),
        make('ask_follow_up', () => 'Vậy điện trở có đổi khi tăng điện áp không?', 'follow_up', {
          history: [{ role: 'user', content: 'Em vừa dùng định luật Ôm cho dây dẫn ở nhiệt độ không đổi.' }, { role: 'assistant', content: 'Em đã tính được cường độ dòng điện.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Đề bài điện này thiếu một đại lượng, em cần hỏi lại gì?', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'Em có bài cơ học nhưng chưa rõ vật đang chuyển động kiểu nào.', 'ambiguous', { clarify: true }),
      ],
    },
  },
  CHEMISTRY: {
    train: {
      standard: [
        make('solve_problem', () => 'Cân bằng phương trình phản ứng: Fe + O₂ → Fe₂O₃.'),
        make('explain_concept', () => 'Giải thích vì sao phải bảo toàn số nguyên tử khi cân bằng phương trình hóa học.'),
        make('solve_problem', n => `Tính số mol của ${n * 9 + 18} g nước, biết M(H₂O) = 18 g/mol.`),
        make('check_answer', () => 'Em nói dung dịch có pH = 2 là bazơ, đúng không?'),
        make('give_hint', () => 'Gợi ý cách nhận biết khí CO₂ trong thí nghiệm.'),
        make('diagnose_error', () => 'Em viết Na + Cl₂ → NaCl₂, em sai ở điểm nào?'),
        make('solve_problem', n => `Pha ${n + 2} mol NaCl vào ${n + 1} lít dung dịch. Tính nồng độ mol/lít.`),
        make('explain_concept', () => 'Vì sao kim loại hoạt động mạnh thường phản ứng với axit?'),
        make('solve_problem', () => 'Cho 0,5 mol O₂. Tính thể tích khí ở điều kiện tiêu chuẩn theo 22,4 lít/mol.'),
      ],
      typo: [
        make('solve_problem', () => 'can bang pthh Al + O2 ra Al2O3', 'typo'),
        make('explain_concept', () => 'tai sao axit lam quy tim doi mau', 'typo'),
        make('diagnose_error', () => 'em tinh so mol bi sai don vi o dau?', 'typo'),
        make('check_answer', () => 'dd pH 12 la axit hay bazo?', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'Cách cb PTHH KMnO₄ nhiệt phân thế nào?', 'abbreviation'),
        make('explain_concept', () => 'CT tính CM của dd là gì?', 'abbreviation'),
        make('give_hint', () => 'Gợi ý phân biệt dd HCl và NaOH.', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Vậy em đặt hệ số trước chất nào đầu tiên?', 'follow_up', {
          history: [{ role: 'user', content: 'Em cần cân bằng phương trình Fe + O₂ → Fe₂O₃.' }, { role: 'assistant', content: 'Hãy đếm số nguyên tử của từng nguyên tố ở hai vế.' }],
        }),
        make('ask_follow_up', () => 'Nếu khối lượng cho bằng gam thì em đổi sang mol thế nào?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang tính lượng chất trong một phản ứng.' }, { role: 'assistant', content: 'Em cần dùng liên hệ giữa khối lượng, mol và khối lượng mol.' }],
        }),
        make('ask_follow_up', () => 'Sau khi thử quỳ tím, em kết luận như thế nào?', 'follow_up', {
          history: [{ role: 'user', content: 'Em cần nhận biết một dung dịch axit và một dung dịch bazơ.' }, { role: 'assistant', content: 'Em có thể dùng chất chỉ thị màu.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Em có một PTHH nhưng không biết cần cân bằng hay tính mol.', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'Bài dung dịch này thiếu dữ kiện, em cần hỏi gì?', 'ambiguous', { clarify: true }),
      ],
    },
    test: {
      standard: [
        make('solve_problem', () => 'Cân bằng phương trình: Al + HCl → AlCl₃ + H₂.'),
        make('solve_problem', () => 'Tính số mol của 44 g CO₂, biết M(CO₂) = 44 g/mol.'),
        make('explain_concept', () => 'Phân biệt hiện tượng vật lý và hiện tượng hóa học.'),
        make('give_hint', () => 'Gợi ý cho em cách tính nồng độ phần trăm của dung dịch.'),
        make('check_answer', () => 'Em kết luận quỳ tím hóa đỏ là dung dịch bazơ, có đúng không?'),
        make('solve_problem', () => 'Cho 0,25 mol H₂SO₄. Tính số mol nguyên tử H có trong lượng chất này.'),
        make('diagnose_error', () => 'Em viết phản ứng CaCO₃ + HCl tạo ra CaCl, em sai ở đâu?'),
        make('solve_problem', () => 'Hòa tan 5,85 g NaCl vào nước để được 500 ml dung dịch. Tính CM.'),
        make('explain_concept', () => 'Vì sao không được đổ nước vào axit đặc?'),
        make('solve_problem', () => 'Đốt cháy 2 mol H₂ cần bao nhiêu mol O₂ theo phương trình 2H₂ + O₂ → 2H₂O?'),
      ],
      typo: [
        make('solve_problem', () => 'tinh so mol cua 36g nuoc nhu the nao', 'typo'),
        make('give_hint', () => 'em ko biet can bang pthh', 'typo'),
        make('check_answer', () => 'pH=7 co phai axit ko?', 'typo'),
      ],
      abbreviation: [
        make('solve_problem', () => 'Hướng dẫn tính CM của dd NaCl.', 'abbreviation'),
        make('explain_concept', () => 'PTHH có ý nghĩa gì trong bài mol?', 'abbreviation'),
      ],
      followUp: [
        make('ask_follow_up', () => 'Sau khi cân bằng xong, em lấy tỉ lệ mol ở đâu?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang giải bài theo phương trình hóa học.' }, { role: 'assistant', content: 'Trước hết em cần cân bằng phương trình phản ứng.' }],
        }),
        make('ask_follow_up', () => 'Vậy số mol chất tan và số mol dung môi có giống nhau không?', 'follow_up', {
          history: [{ role: 'user', content: 'Em đang học nồng độ dung dịch.' }, { role: 'assistant', content: 'Em cần phân biệt chất tan, dung môi và dung dịch.' }],
        }),
        make('ask_follow_up', () => 'Nếu quỳ tím không đổi màu thì em kết luận gì?', 'follow_up', {
          history: [{ role: 'user', content: 'Em dùng quỳ tím để nhận biết dung dịch.' }, { role: 'assistant', content: 'Hãy quan sát màu quỳ trước và sau khi thử.' }],
        }),
      ],
      ambiguous: [
        make('ask_follow_up', () => 'Em có bài hóa về dung dịch nhưng không rõ cần tính đại lượng nào.', 'ambiguous', { clarify: true }),
        make('ask_follow_up', () => 'PTHH em chép chưa đủ chất, giờ em nên làm gì?', 'ambiguous', { clarify: true }),
      ],
    },
  },
};

const caseFrom = (subject, split, index, seed, variant = 0) => {
  const question = typeof seed.question === 'function' ? seed.question(index + variant) : seed.question;
  const history = seed.history || [];
  return {
    id: `${split.toLowerCase()}-${subject.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
    split,
    question,
    gold_subject: subject,
    gold_intent: seed.intent,
    gold_need_clarification: Boolean(seed.clarify),
    challenge_type: seed.challenge,
    previous_subject: history.length ? subject : undefined,
    history,
    messages: [{ role: 'user', content: question }],
    provenance: 'synthetic_template_v1',
  };
};

const materialize = (subject, split) => {
  const spec = subjectDefinitions[subject][split];
  const cases = [];
  const add = (seed, variant = 0) => cases.push(caseFrom(subject, split.toUpperCase(), cases.length, seed, variant));
  if (split === 'train') {
    spec.standard.forEach((seed, index) => { add(seed, index); add(seed, index + 10); }); // 18
    spec.typo.forEach(add); // 4
    spec.abbreviation.forEach(add); // 3
    spec.followUp.forEach(add); // 3
    spec.ambiguous.forEach(add); // 2
  } else {
    spec.standard.forEach(add); // 10
    spec.typo.forEach(add); // 3
    spec.abbreviation.forEach(add); // 2
    spec.followUp.forEach(add); // 3
    spec.ambiguous.forEach(add); // 2
  }
  return cases;
};

const trainCases = Object.keys(subjectDefinitions).flatMap(subject => materialize(subject, 'train'));
const testCases = Object.keys(subjectDefinitions).flatMap(subject => materialize(subject, 'test'));
const normalized = value => value.question.toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const trainQuestions = new Set(trainCases.map(normalized));
const overlap = testCases.filter(item => trainQuestions.has(normalized(item)));
if (overlap.length) throw new Error(`Train/test question leakage: ${overlap.map(item => item.id).join(', ')}`);

const countBy = (cases, field) => cases.reduce((result, item) => {
  const key = String(item[field]);
  result[key] = (result[key] || 0) + 1;
  return result;
}, {});

const wrap = (role, cases) => ({
  schema_version: 'router_dataset_v1',
  dataset_role: role,
  provenance: {
    source: 'synthetic_template_v1',
    warning: 'Synthetic data for functional testing/calibration. Review labels and replace or extend with independently authored data before final research claims.',
  },
  case_count: cases.length,
  subject_distribution: countBy(cases, 'gold_subject'),
  challenge_distribution: countBy(cases, 'challenge_type'),
  cases,
});

const specialistSystemPrompt = 'Bạn là gia sư Socratic bằng tiếng Việt. Không đưa ngay đáp án hoàn chỉnh; hãy kiểm tra dữ kiện, gợi ý một bước vừa đủ và hỏi học sinh tự thực hiện bước tiếp theo.';
const specialistBlueprints = {
  MATH: [
    ['phương trình bậc nhất', n => `Giải phương trình ${n + 2}x + ${n + 1} = ${3 * n + 11}.`, 'cô lập hạng tử chứa x'],
    ['phương trình bậc hai', n => `Tìm nghiệm của x² - ${n + 5}x + ${n + 4} = 0.`, 'phân tích biểu thức thành nhân tử hoặc tính biệt thức'],
    ['phân thức', n => `Rút gọn phân thức (${n + 2}x)/(x + ${n + 2}).`, 'xác định nhân tử chung và điều kiện của mẫu'],
    ['phần trăm', n => `Một sản phẩm giá ${n * 10000 + 120000} đồng giảm ${n % 15 + 5}%. Hãy tính giá sau giảm.`, 'tính phần trăm của giá gốc trước'],
    ['hình học tam giác', n => `Tam giác có đáy ${n + 6} cm và chiều cao ${n + 3} cm. Tính diện tích.`, 'xác định công thức diện tích phù hợp'],
    ['hệ phương trình', n => `Giải hệ x + y = ${n + 9}; x - y = ${n + 1}.`, 'cộng hoặc trừ hai phương trình để khử một ẩn'],
    ['hàm số', n => `Xét hàm số y = ${n % 5 + 1}x - ${n + 2}. Hàm số đồng biến hay nghịch biến?`, 'quan sát hệ số của x'],
    ['xác suất', n => `Gieo một xúc xắc. Xác suất nhận được số lớn hơn ${n % 4 + 2} là bao nhiêu?`, 'liệt kê số kết quả thuận lợi và số kết quả có thể'],
    ['định lý Pythagore', n => `Một tam giác vuông có hai cạnh góc vuông ${n + 3} cm và ${n + 4} cm. Tính cạnh huyền.`, 'viết hệ thức giữa bình phương ba cạnh'],
    ['bất phương trình', n => `Giải bất phương trình ${n + 2}x - ${n + 4} > ${2 * n + 3}.`, 'chuyển hằng số về một vế và lưu ý dấu khi chia'],
  ],
  PHYSICS: [
    ['chuyển động đều', n => `Một xe đi ${n * 8 + 40} km trong ${n % 4 + 2} giờ. Tính vận tốc trung bình.`, 'xác định quãng đường và thời gian cùng hệ đơn vị'],
    ['định luật II Newton', n => `Vật khối lượng ${n % 6 + 2} kg chịu lực ${n * 2 + 12} N. Bỏ qua ma sát, tính gia tốc.`, 'viết mối liên hệ giữa lực, khối lượng và gia tốc'],
    ['định luật Ôm', n => `Mạch có hiệu điện thế ${n % 12 + 6} V và điện trở ${n % 8 + 2} Ω. Tính cường độ dòng điện.`, 'xác định ba đại lượng trong định luật Ôm'],
    ['công cơ học', n => `Một lực ${n * 2 + 10} N kéo vật đi ${n + 3} m theo phương của lực. Tính công.`, 'xác định góc giữa lực và chuyển dời'],
    ['công suất điện', n => `Bóng đèn dùng hiệu điện thế ${n % 12 + 6} V và dòng điện ${n % 4 + 1} A. Tính công suất.`, 'xác định hai đại lượng cần nhân với nhau'],
    ['trọng lượng', n => `Một vật có khối lượng ${n % 7 + 1} kg. Lấy g = 10 m/s². Tính trọng lượng.`, 'phân biệt khối lượng và trọng lượng'],
    ['rơi tự do', n => `Vật rơi tự do trong ${n % 4 + 2} giây, lấy g = 10 m/s². Hãy tìm vận tốc cuối.`, 'chọn công thức có thời gian và gia tốc'],
    ['áp suất', n => `Lực ${n * 10 + 50} N tác dụng lên diện tích ${n % 5 + 1} m². Tính áp suất.`, 'xác định tỉ số giữa lực và diện tích'],
    ['nhiệt học', n => `Đun ${n % 4 + 1} kg nước tăng ${n % 20 + 10}°C. Em cần xác định đại lượng nào để tính nhiệt lượng?`, 'liệt kê khối lượng, nhiệt dung riêng và độ tăng nhiệt độ'],
    ['thấu kính', n => `Một vật đặt trước thấu kính hội tụ có tiêu cự ${n % 8 + 4} cm. Em bắt đầu dựng ảnh như thế nào?`, 'vẽ trục chính và các tia đặc biệt'],
  ],
  CHEMISTRY: [
    ['cân bằng phương trình', n => `Cân bằng phương trình: ${n % 2 ? 'Al + O₂ → Al₂O₃' : 'Fe + O₂ → Fe₂O₃'}.`, 'đếm số nguyên tử của từng nguyên tố ở hai vế'],
    ['số mol', n => `Tính số mol của ${(n % 5 + 1) * 18} g H₂O, biết M(H₂O) = 18 g/mol.`, 'liên hệ khối lượng, khối lượng mol và số mol'],
    ['nồng độ mol', n => `Hòa tan ${n % 4 + 1} mol NaCl để được ${n % 3 + 1} lít dung dịch. Tính nồng độ mol.`, 'xác định số mol chất tan và thể tích dung dịch'],
    ['pH', n => `Dung dịch có pH = ${n % 5 + 1}. Hãy nhận xét môi trường của dung dịch.`, 'so sánh pH với 7'],
    ['thể tích khí', n => `Có ${n % 4 + 1} mol O₂ ở điều kiện tiêu chuẩn. Tính thể tích khí.`, 'dùng thể tích mol khí ở điều kiện tiêu chuẩn'],
    ['tỉ khối', n => `Khí A có khối lượng mol ${n * 2 + 20} g/mol. Em bắt đầu so sánh tỉ khối với H₂ thế nào?`, 'xác định hai khối lượng mol cần so sánh'],
    ['axit-bazơ', n => `Làm thế nào nhận biết dung dịch HCl và NaOH bằng quỳ tím ở lần thử ${n + 1}?`, 'dự đoán màu của chất chỉ thị trong từng môi trường'],
    ['bảo toàn khối lượng', n => `Phản ứng tạo ra ${n * 5 + 20} g sản phẩm. Em cần dùng định luật nào để tìm khối lượng chất tham gia?`, 'xét tổng khối lượng trước và sau phản ứng'],
    ['kim loại và axit', n => `Cho ${n % 5 + 1} mol Zn phản ứng với HCl dư. Em lập tỉ lệ mol H₂ như thế nào?`, 'cân bằng phương trình rồi đọc hệ số mol'],
    ['công thức hóa học', n => `Em viết công thức của canxi clorua là CaCl${n % 2 ? '' : '₂'}. Hãy kiểm tra hóa trị trước.`, 'xác định hóa trị của ion canxi và clorua'],
  ],
};

const responseOpeners = [
  'Em hãy thử xác định',
  'Trước hết, em kiểm tra',
  'Đừng vội tính ngay; em hãy tìm',
  'Ta bắt đầu bằng cách xác định',
  'Em có thể viết ra',
];
const makeSpecialistTraining = subject => {
  const blueprints = specialistBlueprints[subject];
  return Array.from({ length: 200 }, (_, index) => {
    const [topic, questionFactory, firstStep] = blueprints[index % blueprints.length];
    const variation = Math.floor(index / blueprints.length) + 1;
    const question = questionFactory(index + variation * 10);
    const opener = responseOpeners[index % responseOpeners.length];
    const assistant = `${opener} dữ kiện thuộc chủ đề ${topic}. ${firstStep.charAt(0).toUpperCase()}${firstStep.slice(1)}. Em thử nêu bước đầu tiên hoặc công thức em định dùng được không?`;
    return {
      id: `sft-${subject.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
      subject,
      difficulty: ['basic', 'intermediate', 'applied'][index % 3],
      provenance: 'synthetic_template_v1',
      messages: [
        { role: 'system', content: specialistSystemPrompt },
        { role: 'user', content: question },
        { role: 'assistant', content: assistant },
      ],
    };
  });
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'router_train_v1.json'), JSON.stringify(wrap('router_calibration_train', trainCases), null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'router_test_v1.json'), JSON.stringify(wrap('router_heldout_benchmark_test', testCases), null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'router_dataset_manifest_v1.json'), JSON.stringify({
  schema_version: 'router_dataset_v1',
  train_case_count: trainCases.length,
  test_case_count: testCases.length,
  train_subject_distribution: countBy(trainCases, 'gold_subject'),
  test_subject_distribution: countBy(testCases, 'gold_subject'),
  test_challenge_distribution: countBy(testCases, 'challenge_type'),
  train_test_exact_question_overlap: overlap.length,
  recommended_protocol: 'Do not tune thresholds on router_test_v1.json. Use router_train_v1.json for calibration and keep router_test_v1.json held out until final benchmark.',
}, null, 2), 'utf8');
const specialistManifest = {
  schema_version: 'specialist_sft_v1',
  provenance: 'synthetic_template_v1',
  warning: 'These are synthetic Socratic SFT drafts. Subject teachers should review content and add independently authored examples before final training or research claims.',
  files: {},
};
for (const subject of Object.keys(subjectDefinitions)) {
  const samples = makeSpecialistTraining(subject);
  const fileName = `specialist_${subject.toLowerCase()}_train_v1.json`;
  fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(samples, null, 2), 'utf8');
  specialistManifest.files[subject] = { file: fileName, case_count: samples.length };
}
const generalSamples = Object.keys(subjectDefinitions).flatMap(subject => makeSpecialistTraining(subject));
fs.writeFileSync(path.join(outputDir, 'general_tutor_train_v1.json'), JSON.stringify(generalSamples, null, 2), 'utf8');
specialistManifest.files.GENERAL = {
  file: 'general_tutor_train_v1.json',
  case_count: generalSamples.length,
  description: 'Balanced pooled baseline: 200 MATH + 200 PHYSICS + 200 CHEMISTRY samples.',
};
fs.writeFileSync(path.join(outputDir, 'specialist_training_manifest_v1.json'), JSON.stringify(specialistManifest, null, 2), 'utf8');

console.log(JSON.stringify({ router_train: trainCases.length, router_test: testCases.length, specialist_train_per_subject: 200, general_train: generalSamples.length, overlap: overlap.length, outputDir }, null, 2));
