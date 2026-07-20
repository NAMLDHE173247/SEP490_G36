"""Generate separated English, Math and History datasets for SEP490.

The generated files are synthetic development/evaluation data. They are useful
for pipeline validation, but must not be presented as real student data.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "datasets"
SYSTEM = {
    "ENGLISH": (
        "Bạn là gia sư Socratic môn Tiếng Anh. Không đưa ngay đáp án hoàn chỉnh; "
        "hãy gợi ý một bước, hỏi học sinh tự suy luận và sửa lỗi nhẹ nhàng."
    ),
    "MATH": (
        "Bạn là gia sư Socratic môn Toán. Không đưa ngay đáp án hoàn chỉnh; "
        "hãy kiểm tra dữ kiện, gợi ý một bước và hỏi học sinh tự thực hiện bước tiếp theo."
    ),
    "HISTORY": (
        "Bạn là gia sư Socratic môn Lịch sử. Không học thuộc máy móc; hãy hướng học sinh "
        "đọc mốc thời gian, nguyên nhân, diễn biến và hệ quả trước khi kết luận."
    ),
}

GENERAL_SYSTEM = (
    "Bạn là gia sư Socratic đa môn cho Tiếng Anh, Toán và Lịch sử. "
    "Hãy xác định đúng ngữ cảnh môn học, không đưa ngay đáp án hoàn chỉnh; "
    "gợi ý một bước phù hợp và hỏi học sinh tự suy luận tiếp."
)

SOCRATIC_OPENINGS = [
    "Trước hết, ",
    "Mình chưa cần chốt đáp án ngay. ",
    "Ta tách bài này thành một bước nhỏ: ",
    "Em hãy quan sát dữ kiện chính trước. ",
    "Thử kiểm tra lại dấu hiệu quan trọng: ",
    "Để tự tìm ra câu trả lời, em có thể bắt đầu như sau: ",
    "Mình cùng kiểm tra từng ý nhé. ",
    "Bước đầu tiên là nhận diện quy tắc phù hợp. ",
    "Em khoan tính hoặc kết luận vội. ",
    "Hãy dùng thông tin trong đề để suy luận: ",
]

SOCRATIC_CLOSINGS = {
    "ENGLISH": [
        "Dấu hiệu ngôn ngữ nào giúp em chọn quy tắc đó?",
        "Em thử sửa riêng phần động từ trước được không?",
        "Nếu đặt câu này vào một ngữ cảnh khác, em sẽ dùng cấu trúc nào?",
        "Em có thể tạo thêm một câu tương tự để tự kiểm tra không?",
        "Từ hoặc cụm từ nào trong câu quyết định đáp án của em?",
        "Em thử đọc lại câu và chỉ ra chỗ chưa tự nhiên nhé.",
        "Giữa hai lựa chọn, quy tắc nào loại được một phương án?",
        "Em hãy viết bản sửa đầu tiên, rồi mình kiểm tra tiếp.",
        "Ý nghĩa em muốn diễn đạt xảy ra ở thời điểm nào?",
        "Em chọn đáp án nào và giải thích bằng một quy tắc ngắn nhé.",
    ],
    "MATH": [
        "Em sẽ viết phép biến đổi đầu tiên như thế nào?",
        "Đại lượng nào cần tìm và dữ kiện nào liên hệ trực tiếp với nó?",
        "Em thử thay dữ kiện vào công thức nhưng chưa tính kết quả nhé.",
        "Bước nào giúp cô lập ẩn số nhanh nhất?",
        "Em có thể kiểm tra điều kiện hoặc đơn vị trước không?",
        "Nếu gọi ẩn là x, em sẽ lập quan hệ nào?",
        "Em thử tính riêng phần đơn giản nhất trước nhé.",
        "Công thức nào phù hợp và vì sao em chọn công thức đó?",
        "Em dự đoán dấu hoặc khoảng giá trị của kết quả trước được không?",
        "Hãy làm một bước rồi gửi lại để mình kiểm tra tiếp.",
    ],
    "HISTORY": [
        "Em thử đặt sự kiện này lên dòng thời gian trước nhé.",
        "Theo em đâu là nguyên nhân lâu dài và đâu là nguyên nhân trực tiếp?",
        "Chi tiết nào trong nguồn có thể dùng làm bằng chứng?",
        "Em hãy nêu một hệ quả chính trước, rồi mới mở rộng.",
        "Nếu so sánh hai sự kiện, em sẽ chọn cùng tiêu chí nào?",
        "Nhân vật, thời điểm và bối cảnh nào cần xác định trước?",
        "Em thử phân biệt diễn biến với ý nghĩa lịch sử nhé.",
        "Nguồn này do ai tạo ra và có thể mang góc nhìn nào?",
        "Mốc thời gian nào giúp em loại một phương án sai?",
        "Em hãy đưa ra kết luận ngắn kèm một bằng chứng lịch sử.",
    ],
}


TEMPLATES = {
    "ENGLISH": [
        ("Why do we use the present continuous in: 'She is reading now'?", "explain_concept", "Look for the time signal 'now' and compare an action happening now with a routine."),
        ("Choose the correct form: 'My brother ___ football every Sunday.'", "solve_problem", "The phrase 'every Sunday' describes a repeated habit; identify the tense used for habits."),
        ("When should I use 'did' instead of 'have done' in a question?", "explain_concept", "Compare a finished time in the past with an experience connected to the present."),
        ("Is it 'a university' or 'an university'? Explain why.", "check_answer", "Say the word aloud and listen to the initial sound, not only the written letter."),
        ("Correct this sentence: 'There are much water in the bottle.'", "diagnose_error", "Decide whether 'water' can be counted as individual items in this sentence."),
        ("How can I change 'People speak English here' into the passive voice?", "give_hint", "Find the object of the active sentence and use the correct form of 'be' plus the past participle."),
        ("What is the difference between 'must' and 'should' when giving advice?", "explain_concept", "Compare a strong obligation with a recommendation."),
        ("Change this sentence into reported speech: Lan said, 'I am tired.'", "solve_problem", "First identify the reporting verb and then check whether the tense needs to move back."),
        ("Complete: 'If I had more time, I ___ another language.'", "solve_problem", "This sentence describes an unreal present situation; identify the conditional pattern."),
        ("Which relative pronoun fits: 'The book ___ I borrowed is useful.'", "check_answer", "The missing word refers to an object, so compare the object relative pronouns."),
        ("Give me a synonym for 'important' and explain the difference in tone.", "give_hint", "Think of a neutral synonym first, then one that is stronger or more formal."),
        ("What does the phrasal verb 'look after' mean in a school context?", "explain_concept", "Separate the verb from the particle and use the surrounding context to infer the meaning."),
        ("How do I pronounce the -ed ending in 'watched' and 'played'?", "explain_concept", "Listen to the final sound before -ed: voiceless sounds often differ from voiced sounds."),
        ("Help me write a short paragraph about my favourite subject.", "give_hint", "Start with a topic sentence, add one reason and finish with a supporting example."),
        ("In a reading passage, how do I find the main idea quickly?", "give_hint", "Compare the title, repeated words and the first sentence of each paragraph."),
        ("I wrote 'She go to school by bus.' What exactly is wrong?", "diagnose_error", "The subject is third-person singular in the present simple; check the verb ending."),
        ("Should this sentence use 'since' or 'for': 'I have lived here ___ 2020'?", "check_answer", "One word is used with a starting point and the other with a duration."),
        ("Is 'more easier' correct? Please explain.", "check_answer", "Check whether the adjective already has a comparative form."),
        ("Translate 'Tôi đã học tiếng Anh được ba năm' into natural English.", "solve_problem", "The action started in the past and continues now; choose a tense that expresses duration."),
        ("How can I make my English answer sound more polite to a teacher?", "give_hint", "Use a modal or a softening phrase instead of a direct command."),
    ],
    "MATH": [
        ("Solve the equation {a}x - {b} = {c}.", "solve_problem", "Move the constant first, then divide by the coefficient of x."),
        ("Find the roots of x² - {s}x + {p} = 0.", "solve_problem", "Look for two numbers whose sum is the middle coefficient and whose product is the constant."),
        ("Solve the system x + y = {s}; x - y = {d}.", "solve_problem", "Add the two equations to eliminate one variable."),
        ("What is {n}% of {m}? Show me the first step.", "give_hint", "Convert the percentage to a fraction or decimal before multiplying."),
        ("A triangle has base {b} cm and height {h} cm. Find its area.", "solve_problem", "Recall the triangle-area formula and identify the two given measurements."),
        ("Is the function y = {k}x + {q} increasing or decreasing?", "check_answer", "The sign of the coefficient of x determines the direction of a linear function."),
        ("A fair die is rolled once. What is the probability of getting a number greater than {cut} ?", "solve_problem", "Count the favourable outcomes and divide by the total number of outcomes."),
        ("A right triangle has legs {u} cm and {v} cm. How do I find the hypotenuse?", "give_hint", "Use the Pythagorean theorem and identify which side is opposite the right angle."),
        ("Why must we change the inequality sign when multiplying by a negative number?", "explain_concept", "Think about the order of two negative numbers on the number line."),
        ("Differentiate f(x) = {k}x² + {q}x.", "solve_problem", "Apply the power rule to each term separately."),
        ("Find the integral of {k}x from 0 to {n}.", "solve_problem", "Find an antiderivative first, then substitute the two limits."),
        ("What is the next term after {a}, {b}, {c} in this arithmetic sequence?", "solve_problem", "Compare consecutive differences before predicting the next term."),
        ("Solve the inequality {a}x + {b} > {c}.", "solve_problem", "Isolate x and check whether the final division uses a positive or negative number."),
        ("Find the distance between A(0, 0) and B({x}, {y}).", "give_hint", "Use the horizontal and vertical differences in the distance formula."),
        ("The scores are {a}, {b}, {c}, and {d}. Find their mean.", "solve_problem", "Add all observations and divide by the number of observations."),
        ("Simplify 2^{n} × 2^{m}.", "explain_concept", "When multiplying powers with the same base, compare the exponents."),
        ("Why is log base 10 of 100 equal to 2?", "explain_concept", "Rewrite the logarithm as an exponential statement."),
        ("A car travels {distance} km in {hours} hours. Find its average speed.", "solve_problem", "Average speed is total distance divided by total time."),
        ("A circle has radius {r} cm. What formula gives its area?", "give_hint", "Identify the radius and recall the area formula involving π."),
        ("How many ways can we choose 2 objects from {n} objects?", "solve_problem", "Because order does not matter, use a combination rather than a permutation."),
    ],
    "HISTORY": [
        ("What were the main causes of the August Revolution in Vietnam?", "explain_concept", "Separate long-term causes from the immediate political opportunity in 1945."),
        ("Why is the victory on the Bach Dang River associated with Ngo Quyen?", "explain_concept", "Identify the leader, the opponent and the tactic involving the river tide."),
        ("Arrange the Ly, Tran and Le dynasties in chronological order.", "solve_problem", "Place the dynasties on a simple timeline before recalling details."),
        ("What was the significance of the Dien Bien Phu victory?", "explain_concept", "Connect the military result with the diplomatic outcome and the end of French colonial rule."),
        ("How did the Lam Son uprising gain support?", "explain_concept", "Look at local leadership, the social base and the response to Ming occupation."),
        ("Who led the Tay Son movement and what problem did it address?", "check_answer", "Distinguish the main leaders from the wider social and political context."),
        ("What is the difference between a primary and a secondary historical source?", "explain_concept", "Ask when the source was produced and how directly it relates to the event."),
        ("How should I analyse bias in a historical document?", "give_hint", "Check the author, intended audience, purpose and what information is omitted."),
        ("What were two consequences of the Industrial Revolution?", "give_hint", "Consider both economic production and changes in urban society."),
        ("Why did World War I begin?", "explain_concept", "Separate the long-term tensions from the immediate trigger."),
        ("Compare the goals of the French Revolution and the American Revolution.", "give_hint", "Compare political rights, colonial independence and the groups leading each movement."),
        ("What was the role of the Geneva Accords for Vietnam?", "explain_concept", "Identify the conflict they followed and the political arrangement they created."),
        ("Why was the Doi Moi policy introduced in Vietnam?", "explain_concept", "Relate the policy to economic difficulties and the need for reform after 1975."),
        ("What is the difference between a cause and a consequence in history?", "explain_concept", "A cause helps explain why an event happened; a consequence describes what followed."),
        ("How do I write a chronological paragraph about a war?", "give_hint", "Use dates as anchors and connect each event with a clear transition."),
        ("I wrote that the August Revolution happened in 1954. Is that correct?", "diagnose_error", "Check the date against the event associated with the end of the First Indochina War."),
        ("Which event happened first: the August Revolution or Dien Bien Phu?", "check_answer", "Place both dates on a timeline before deciding."),
        ("Why did the Cold War remain 'cold' between the United States and the Soviet Union?", "explain_concept", "Consider deterrence, alliances and indirect conflicts rather than a direct total war."),
        ("How can I compare two historical leaders fairly?", "give_hint", "Use the same criteria: context, aims, methods and consequences."),
        ("How do historians decide whether a source is reliable?", "give_hint", "Cross-check authorship, date, purpose and the source against independent evidence."),
    ],
}

# The subject can be English, but the training conversation remains Vietnamese.
# English examples are kept inside quotation marks so the tutor learns the target
# language content without mixing languages in its instructional explanation.
TEMPLATES_VI = {
    "ENGLISH": [
        ("Vì sao dùng thì hiện tại tiếp diễn trong câu 'She is reading now'?", "explain_concept", "Em hãy chú ý dấu hiệu thời gian 'now' và so sánh hành động đang xảy ra với thói quen."),
        ("Chọn dạng đúng: 'My brother ___ football every Sunday.'", "solve_problem", "Cụm 'every Sunday' diễn tả thói quen lặp lại; em hãy xác định thì dùng cho thói quen."),
        ("Khi nào dùng 'did' thay vì 'have done' trong câu hỏi?", "explain_concept", "Hãy so sánh một thời điểm đã kết thúc trong quá khứ với trải nghiệm còn liên quan đến hiện tại."),
        ("Nên dùng 'a university' hay 'an university'? Vì sao?", "check_answer", "Em hãy đọc âm đầu của từ thay vì chỉ nhìn chữ cái đầu tiên."),
        ("Sửa câu 'There are much water in the bottle.' giúp em.", "diagnose_error", "Em hãy xem 'water' trong câu này là danh từ đếm được hay không đếm được."),
        ("Đổi câu 'People speak English here' sang câu bị động như thế nào?", "give_hint", "Tìm tân ngữ của câu chủ động rồi dùng dạng phù hợp của 'be' với quá khứ phân từ."),
        ("'Must' và 'should' khác nhau thế nào khi đưa lời khuyên?", "explain_concept", "Hãy so sánh nghĩa vụ bắt buộc với một lời khuyên hoặc đề xuất."),
        ("Đổi câu Lan said, 'I am tired.' sang câu tường thuật.", "solve_problem", "Xác định động từ tường thuật trước, sau đó kiểm tra việc lùi thì."),
        ("Hoàn thành câu 'If I had more time, I ___ another language.'", "solve_problem", "Câu này diễn tả tình huống không có thật ở hiện tại; em hãy nhận diện mẫu câu điều kiện."),
        ("Chọn đại từ quan hệ cho câu 'The book ___ I borrowed is useful.'", "check_answer", "Từ còn thiếu thay cho một đồ vật; hãy so sánh các đại từ quan hệ làm tân ngữ."),
        ("Cho em một từ đồng nghĩa với 'important' và giải thích sắc thái.", "give_hint", "Hãy nghĩ đến một từ trung tính trước, sau đó thử một từ mạnh hơn hoặc trang trọng hơn."),
        ("Cụm động từ 'look after' nghĩa là gì trong ngữ cảnh trường học?", "explain_concept", "Tách động từ và tiểu từ, sau đó dùng ngữ cảnh xung quanh để suy ra nghĩa."),
        ("Phát âm đuôi -ed trong 'watched' và 'played' như thế nào?", "explain_concept", "Hãy chú ý âm cuối đứng trước -ed; âm vô thanh và hữu thanh có thể tạo cách đọc khác nhau."),
        ("Giúp em viết một đoạn văn ngắn về môn học yêu thích.", "give_hint", "Bắt đầu bằng câu chủ đề, thêm một lý do và kết thúc bằng ví dụ hỗ trợ."),
        ("Trong bài đọc, làm sao tìm ý chính nhanh hơn?", "give_hint", "So sánh tiêu đề, các từ lặp lại và câu đầu của mỗi đoạn."),
        ("Em viết 'She go to school by bus.' Sai chính xác ở đâu?", "diagnose_error", "Chủ ngữ là ngôi thứ ba số ít ở thì hiện tại đơn; hãy kiểm tra đuôi của động từ."),
        ("Câu 'I have lived here ___ 2020' dùng 'since' hay 'for'?", "check_answer", "Một từ đi với mốc bắt đầu, còn từ kia đi với khoảng thời gian kéo dài."),
        ("'More easier' có đúng không? Giải thích giúp em.", "check_answer", "Kiểm tra xem tính từ này đã có dạng so sánh hơn riêng hay chưa."),
        ("Dịch câu 'Tôi đã học tiếng Anh được ba năm' sang tiếng Anh tự nhiên.", "solve_problem", "Hành động bắt đầu trong quá khứ và vẫn tiếp diễn; hãy chọn thì diễn tả khoảng thời gian đó."),
        ("Làm sao để câu trả lời tiếng Anh của em lịch sự hơn khi nói với giáo viên?", "give_hint", "Dùng động từ khuyết thiếu hoặc cụm làm mềm câu thay vì một mệnh lệnh trực tiếp."),
    ],
    "MATH": [
        ("Giải phương trình {a}x - {b} = {c}.", "solve_problem", "Chuyển hằng số trước, sau đó chia cho hệ số của x."),
        ("Tìm nghiệm của phương trình x² - {s}x + {p} = 0.", "solve_problem", "Tìm hai số có tổng bằng hệ số giữa và tích bằng hằng số tự do."),
        ("Giải hệ x + y = {s}; x - y = {d}.", "solve_problem", "Cộng hai phương trình để khử một ẩn."),
        ("{n}% của {m} bằng bao nhiêu? Hãy cho em bước đầu tiên.", "give_hint", "Đổi phần trăm thành phân số hoặc số thập phân trước khi nhân."),
        ("Một tam giác có đáy {b} cm và chiều cao {h} cm. Tính diện tích.", "solve_problem", "Nhớ lại công thức diện tích tam giác và xác định hai đại lượng đã cho."),
        ("Hàm số y = {k}x + {q} đồng biến hay nghịch biến?", "check_answer", "Dấu của hệ số x quyết định chiều biến thiên của hàm số bậc nhất."),
        ("Gieo một con xúc xắc công bằng. Xác suất nhận số lớn hơn {cut} là bao nhiêu?", "solve_problem", "Đếm số kết quả thuận lợi rồi chia cho tổng số kết quả có thể xảy ra."),
        ("Tam giác vuông có hai cạnh góc vuông {u} cm và {v} cm. Tìm cạnh huyền như thế nào?", "give_hint", "Dùng định lý Pythagore và xác định cạnh đối diện góc vuông."),
        ("Vì sao phải đổi chiều dấu bất phương trình khi nhân với số âm?", "explain_concept", "Hãy suy nghĩ về thứ tự của hai số âm trên trục số."),
        ("Tính đạo hàm f(x) = {k}x² + {q}x.", "solve_problem", "Áp dụng quy tắc đạo hàm lũy thừa cho từng hạng tử."),
        ("Tính tích phân của {k}x từ 0 đến {n}.", "solve_problem", "Tìm một nguyên hàm trước, sau đó thay hai cận vào."),
        ("Số hạng tiếp theo của cấp số cộng {a}, {b}, {c} là gì?", "solve_problem", "So sánh hiệu của hai số hạng liên tiếp trước khi dự đoán số tiếp theo."),
        ("Giải bất phương trình {a}x + {b} > {c}.", "solve_problem", "Cô lập x và kiểm tra phép chia cuối cùng cho số dương hay số âm."),
        ("Tìm khoảng cách giữa A(0, 0) và B({x}, {y}).", "give_hint", "Dùng độ chênh lệch theo phương ngang và phương dọc trong công thức khoảng cách."),
        ("Các điểm số là {a}, {b}, {c} và {d}. Tính giá trị trung bình.", "solve_problem", "Cộng tất cả các giá trị rồi chia cho số lượng quan sát."),
        ("Rút gọn 2^{n} × 2^{m}.", "explain_concept", "Khi nhân các lũy thừa cùng cơ số, hãy xem xét quan hệ giữa các số mũ."),
        ("Vì sao log cơ số 10 của 100 bằng 2?", "explain_concept", "Viết lại biểu thức logarit dưới dạng một mệnh đề lũy thừa."),
        ("Một ô tô đi {distance} km trong {hours} giờ. Tính vận tốc trung bình.", "solve_problem", "Vận tốc trung bình bằng tổng quãng đường chia cho tổng thời gian."),
        ("Hình tròn bán kính {r} cm có diện tích được tính bằng công thức nào?", "give_hint", "Xác định bán kính rồi nhớ công thức diện tích có chứa số π."),
        ("Có bao nhiêu cách chọn 2 vật từ {n} vật?", "solve_problem", "Vì thứ tự không quan trọng, hãy dùng tổ hợp thay vì chỉnh hợp."),
    ],
    "HISTORY": [
        ("Những nguyên nhân chính của Cách mạng tháng Tám ở Việt Nam là gì?", "explain_concept", "Tách nguyên nhân lâu dài khỏi thời cơ chính trị trực tiếp vào năm 1945."),
        ("Vì sao chiến thắng trên sông Bạch Đằng gắn với Ngô Quyền?", "explain_concept", "Xác định người lãnh đạo, đối thủ và cách sử dụng thủy triều trong trận đánh."),
        ("Sắp xếp các triều đại Lý, Trần và Lê theo thứ tự thời gian.", "solve_problem", "Đặt các triều đại lên một dòng thời gian đơn giản trước khi nhớ chi tiết."),
        ("Chiến thắng Điện Biên Phủ có ý nghĩa gì?", "explain_concept", "Liên hệ kết quả quân sự với kết quả ngoại giao và sự chấm dứt chế độ thuộc địa của Pháp."),
        ("Khởi nghĩa Lam Sơn đã giành được sự ủng hộ như thế nào?", "explain_concept", "Xem xét vai trò lãnh đạo địa phương, lực lượng xã hội và phản ứng với sự đô hộ của nhà Minh."),
        ("Ai lãnh đạo phong trào Tây Sơn và phong trào này giải quyết vấn đề gì?", "check_answer", "Phân biệt các lãnh đạo chính với bối cảnh xã hội và chính trị rộng hơn."),
        ("Nguồn sử liệu sơ cấp khác nguồn sử liệu thứ cấp như thế nào?", "explain_concept", "Hỏi thời điểm nguồn được tạo ra và mức độ trực tiếp của nó với sự kiện."),
        ("Phân tích thiên kiến trong một tài liệu lịch sử như thế nào?", "give_hint", "Kiểm tra tác giả, đối tượng đọc, mục đích và những thông tin bị bỏ sót."),
        ("Nêu hai hệ quả của Cách mạng công nghiệp.", "give_hint", "Xem xét cả sản xuất kinh tế và những thay đổi trong xã hội đô thị."),
        ("Vì sao Chiến tranh thế giới thứ nhất bắt đầu?", "explain_concept", "Tách những căng thẳng lâu dài khỏi nguyên nhân trực tiếp châm ngòi."),
        ("So sánh mục tiêu của Cách mạng Pháp và Cách mạng Mỹ.", "give_hint", "So sánh quyền chính trị, vấn đề độc lập thuộc địa và lực lượng lãnh đạo."),
        ("Hiệp định Genève có vai trò gì đối với Việt Nam?", "explain_concept", "Xác định cuộc xung đột mà hiệp định kết thúc và sắp xếp chính trị được tạo ra."),
        ("Vì sao chính sách Đổi mới được đưa ra ở Việt Nam?", "explain_concept", "Liên hệ chính sách với khó khăn kinh tế và nhu cầu cải cách sau năm 1975."),
        ("Nguyên nhân và hệ quả trong lịch sử khác nhau như thế nào?", "explain_concept", "Nguyên nhân giải thích vì sao sự kiện xảy ra, còn hệ quả mô tả những gì diễn ra sau đó."),
        ("Viết một đoạn văn theo trình tự thời gian về một cuộc chiến như thế nào?", "give_hint", "Dùng các mốc năm làm điểm neo và nối các sự kiện bằng từ chuyển ý rõ ràng."),
        ("Em viết Cách mạng tháng Tám xảy ra năm 1954. Điều đó đúng không?", "diagnose_error", "Kiểm tra mốc thời gian này với sự kiện gắn với việc kết thúc Chiến tranh Đông Dương lần thứ nhất."),
        ("Cách mạng tháng Tám hay chiến thắng Điện Biên Phủ xảy ra trước?", "check_answer", "Đặt cả hai mốc năm lên dòng thời gian rồi so sánh."),
        ("Vì sao Chiến tranh lạnh giữa Mỹ và Liên Xô không trở thành chiến tranh trực tiếp?", "explain_concept", "Xem xét răn đe, liên minh và các cuộc xung đột gián tiếp thay vì chiến tranh tổng lực."),
        ("Làm sao so sánh công bằng hai nhà lãnh đạo lịch sử?", "give_hint", "Dùng cùng tiêu chí: bối cảnh, mục tiêu, phương pháp và hệ quả."),
        ("Các nhà sử học đánh giá một nguồn tư liệu đáng tin cậy bằng cách nào?", "give_hint", "Đối chiếu tác giả, thời điểm, mục đích và nguồn bằng chứng độc lập."),
    ],
}


def format_question(subject: str, template_index: int, variant: int) -> str:
    if subject == "ENGLISH":
        contexts = [
            "trong một bài tập trên lớp", "khi ôn tập cho bài kiểm tra", "trong một email ngắn",
            "khi nói chuyện với bạn", "trong một bài đọc", "trong một bài viết",
            "khi làm bài tập về nhà", "khi kiểm tra bản dịch", "trong một bài học trực tuyến", "trong câu trả lời thi",
        ]
        return f"{TEMPLATES_VI[subject][template_index][0]} Em hãy giải thích trong bối cảnh của {contexts[variant]}."
    if subject == "MATH":
        values = [
            {"a": 2 + variant, "b": 3 + variant, "c": 13 + variant},
            {"s": 10 + variant, "p": 21 + variant * 2},
            {"s": 20 + variant, "d": 6 + variant},
            {"n": 10 + variant, "m": 120 + variant * 10},
            {"b": 8 + variant, "h": 5 + variant},
            {"k": (-2 if variant % 2 else 3) + variant // 3, "q": 4 + variant},
            {"cut": 2 + variant % 3},
            {"u": 3 + variant, "v": 4 + variant},
            {"a": 2 + variant, "b": -5 - variant, "c": 12 + variant},
            {"k": 2 + variant % 4, "q": 3 + variant},
            {"k": 1 + variant % 5, "n": 2 + variant},
            {"a": 3 + variant, "b": 7 + variant, "c": 11 + variant},
            {"a": 2 + variant, "b": -3 - variant, "c": 10 + variant},
            {"x": 3 + variant, "y": 4 + variant},
            {"a": 5 + variant, "b": 7 + variant, "c": 9 + variant, "d": 11 + variant},
            {"n": 2 + variant, "m": 3 + variant},
            {},
            {"distance": 60 + variant * 5, "hours": 2 + variant % 4},
            {"r": 3 + variant},
            {"n": 5 + variant},
        ][template_index]
        return TEMPLATES_VI[subject][template_index][0].format(**values)
    contexts = [
        "cho một câu hỏi ngắn", "khi ôn tập cho bài kiểm tra", "trong bài tập lập dòng thời gian",
        "cho bài phân tích sử liệu", "trong thảo luận trên lớp", "khi so sánh hai sự kiện",
        "cho đoạn văn bài tập về nhà", "trong câu trả lời có dẫn chứng", "khi ôn lại bài học", "cho bài luận kiểm tra",
    ]
    return f"{TEMPLATES_VI[subject][template_index][0]} Em hãy giải thích trong bối cảnh của {contexts[variant]}."


def make_train(subject: str) -> list[dict]:
    rows = []
    for template_index, (_, intent, _) in enumerate(TEMPLATES[subject]):
        for variant in range(10):
            question = format_question(subject, template_index, variant)
            hint = TEMPLATES_VI[subject][template_index][2]
            difficulty = ("basic", "intermediate", "applied")[variant % 3]
            opening = SOCRATIC_OPENINGS[variant % len(SOCRATIC_OPENINGS)]
            closing = SOCRATIC_CLOSINGS[subject][(template_index + variant) % len(SOCRATIC_CLOSINGS[subject])]
            rows.append({
                "id": f"sft-{subject.lower()}-v2-{template_index * 10 + variant + 1:03d}",
                "subject": subject,
                "difficulty": difficulty,
                "intent": intent,
                "provenance": "synthetic_curriculum_v2",
                "messages": [
                    {"role": "system", "content": SYSTEM[subject]},
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": opening + hint[:1].lower() + hint[1:] + " " + closing},
                ],
            })
    return rows


def router_case(case_id: str, subject: str, question: str, intent: str, clarification: bool,
                challenge: str = "standard", history: list[dict] | None = None,
                previous_subject: str | None = None) -> dict:
    return {
        "id": case_id,
        "split": "TEST",
        "question": question,
        "gold_subject": subject,
        "gold_intent": intent,
        "gold_need_clarification": clarification,
        "challenge_type": challenge,
        "previous_subject": previous_subject,
        "history": history or [],
        "messages": [{"role": "user", "content": question}],
        "provenance": "synthetic_router_v2",
    }


def make_test() -> list[dict]:
    source = {
        "ENGLISH": [
            ("Why is 'She go to school' incorrect?", "diagnose_error", False, "standard"),
            ("Choose between 'since' and 'for' in 'I have studied English ___ 2022.'", "check_answer", False, "standard"),
            ("Explain the difference between 'must' and 'should'.", "explain_concept", False, "standard"),
            ("How do I write a short opinion paragraph in English?", "give_hint", False, "standard"),
            ("Change 'They built the bridge' into the passive voice.", "solve_problem", False, "standard"),
            ("What does 'take part in' mean?", "explain_concept", False, "standard"),
            ("Is 'an university' correct?", "check_answer", False, "standard"),
            ("How can I identify the main idea of a reading passage?", "give_hint", False, "standard"),
            ("why she go school by bus", "diagnose_error", False, "typo"),
            ("em ko biet dung thi hien tai hoan thanh", "give_hint", False, "typo"),
            ("hoc tu vung tieng anh sao cho nho lau", "give_hint", False, "typo"),
            ("CT nao cho cau bi dong?", "explain_concept", False, "abbreviation"),
            ("Vocab 'look after' nghia gi?", "explain_concept", False, "abbreviation"),
            ("Cach viet para opinion?", "give_hint", False, "abbreviation"),
            ("Then what should I check in the next sentence?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "I am correcting my paragraph."}, {"role": "assistant", "content": "Check the subject and verb in each sentence."}], "ENGLISH"),
            ("Vậy dùng thì nào tiếp theo?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang viết về một việc bắt đầu trong quá khứ và còn tiếp diễn."}, {"role": "assistant", "content": "Hãy chú ý mốc thời gian và tính liên tục của hành động."}], "ENGLISH"),
            ("Is this word formal enough here?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "I am writing an email to my teacher."}, {"role": "assistant", "content": "Use a polite greeting and avoid slang."}], "ENGLISH"),
            ("Help me with my English homework.", "ask_follow_up", True, "ambiguous"),
            ("English grammar", "ask_follow_up", True, "ambiguous"),
            ("I don't understand this lesson.", "ask_follow_up", True, "ambiguous"),
        ],
        "MATH": [
            ("Solve 4x - 7 = 13.", "solve_problem", False, "standard"),
            ("Find the area of a triangle with base 12 cm and height 9 cm.", "solve_problem", False, "standard"),
            ("Why does an inequality sign reverse when dividing by a negative number?", "explain_concept", False, "standard"),
            ("Is the answer x = 5 correct for 2x + 3 = 13?", "check_answer", False, "standard"),
            ("Give me a hint for solving x² - 5x + 6 = 0.", "give_hint", False, "standard"),
            ("A die is rolled once. What is P(number > 4)?", "solve_problem", False, "standard"),
            ("I expanded (a+b)² as a²+b². Where is the mistake?", "diagnose_error", False, "standard"),
            ("What is the next term of 3, 7, 11, ...?", "solve_problem", False, "standard"),
            ("giai pt 5x-10=0", "solve_problem", False, "typo"),
            ("em ko biet tinh dien tich tam giac", "give_hint", False, "typo"),
            ("tai sao chia so am phai doi dau", "explain_concept", False, "typo"),
            ("CT dien tich tam giac?", "give_hint", False, "abbreviation"),
            ("giai BPT bac nhat", "give_hint", False, "abbreviation"),
            ("Tim delta cua PT bac 2", "give_hint", False, "abbreviation"),
            ("Vậy em thay số vào công thức nào?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang giải một bài tam giác vuông."}, {"role": "assistant", "content": "Hãy xác định hai cạnh góc vuông trước."}], "MATH"),
            ("Kết quả này có cần đổi đơn vị không?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em vừa tính diện tích theo cm."}, {"role": "assistant", "content": "Kiểm tra đơn vị của đáy và chiều cao."}], "MATH"),
            ("Bước tiếp theo là cộng hay trừ hai vế?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang cô lập x trong phương trình."}, {"role": "assistant", "content": "Hãy xem hạng tử nào đang đứng cùng x."}], "MATH"),
            ("Giúp em làm bài này.", "ask_follow_up", True, "ambiguous"),
            ("Bài toán này làm thế nào?", "ask_follow_up", True, "ambiguous"),
            ("Em không hiểu phần này.", "ask_follow_up", True, "ambiguous"),
        ],
        "HISTORY": [
            ("Why was the Dien Bien Phu victory important?", "explain_concept", False, "standard"),
            ("Arrange the Ly, Tran and Le dynasties chronologically.", "solve_problem", False, "standard"),
            ("What were the causes of the August Revolution?", "explain_concept", False, "standard"),
            ("How do I identify bias in a historical source?", "give_hint", False, "standard"),
            ("Which happened first: the August Revolution or Dien Bien Phu?", "check_answer", False, "standard"),
            ("What was the significance of the Geneva Accords?", "explain_concept", False, "standard"),
            ("Compare a primary source with a secondary source.", "explain_concept", False, "standard"),
            ("Give me a structure for a chronological history paragraph.", "give_hint", False, "standard"),
            ("dien bien phu thang nam nao", "check_answer", False, "typo"),
            ("nguyen nhan cach mang thang tam", "explain_concept", False, "typo"),
            ("em ko biet hoc su the nao", "give_hint", False, "typo"),
            ("CM T8 co y nghia gi?", "explain_concept", False, "abbreviation"),
            ("LSVN thoi Tran co gi noi bat?", "explain_concept", False, "abbreviation"),
            ("PTLS cua mot su kien viet sao?", "give_hint", False, "abbreviation"),
            ("Vậy nguyên nhân trực tiếp là gì?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang phân tích một cuộc cách mạng."}, {"role": "assistant", "content": "Hãy tách nguyên nhân lâu dài và hoàn cảnh trực tiếp."}], "HISTORY"),
            ("Sự kiện này xảy ra trước hay sau năm 1945?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang lập dòng thời gian lịch sử Việt Nam."}, {"role": "assistant", "content": "Đặt các mốc năm cạnh nhau để so sánh."}], "HISTORY"),
            ("Nguồn này có đáng tin không?", "ask_follow_up", False, "follow_up", [{"role": "user", "content": "Em đang đọc một trích đoạn hồi ký."}, {"role": "assistant", "content": "Hãy kiểm tra tác giả, thời điểm và mục đích của nguồn."}], "HISTORY"),
            ("Giúp em học bài lịch sử này.", "ask_follow_up", True, "ambiguous"),
            ("Lịch sử Việt Nam", "ask_follow_up", True, "ambiguous"),
            ("Em không nhớ sự kiện này.", "ask_follow_up", True, "ambiguous"),
        ],
    }
    rows = []
    for subject, cases in source.items():
        for index, item in enumerate(cases, 1):
            question, intent, clarification, challenge = item[:4]
            history = item[4] if len(item) > 4 else None
            previous = item[5] if len(item) > 5 else None
            rows.append(router_case(f"test-{subject.lower()}-v2-{index:03d}", subject, question, intent, clarification, challenge, history, previous))
    return rows


def make_router_train(train_rows: dict[str, list[dict]]) -> list[dict]:
    rows = []
    for subject, items in train_rows.items():
        for index, item in enumerate(items[:30], 1):
            user_text = next(message["content"] for message in item["messages"] if message["role"] == "user")
            rows.append(router_case(f"train-{subject.lower()}-v2-{index:03d}", subject, user_text, item["intent"], False))
            rows[-1]["split"] = "TRAIN"
    return rows


def make_general_train(train_rows: dict[str, list[dict]]) -> list[dict]:
    rows = []
    for subject in ("ENGLISH", "MATH", "HISTORY"):
        for item in train_rows[subject]:
            messages = [dict(message) for message in item["messages"]]
            messages[0] = {"role": "system", "content": GENERAL_SYSTEM}
            rows.append({
                "id": f"general-v2-{len(rows) + 1:03d}",
                "subject": subject,
                "difficulty": item["difficulty"],
                "intent": item["intent"],
                "provenance": "synthetic_curriculum_v2_general_merged",
                "messages": messages,
            })
    return rows


def write_json(name: str, payload: object) -> None:
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    train = {subject: make_train(subject) for subject in ("ENGLISH", "MATH", "HISTORY")}
    for subject, rows in train.items():
        write_json(f"specialist_{subject.lower()}_train_v2.json", rows)
    general_train = make_general_train(train)
    write_json("general_tutor_train_v2.json", general_train)

    test = make_test()
    router_train = make_router_train(train)
    write_json("router_train_v2.json", {
        "schema_version": "router_dataset_v2",
        "dataset_role": "router_calibration_train",
        "provenance": {"source": "synthetic_router_v2", "warning": "Synthetic development data; independently review labels before final research claims."},
        "case_count": len(router_train),
        "subject_distribution": {subject: 30 for subject in ("ENGLISH", "MATH", "HISTORY")},
        "cases": router_train,
    })
    write_json("router_test_v2.json", {
        "schema_version": "router_dataset_v2",
        "dataset_role": "router_holdout_test",
        "provenance": {"source": "synthetic_router_v2", "warning": "Synthetic hold-out data; do not tune thresholds on this set."},
        "case_count": len(test),
        "subject_distribution": {subject: 20 for subject in ("ENGLISH", "MATH", "HISTORY")},
        "challenge_distribution": {challenge: sum(item["challenge_type"] == challenge for item in test) for challenge in ("standard", "typo", "abbreviation", "follow_up", "ambiguous")},
        "cases": test,
    })
    write_json("subject_dataset_manifest_v2.json", {
        "version": "v2",
        "subjects": ["ENGLISH", "MATH", "HISTORY"],
        "specialist_train": {subject: f"specialist_{subject.lower()}_train_v2.json" for subject in ("ENGLISH", "MATH", "HISTORY")},
        "general_train": "general_tutor_train_v2.json",
        "router_train": "router_train_v2.json",
        "router_test": "router_test_v2.json",
        "counts": {"specialist_train_per_subject": 200, "general_train_total": 600, "router_train_total": 90, "router_test_total": 60},
        "note": "Synthetic curriculum data for pipeline validation; replace or supplement with independently authored data for final claims.",
    })
    print(json.dumps({"train": {key: len(value) for key, value in train.items()}, "general_train": len(general_train), "router_train": len(router_train), "router_test": len(test)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
