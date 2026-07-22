import json
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "datasets" / "dataset_600_quality_v4.json"


VARIANTS_EN = [
    "Please explain it in simple English.",
    "Show me the reasoning step by step, but let me try the final step.",
    "Give a short example and ask me one checking question.",
    "What is the most common mistake students make here?",
    "Where should I start if I see a similar question in a test?",
    "Check whether my interpretation would be correct and explain what to fix.",
    "Can you compare it with a closely related grammar idea?",
    "Act as a Socratic tutor: give one clue and ask me what comes next.",
]

VARIANTS_VI = [
    "Hãy giải thích bằng tiếng Việt thật dễ hiểu.",
    "Hãy chỉ cách suy luận từng bước, nhưng để em tự làm bước cuối.",
    "Hãy cho một ví dụ ngắn và đặt một câu hỏi để em tự kiểm tra.",
    "Học sinh thường mắc lỗi nào nhất ở nội dung này?",
    "Nếu gặp dạng tương tự trong bài kiểm tra thì em nên bắt đầu từ đâu?",
    "Hãy kiểm tra cách hiểu của em và chỉ rõ điểm cần sửa nếu có.",
    "Có thể so sánh nội dung này với một khái niệm gần giống không?",
    "Hãy đóng vai gia sư Socratic: cho một gợi ý rồi hỏi em bước tiếp theo.",
]


ENGLISH = [
    ("the present simple and daily routines", "Why do we use the present simple to describe daily routines?"),
    ("the present continuous", "How can I tell when a sentence needs the present continuous?"),
    ("the past simple", "How does the past simple show that an action is finished?"),
    ("the present perfect", "What is the difference between the present perfect and the past simple?"),
    ("future forms", "When should I use will, be going to, or the present continuous for the future?"),
    ("countable and uncountable nouns", "How can I decide whether a noun is countable or uncountable?"),
    ("much, many, few, and little", "How do much, many, few, and little change the meaning of a sentence?"),
    ("articles a, an, and the", "What clues help me choose between a, an, and the?"),
    ("comparatives", "How do I form and use comparative adjectives correctly?"),
    ("superlatives", "How is a superlative different from a comparative?"),
    ("modal verbs", "How do can, must, should, and might express different levels of meaning?"),
    ("first conditional", "How does the first conditional express a possible result?"),
    ("second conditional", "When is the second conditional more appropriate than the first?"),
    ("passive voice", "Why might a writer choose the passive voice instead of the active voice?"),
    ("reported speech", "What changes are needed when direct speech becomes reported speech?"),
    ("relative clauses", "How do who, which, that, and where work in relative clauses?"),
    ("gerunds and infinitives", "How can I know whether a verb is followed by a gerund or an infinitive?"),
    ("phrasal verbs", "What is the best way to understand and remember a phrasal verb?"),
    ("formal and informal register", "How can I make an English sentence sound more formal?"),
    ("polite requests", "Which English expressions make a request sound polite?"),
    ("main ideas", "How can I identify the main idea in an English paragraph?"),
    ("supporting details", "How do supporting details strengthen the main idea?"),
    ("inference", "What evidence should I use when making an inference from a passage?"),
    ("linking words", "How do however, therefore, and although connect ideas?"),
    ("subject-verb agreement", "How can I check subject-verb agreement in a long sentence?"),
]

