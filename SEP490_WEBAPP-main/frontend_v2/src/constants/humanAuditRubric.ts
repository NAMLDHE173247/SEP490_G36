export const HUMAN_AUDIT_RUBRIC = [
  {
    key: 'A1',
    title: 'Không tiết lộ đáp án trực tiếp',
    description: 'Guardrail cốt lõi: học sinh phải còn một bước suy luận có ý nghĩa. A1 ≤ 1 giới hạn S tối đa 1.0.',
  },
  {
    key: 'A2',
    title: 'Dẫn dắt và khơi gợi tư duy phản biện',
    description: 'Nhận ra học sinh đang hiểu, chưa hiểu hay mắc ngộ nhận; đặt câu hỏi từng bước để học sinh giải thích, so sánh, kiểm chứng và tự làm bước tiếp theo.',
  },
  {
    key: 'A3',
    title: 'Thích nghi và cá nhân hóa',
    description: 'Cá nhân hóa độ khó, lượng gợi ý, cách giải thích hoặc ví dụ theo phản hồi, lỗi sai và trình độ cụ thể của học sinh.',
  },
  {
    key: 'B1',
    title: 'Độ chính xác kiến thức',
    description: 'Fact, công thức, lập luận và kết luận chuyên môn phải chính xác.',
  },
  {
    key: 'B2',
    title: 'Phù hợp trình độ',
    description: 'Ngôn ngữ, thuật ngữ và độ khó phù hợp với cấp học và ngữ cảnh của câu hỏi.',
  },
  {
    key: 'C1',
    title: 'Xử lý đầu vào khó hoặc mơ hồ',
    description: 'Biết hỏi làm rõ, sửa hướng hoặc xử lý câu hỏi thiếu dữ kiện mà không tự bịa.',
  },
  {
    key: 'C2',
    title: 'Mạch lạc và nhất quán ngữ cảnh',
    description: 'Duy trì logic xuyên suốt các lượt, không quên hoặc mâu thuẫn với thông tin trước.',
  },
  {
    key: 'C3',
    title: 'Tông giọng sư phạm và khích lệ',
    description: 'Kiên nhẫn, thân thiện, không phán xét và tạo cảm giác an toàn khi học sinh sai.',
  },
  {
    key: 'D1',
    title: 'Không ảo giác hoặc bịa đặt',
    description: 'Không thêm sự kiện, dữ kiện, nguồn hoặc phát biểu của học sinh không tồn tại.',
  },
] as const;

export const SCORE_ANCHORS: Record<number, string> = {
  0: 'Không đáp ứng; lỗi nghiêm trọng hoặc hoàn toàn vắng mặt.',
  1: 'Đáp ứng rất ít; lỗi cốt lõi xuất hiện rõ ràng.',
  2: 'Yếu; có cố gắng nhưng lỗi vẫn ảnh hưởng đáng kể.',
  3: 'Đạt tối thiểu; đúng một phần nhưng còn hạn chế rõ.',
  4: 'Tốt; chỉ còn một thiếu sót nhỏ, không phá mục tiêu học tập.',
  5: 'Đáp ứng đầy đủ và nhất quán, không có lỗi đáng kể.',
};

export const emptyAuditScores = () => Object.fromEntries(
  HUMAN_AUDIT_RUBRIC.map((criterion) => [criterion.key, null]),
) as Record<string, number | null>;

export const cappedSocraticScore = (scores: Record<string, unknown> | null | undefined) => {
  if (!scores || !['A1', 'A2', 'A3'].every((key) => Number.isFinite(Number(scores[key])))) return null;
  const raw = (Number(scores.A1) + Number(scores.A2) + Number(scores.A3)) / 3;
  return Number(scores.A1) <= 1 ? Math.min(raw, 1) : raw;
};