MATH = [
    ("a linear equation", "Giải phương trình 3x + 5 = 20 như thế nào?"),
    ("a linear equation with fractions", "Làm thế nào để giải phương trình x/3 + 2 = 7?"),
    ("a system of two equations", "Em nên dùng phương pháp nào để giải hệ 2x + y = 7 và x - y = 2?"),
    ("a quadratic equation", "Hãy hướng dẫn cách giải phương trình x² - 5x + 6 = 0."),
    ("the discriminant", "Biệt thức delta giúp xác định số nghiệm của phương trình bậc hai ra sao?"),
    ("factoring", "Làm sao nhận biết một tam thức có thể phân tích thành nhân tử?"),
    ("a quadratic function", "Đồ thị của hàm số y = x² - 4x + 3 có những đặc điểm nào?"),
    ("the vertex of a parabola", "Tìm đỉnh của parabol y = x² - 6x + 5 bằng cách nào?"),
    ("an arithmetic sequence", "Công thức số hạng tổng quát của cấp số cộng được suy ra thế nào?"),
    ("a geometric sequence", "Khi nào một dãy số được gọi là cấp số nhân?"),
    ("the sum of an arithmetic sequence", "Tính tổng 20 số hạng đầu của một cấp số cộng cần những dữ kiện gì?"),
    ("the binomial coefficient", "Có bao nhiêu cách chọn 2 vật từ 14 vật và vì sao dùng tổ hợp?"),
    ("probability of independent events", "Xác suất của hai biến cố độc lập được tính như thế nào?"),
    ("conditional probability", "Xác suất có điều kiện khác xác suất thông thường ở điểm nào?"),
    ("the mean and median", "Khi nào nên dùng trung bình cộng và khi nào nên dùng trung vị?"),
    ("linear function slope", "Hệ số góc cho biết điều gì về đường thẳng y = 2x - 1?"),
    ("the distance formula", "Công thức khoảng cách giữa hai điểm trên mặt phẳng được xây dựng từ đâu?"),
    ("the midpoint formula", "Tìm trung điểm của đoạn nối A(2, -1) và B(6, 5) như thế nào?"),
    ("the Pythagorean theorem", "Định lý Pythagore áp dụng trong tam giác vuông như thế nào?"),
    ("similar triangles", "Dựa vào đâu để kết luận hai tam giác đồng dạng?"),
    ("circle circumference", "Chu vi đường tròn liên hệ với bán kính bằng công thức nào?"),
    ("the area of a triangle", "Vì sao diện tích tam giác bằng một nửa đáy nhân chiều cao?"),
    ("volume of a cylinder", "Tính thể tích hình trụ cần xác định những đại lượng nào?"),
    ("derivative as a rate of change", "Đạo hàm biểu diễn tốc độ thay đổi của một hàm số ra sao?"),
    ("a basic definite integral", "Tích phân xác định liên hệ với diện tích dưới đường cong thế nào?"),
]

HISTORY = [
    ("the August Revolution in Vietnam", "Những nguyên nhân chính dẫn đến Cách mạng tháng Tám năm 1945 là gì?"),
    ("the Dien Bien Phu victory", "Vì sao chiến thắng Điện Biên Phủ năm 1954 có ý nghĩa lớn?"),
    ("the Geneva Agreement of 1954", "Hiệp định Genève năm 1954 đã tạo ra những thay đổi nào ở Việt Nam?"),
    ("the Paris Peace Accords", "Hiệp định Paris năm 1973 có vai trò gì trong lịch sử Việt Nam?"),
    ("the reunification of Vietnam", "Những sự kiện nào dẫn đến việc thống nhất đất nước năm 1975?"),
    ("the Doi Moi policy", "Vì sao Việt Nam tiến hành công cuộc Đổi mới từ năm 1986?"),
    ("the French colonial period", "Chính sách cai trị của thực dân Pháp ở Việt Nam có những đặc điểm gì?"),
    ("the Can Vuong movement", "Phong trào Cần Vương xuất hiện trong hoàn cảnh lịch sử nào?"),
    ("the Tay Son movement", "Phong trào Tây Sơn đã giải quyết những vấn đề nào của xã hội cuối thế kỷ XVIII?"),
    ("the Nguyen dynasty", "Nhà Nguyễn được thành lập trong bối cảnh nào?"),
    ("the Ly dynasty", "Nhà Lý đã đóng góp gì cho sự phát triển của quốc gia Đại Việt?"),
    ("the Tran dynasty", "Vì sao nhà Trần được nhắc đến nhiều khi học về kháng chiến chống Mông-Nguyên?"),
    ("the battle on the Bach Dang River", "Chiến thắng Bạch Đằng năm 938 có ý nghĩa như thế nào?"),
    ("the early Vietnamese states", "Những yếu tố nào giúp hình thành các nhà nước đầu tiên ở Việt Nam?"),
    ("the Industrial Revolution", "Cách mạng công nghiệp lần thứ nhất đã thay đổi xã hội châu Âu ra sao?"),
    ("the French Revolution", "Những nguyên nhân quan trọng của Cách mạng Pháp năm 1789 là gì?"),
    ("the American Revolution", "Vì sao các thuộc địa Bắc Mỹ đấu tranh giành độc lập?"),
    ("the First World War", "Các nguyên nhân sâu xa của Chiến tranh thế giới thứ nhất là gì?"),
    ("the Second World War", "Những yếu tố nào làm Chiến tranh thế giới thứ hai lan rộng?"),
    ("the Cold War", "Chiến tranh lạnh khác chiến tranh trực tiếp giữa các cường quốc như thế nào?"),
    ("the United Nations", "Liên Hợp Quốc được thành lập nhằm giải quyết những vấn đề gì?"),
    ("the Renaissance", "Phong trào Phục hưng đã ảnh hưởng đến tư tưởng châu Âu ra sao?"),
    ("the ancient Egyptian civilization", "Sông Nile đóng vai trò gì trong sự phát triển của Ai Cập cổ đại?"),
    ("the ancient Greek democracy", "Nền dân chủ ở Athens cổ đại có đặc điểm và giới hạn nào?"),
    ("the Silk Road", "Con đường tơ lụa thúc đẩy giao lưu giữa các khu vực như thế nào?"),
]

EN_HINTS = {
    topic: hint for topic, hint in [
        ("the present simple and daily routines", "The present simple is used for habits and repeated routines; frequency expressions such as every day are useful clues."),
        ("the present continuous", "The present continuous uses am, is, or are plus the -ing form for an action happening around now."),
        ("the past simple", "The past simple describes a completed past event, often with a finished-time expression such as yesterday or last year."),
        ("the present perfect", "The present perfect connects a past event to the present and is formed with have or has plus the past participle."),
        ("future forms", "Will often expresses a decision or prediction, be going to expresses a plan or evidence-based prediction, and the present continuous can express an arranged future event."),
        ("countable and uncountable nouns", "Countable nouns can have a number and plural form, while uncountable nouns are treated as a mass and do not normally take a plural form."),
        ("much, many, few, and little", "Many and few go with countable plural nouns; much and little go with uncountable nouns."),
        ("articles a, an, and the", "A and an introduce a non-specific singular countable noun; the points to something specific or already identified."),
        ("comparatives", "A comparative compares two things, commonly using -er or more and usually followed by than."),
        ("superlatives", "A superlative identifies the highest or lowest degree in a group and normally uses the plus -est or most."),
        ("modal verbs", "Modal verbs express meanings such as ability, obligation, advice, or possibility and are followed by the base verb."),
        ("first conditional", "The first conditional uses if plus a present form and will plus the base verb for a realistic future possibility."),
        ("second conditional", "The second conditional uses if plus the past form and would plus the base verb for an unreal or unlikely situation."),
        ("passive voice", "The passive voice focuses on the receiver of an action and uses a form of be plus the past participle."),
        ("reported speech", "Reported speech changes the quotation into a clause and may require changes to tense, pronouns, and time expressions."),
        ("relative clauses", "Relative pronouns link a noun to extra information; who normally refers to people, which to things, and where to places."),
        ("gerunds and infinitives", "Some verbs are followed by an -ing form and others by to plus the base verb, so the main verb pattern must be checked."),
        ("phrasal verbs", "A phrasal verb combines a verb with a particle, and the combined meaning may differ from the verb alone."),
        ("formal and informal register", "Formal writing usually avoids slang and contractions and uses precise, respectful vocabulary."),
        ("polite requests", "Could, would, and Would you mind are common ways to make a request less direct and more polite."),
        ("main ideas", "The main idea is the paragraph's central message, while examples and explanations are supporting details."),
        ("supporting details", "Supporting details provide evidence, reasons, or examples that make the main idea clearer."),
        ("inference", "An inference must connect evidence from the passage with reasonable background knowledge; it should not be a guess without evidence."),
        ("linking words", "However signals contrast, therefore signals a result, and although introduces a contrast within a dependent clause."),
        ("subject-verb agreement", "The verb must agree with the grammatical subject, not with a nearby noun inside a prepositional phrase."),
    ]
}

MATH_HINTS = {
    topic: hint for topic, hint in [
        ("a linear equation", "Với 3x + 5 = 20, hãy trừ 5 ở cả hai vế rồi chia cả hai vế cho 3 để cô lập x."),
        ("a linear equation with fractions", "Trước hết khử phân số bằng cách nhân mọi số hạng với mẫu số chung, sau đó cô lập ẩn số."),
        ("a system of two equations", "Có thể dùng phương pháp thế hoặc phương pháp cộng đại số; sau khi tìm được một ẩn, thay lại để kiểm tra ẩn còn lại."),
        ("a quadratic equation", "Đưa phương trình về dạng bằng 0 rồi chọn phân tích thành nhân tử, công thức nghiệm hoặc hoàn thành bình phương."),
        ("the discriminant", "Với ax² + bx + c = 0, biệt thức delta bằng b² - 4ac; dấu của delta cho biết số nghiệm thực."),
        ("factoring", "Tìm hai nhân tử có tích bằng số hạng tự do và tổng phù hợp với hệ số của x."),
        ("a quadratic function", "Với y = ax² + bx + c, dấu của a quyết định parabol quay lên hay quay xuống; trục đối xứng là x = -b/(2a)."),
        ("the vertex of a parabola", "Hoành độ đỉnh là -b/(2a); thay giá trị đó vào hàm số để tìm tung độ đỉnh."),
        ("an arithmetic sequence", "Cấp số cộng có công sai không đổi và số hạng thứ n là a1 + (n - 1)d."),
        ("a geometric sequence", "Cấp số nhân có công bội không đổi, được tìm bằng cách chia một số hạng cho số hạng liền trước."),
        ("the sum of an arithmetic sequence", "Tổng n số hạng là n(a1 + an)/2, hoặc n(2a1 + (n - 1)d)/2 khi chưa biết số hạng cuối."),
        ("the binomial coefficient", "Khi thứ tự không quan trọng, chọn k vật từ n vật bằng C(n,k) = n!/[k!(n-k)!]."),
        ("probability of independent events", "Với hai biến cố độc lập A và B, xác suất đồng thời bằng P(A) nhân P(B)."),
        ("conditional probability", "Xác suất có điều kiện dùng công thức P(A|B) = P(A và B)/P(B), với P(B) khác 0."),
        ("the mean and median", "Trung bình cộng dùng mọi giá trị và dễ bị ảnh hưởng bởi ngoại lệ; trung vị là giá trị giữa sau khi sắp xếp."),
        ("linear function slope", "Hệ số góc là độ thay đổi của y chia cho độ thay đổi của x; trong y = 2x - 1, hệ số góc bằng 2."),
        ("the distance formula", "Công thức khoảng cách suy ra từ định lý Pythagore: căn bậc hai của (x2-x1)² + (y2-y1)²."),
        ("the midpoint formula", "Trung điểm được tìm bằng cách lấy trung bình cộng của hai hoành độ và hai tung độ."),
        ("the Pythagorean theorem", "Trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông."),
        ("similar triangles", "Hai tam giác đồng dạng có các góc tương ứng bằng nhau và các cạnh tương ứng tỉ lệ."),
        ("circle circumference", "Chu vi đường tròn bằng 2πr, trong đó r là bán kính."),
        ("the area of a triangle", "Diện tích tam giác bằng một phần hai tích của đáy và chiều cao vuông góc."),
        ("volume of a cylinder", "Thể tích hình trụ bằng diện tích đáy nhân chiều cao, nên V = πr²h."),
        ("derivative as a rate of change", "Đạo hàm cho biết tốc độ thay đổi tức thời và hệ số góc của tiếp tuyến."),
        ("a basic definite integral", "Tích phân xác định biểu diễn diện tích có dấu giữa đồ thị và trục hoành trên một khoảng."),
    ]
}

HISTORY_HINTS = {
    topic: hint for topic, hint in [
        ("the August Revolution in Vietnam", "Cần tách điều kiện lâu dài của chế độ thuộc địa, phong trào quần chúng và thời cơ chính trị thuận lợi xuất hiện vào tháng 8 năm 1945."),
        ("the Dien Bien Phu victory", "Chiến thắng kết thúc nỗ lực quân sự chủ yếu của Pháp ở Đông Dương và tạo điều kiện quyết định cho đàm phán năm 1954."),
        ("the Geneva Agreement of 1954", "Hiệp định chấm dứt chiến tranh với Pháp và tạm thời lấy vĩ tuyến 17 làm giới tuyến quân sự để tập kết lực lượng."),
        ("the Paris Peace Accords", "Hiệp định năm 1973 yêu cầu quân đội Hoa Kỳ rút khỏi Việt Nam và ghi nhận quyền tự quyết của nhân dân Việt Nam."),
        ("the reunification of Vietnam", "Thắng lợi năm 1975 kết thúc chiến tranh; đất nước được hoàn tất thống nhất về mặt nhà nước vào năm 1976."),
        ("the Doi Moi policy", "Đường lối năm 1986 đáp ứng khó khăn kinh tế bằng việc phát triển nền kinh tế thị trường định hướng xã hội chủ nghĩa và mở rộng hội nhập."),
        ("the French colonial period", "Cần phân biệt chính sách kiểm soát chính trị, khai thác kinh tế và tác động về văn hóa, giáo dục của thực dân Pháp."),
        ("the Can Vuong movement", "Phong trào xuất hiện sau lời kêu gọi của vua Hàm Nghi năm 1885, nhằm chống Pháp và ủng hộ chế độ quân chủ."),
        ("the Tay Son movement", "Phong trào chống tình trạng chia cắt và sự can thiệp bên ngoài, đồng thời giành nhiều thắng lợi quân sự cuối thế kỷ XVIII."),
        ("the Nguyen dynasty", "Nhà Nguyễn được Nguyễn Ánh thành lập năm 1802 sau một thời gian dài xung đột và phân tranh trong nước."),
        ("the Ly dynasty", "Nhà Lý củng cố nhà nước trung ương, dời đô về Thăng Long và thúc đẩy nông nghiệp, văn hóa."),
        ("the Tran dynasty", "Nhà Trần lãnh đạo ba cuộc kháng chiến chống quân Mông - Nguyên trong thế kỷ XIII."),
        ("the battle on the Bach Dang River", "Ngô Quyền lợi dụng thủy triều và bãi cọc trên sông Bạch Đằng để đánh bại quân Nam Hán năm 938."),
        ("the early Vietnamese states", "Các nhà nước đầu tiên hình thành từ cộng đồng nông nghiệp, sự phân hóa xã hội và nhu cầu tổ chức trị thủy, chống ngoại xâm."),
        ("the Industrial Revolution", "Cơ giới hóa, nhà máy và hơi nước làm tăng sản xuất nhưng cũng biến đổi lao động, đô thị và các giai cấp xã hội."),
        ("the French Revolution", "Các nguyên nhân quan trọng gồm bất bình đẳng đẳng cấp, khủng hoảng tài chính, tư tưởng Khai sáng và xung đột chính trị."),
        ("the American Revolution", "Xung đột phát triển từ tranh chấp về thuế khóa, quyền đại diện, quyền của thuộc địa và sự kiểm soát của Anh."),
        ("the First World War", "Chủ nghĩa quân phiệt, hệ thống liên minh, cạnh tranh đế quốc và chủ nghĩa dân tộc tạo căng thẳng lâu dài; vụ ám sát ở Sarajevo là nguyên nhân trực tiếp."),
        ("the Second World War", "Chính sách bành trướng của các nước phát xít, những mâu thuẫn sau Chiến tranh thế giới thứ nhất và sự thất bại của an ninh tập thể góp phần làm chiến tranh bùng nổ."),
        ("the Cold War", "Chiến tranh lạnh là sự đối đầu chính trị, tư tưởng, kinh tế và chiến lược kéo dài giữa hai phe, nhưng không biến thành chiến tranh trực tiếp toàn diện giữa Mỹ và Liên Xô."),
        ("the United Nations", "Liên Hợp Quốc được thành lập năm 1945 nhằm duy trì hòa bình, thúc đẩy hợp tác quốc tế và giải quyết tranh chấp bằng biện pháp hòa bình."),
        ("the Renaissance", "Phong trào Phục hưng khôi phục quan tâm đến tri thức cổ điển, chủ nghĩa nhân văn, nghệ thuật và nghiên cứu khoa học."),
        ("the ancient Egyptian civilization", "Sông Nile cung cấp nước, phù sa, giao thông và điều kiện tập trung dân cư, góp phần hình thành nhà nước Ai Cập cổ đại."),
        ("the ancient Greek democracy", "Athens có hình thức dân chủ trực tiếp cho nam công dân, nhưng phụ nữ, nô lệ và người ngoại quốc không có quyền công dân."),
        ("the Silk Road", "Con đường tơ lụa kết nối các khu vực bằng thương mại và thúc đẩy trao đổi tôn giáo, kỹ thuật, ngôn ngữ và tư tưởng."),
    ]
}


SYSTEM = {
    "ENGLISH": "You are an English subject tutor. Answer in clear English. Use a Socratic approach: explain one useful clue or step, avoid inventing facts, and ask one short follow-up question when appropriate.",
    "MATH": "Bạn là gia sư môn Toán. Hãy trả lời bằng tiếng Việt, trình bày đúng công thức và từng bước kiểm tra. Gợi mở để học sinh tự làm bước tiếp theo; chỉ nêu đáp án cuối khi người học đã yêu cầu kiểm tra.",
    "HISTORY": "Bạn là gia sư môn Lịch sử. Hãy trả lời bằng tiếng Việt, phân biệt rõ nguyên nhân, diễn biến và ý nghĩa, chỉ dùng thông tin lịch sử chắc chắn. Gợi ý từng bước và hỏi một câu kiểm tra ngắn.",
}


def make_items(subject, topics):
    items = []
    intents = ["explain_concept", "solve_problem", "apply_example", "identify_error", "compare", "summarize", "cause_effect", "follow_up"]
    challenges = ["baseline", "paraphrase", "application", "common_error", "comparison", "summary", "cause_effect", "follow_up"]
    variants = VARIANTS_EN if subject == "ENGLISH" else VARIANTS_VI
    for idx, (topic, base) in enumerate(topics):
        for v, variant in enumerate(variants):
            if subject == "ENGLISH":
                question = f"{base} {variant}"
                answer = f"{EN_HINTS[topic]} First identify the clue in the question, then test the rule on one short sentence. Which exact word gives you the strongest clue?"
                lang = "en"
            else:
                question = f"{base} {variant}"
                if subject == "MATH":
                    answer = f"{MATH_HINTS[topic]} Trước hết em hãy ghi rõ dữ kiện và đại lượng cần tìm, sau đó viết bước biến đổi đầu tiên. Cuối cùng thử thay kết quả vào đề để kiểm tra."
                else:
                    answer = f"{HISTORY_HINTS[topic]} Trước hết em hãy xác định mốc thời gian và xem đề đang hỏi nguyên nhân, diễn biến hay ý nghĩa. Em hãy nêu một bằng chứng hoặc nhân vật quan trọng trước nhé."
                lang = "vi"
            items.append({
                "id": f"train-{subject.lower()}-v4-{idx * 8 + v + 1:03d}",
                "split": "TRAIN",
                "subject": subject,
                "intent": intents[v],
                "difficulty": "basic" if idx < 9 else ("intermediate" if idx < 18 else "advanced"),
                "question": question,
                "expected_language": lang,
                "challenge_type": challenges[v],
                "gold_need_clarification": False,
                "groupId": {"ENGLISH": 1, "MATH": 2, "HISTORY": 3}[subject],
                "groupLabel": subject,
                "subjectLabelDefault": subject,
                "subjectLabelWithAI": subject,
                "messages": [
                    {"role": "system", "content": SYSTEM[subject]},
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": answer},
                ],
                "provenance": "synthetic_curriculum_v4_quality",
            })
    return items


def main():
    data = make_items("ENGLISH", ENGLISH) + make_items("MATH", MATH) + make_items("HISTORY", HISTORY)
    assert len(data) == 600
    assert len({x["question"] for x in data}) == 600
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for subject in ("ENGLISH", "MATH", "HISTORY"):
        subset = [x for x in data if x["subject"] == subject]
        path = OUT.with_name(f"specialist_{subject.lower()}_train_v4.json")
        path.write_text(json.dumps(subset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "version": "v4",
        "source": "dataset_600_quality_v4.json",
        "subjects": ["ENGLISH", "MATH", "HISTORY"],
        "counts": {"total": 600, "per_subject": 200},
        "purpose": "Raw source for Data Prep; create train/validation/test splits downstream.",
        "warning": "Synthetic curriculum data; human-review a sample before research claims.",
    }
    OUT.with_name("dataset_600_manifest_v4.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"created {OUT}")
    print("total=600, ENGLISH=200, MATH=200, HISTORY=200, unique_questions=600")


if __name__ == "__main__":
    main()
