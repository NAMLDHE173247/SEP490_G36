from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUTPUT = Path(r"D:\Sep_G36\Bao_cao_toi_uu_Hybrid_Router_2026-07-24.docx")

BLUE = "2E74B5"
DARK_BLUE = "1F4D78"
NAVY = "17365D"
MUTED = "667085"
LIGHT_GRAY = "F2F4F7"
LIGHT_BLUE = "EAF2F8"
LIGHT_GREEN = "EAF6EE"
GREEN = "1E6B3A"
WHITE = "FFFFFF"
BORDER = "C8D0D9"


def set_font(run, name="Calibri", size=11, bold=False, color="222222", italic=False):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for edge, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=BORDER, size=6):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), str(size))
        tag.set(qn("w:space"), "0")
        tag.set(qn("w:color"), color)


def set_table_geometry(table, widths_dxa):
    total = sum(widths_dxa)
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(total))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            width = widths_dxa[min(idx, len(widths_dxa) - 1)]
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            cell.width = Inches(width / 1440)
            set_cell_margins(cell)


def style_cell_text(cell, size=9.5, bold=False, color="222222", align=WD_ALIGN_PARAGRAPH.LEFT):
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    for paragraph in cell.paragraphs:
        paragraph.alignment = align
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1.05
        for run in paragraph.runs:
            set_font(run, size=size, bold=bold, color=color)


def add_table(doc, headers, rows, widths_dxa, numeric_columns=None, improvement_column=None):
    numeric_columns = numeric_columns or set()
    table = doc.add_table(rows=1, cols=len(headers))
    set_table_geometry(table, widths_dxa)
    set_table_borders(table)
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        cell.text = header
        set_cell_shading(cell, LIGHT_GRAY)
        style_cell_text(cell, size=9.2, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER)
    for row_values in rows:
        row = table.add_row()
        for idx, value in enumerate(row_values):
            cell = row.cells[idx]
            cell.text = str(value)
            if improvement_column is not None and idx == improvement_column:
                set_cell_shading(cell, LIGHT_GREEN)
                style_cell_text(cell, size=9.2, bold=True, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER)
            else:
                style_cell_text(
                    cell,
                    size=9.2,
                    bold=False,
                    align=WD_ALIGN_PARAGRAPH.CENTER if idx in numeric_columns else WD_ALIGN_PARAGRAPH.LEFT,
                )
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_heading(doc, text, level=1):
    paragraph = doc.add_paragraph(style=f"Heading {level}")
    paragraph.add_run(text)
    return paragraph


def add_body(doc, text, bold_prefix=None, after=6):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = 1.10
    if bold_prefix and text.startswith(bold_prefix):
        first = paragraph.add_run(bold_prefix)
        set_font(first, bold=True, color=NAVY)
        rest = paragraph.add_run(text[len(bold_prefix):])
        set_font(rest)
    else:
        run = paragraph.add_run(text)
        set_font(run)
    return paragraph


def add_callout(doc, label, text, fill=LIGHT_BLUE):
    table = doc.add_table(rows=1, cols=1)
    set_table_geometry(table, [9360])
    set_table_borders(table, color=BLUE, size=8)
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(f"{label}: ")
    set_font(run, bold=True, color=NAVY)
    run = paragraph.add_run(text)
    set_font(run, color=NAVY)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)


def configure_document(doc):
    doc.settings.odd_and_even_pages_header_footer = False
    section = doc.sections[0]
    section.different_first_page_header_footer = False
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.82)
    section.bottom_margin = Inches(0.78)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.36)
    section.footer_distance = Inches(0.36)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.10

    heading_tokens = {
        "Heading 1": (16, BLUE, 16, 8),
        "Heading 2": (13, BLUE, 12, 6),
        "Heading 3": (12, DARK_BLUE, 8, 4),
    }
    for style_name, (size, color, before, after) in heading_tokens.items():
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    core = doc.core_properties
    core.title = "Báo cáo tối ưu tốc độ Hybrid Router"
    core.subject = "Đối chiếu benchmark trước và sau tối ưu"
    core.author = "SEP490 G36"
    core.keywords = "Hybrid Router, benchmark, cache, sticky route, model switching"


def build_report():
    doc = Document()
    configure_document(doc)

    kicker = doc.add_paragraph()
    kicker.paragraph_format.space_after = Pt(3)
    run = kicker.add_run("BÁO CÁO KỸ THUẬT • 24/07/2026")
    set_font(run, size=9, bold=True, color=BLUE)

    title = doc.add_paragraph()
    title.paragraph_format.space_before = Pt(0)
    title.paragraph_format.space_after = Pt(7)
    title.paragraph_format.keep_with_next = True
    run = title.add_run("Tối ưu tốc độ Hybrid Router")
    set_font(run, size=27, bold=True, color=NAVY)

    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(13)
    run = subtitle.add_run("Đánh giá ba phương án: ghim model General/OTHER, giữ cache lâu hơn và ổn định tuyến")
    set_font(run, size=12.5, color=MUTED)

    add_callout(
        doc,
        "Kết luận chính",
        "Thời gian end-to-end trung bình giảm từ 36,53 giây xuống 15,00 giây (-58,9%). "
        "Router latency giảm 83,2%, model-switch latency giảm 66,6% và tỷ lệ cache hit tăng từ 16,7% lên 50%.",
    )

    add_heading(doc, "1. Mục tiêu và phạm vi", 1)
    add_body(
        doc,
        "Báo cáo đánh giá hiệu quả của các thay đổi nhằm giảm thời gian phản hồi trong chế độ Hybrid Router, "
        "đặc biệt khi hội thoại liên tục chuyển giữa OTHER, MATH, HISTORY và ENGLISH. Phạm vi gồm số liệu baseline "
        "từ tệp export ban đầu, các thay đổi đã triển khai, kết quả benchmark lại và hướng xử lý hội thoại dài.",
    )

    add_heading(doc, "2. Thiết lập kiểm thử", 1)
    add_table(
        doc,
        ["Hạng mục", "Thiết lập"],
        [
            ["Nguồn baseline", r"D:\manual_hybrid_speed_2026-07-24T11-20-42-371Z.json"],
            ["Số lượt", "6 lượt, hoàn thành 6/6"],
            ["Chuỗi chủ đề", "OTHER → MATH → MATH → OTHER → HISTORY → ENGLISH"],
            ["Giới hạn sinh", "256 output tokens/lượt"],
            ["Tham số", "temperature 0,7; top-k 50; top-p 0,95; repetition penalty 1,1"],
            ["Model", "OTHER, MathQwen, HistoryQwen7, English_Qwen"],
        ],
        [2520, 6840],
    )
    add_body(
        doc,
        "Lưu ý dữ liệu: trường cấu hình tổng quát trong file export ghi maxNewTokens = 512, nhưng từng lượt đo thực tế đều ghi max_new_tokens = 256. "
        "Báo cáo sử dụng giá trị thực tế theo từng lượt và benchmark sau cũng giữ mức 256.",
        after=4,
    )

    add_heading(doc, "3. Thông số trước tối ưu", 1)
    baseline_rows = [
        ["Router latency trung bình", "1.548,8 ms"],
        ["Model-switch latency trung bình", "23.130,5 ms"],
        ["Generation latency trung bình", "11.266,0 ms"],
        ["TTFT trung bình", "2.361,2 ms"],
        ["End-to-end trung bình", "36.530,3 ms"],
        ["End-to-end trung vị", "23.850 ms"],
        ["End-to-end P95", "60.346 ms"],
        ["Cache hit", "1/6 (16,7%)"],
        ["Switch load / eviction", "4 / 4"],
        ["Input token lớn nhất", "1.081 tokens"],
        ["Lượt chạm output cap", "3/6"],
    ]
    add_table(doc, ["Chỉ số", "Baseline"], baseline_rows, [6120, 3240], numeric_columns={1})

    add_heading(doc, "4. Vấn đề được xác định", 1)
    add_body(doc, "Model thrashing: chỉ dùng một GPU slot khiến OTHER bị đẩy ra khi gọi model chuyên môn và phải tải lại khi quay về hội thoại chung.", bold_prefix="Model thrashing:")
    add_body(doc, "Router lặp lại: các câu tiếp nối cùng môn vẫn gọi router LLM, tạo thêm khoảng 1–5 giây dù không cần đổi model.", bold_prefix="Router lặp lại:")
    add_body(doc, "Lịch sử tăng tuyến tính: toàn bộ hội thoại được gửi lại ở mỗi lượt; input token tăng từ 268 lên 1.081, làm tăng chi phí tokenize/prefill và TTFT.", bold_prefix="Lịch sử tăng tuyến tính:")
    add_body(doc, "Cache chưa tối ưu: model phổ biến không được ghim riêng, dẫn đến 4 lần eviction trong 6 lượt.", bold_prefix="Cache chưa tối ưu:")

    add_heading(doc, "5. Các giải pháp đã áp dụng", 1)
    solution_rows = [
        ["1", "Ghim General/OTHER", "OTHER đóng vai trò model tổng quát, preload và ghim ở slot 1. Specialist chỉ luân chuyển tại slot 2.", "Loại bỏ việc tải lại OTHER khi quay về giao tiếp chung."],
        ["4", "Giữ cache lâu hơn", "Không unload sau từng câu; lưu trạng thái pinned, loaded_at và last_used_at. Chỉ thay specialist khi cần.", "Tăng cache hit và giảm eviction."],
        ["5", "Route stabilization", "Giữ sticky route theo session trong 30 phút. Nếu không có tín hiệu đổi môn rõ ràng thì tái sử dụng subject/model trước đó.", "Câu tiếp nối cùng môn không gọi router LLM."],
        ["Bổ sung", "Giới hạn lịch sử", "Chỉ gửi tối đa 2 cặp user/assistant hoàn chỉnh cùng môn, giới hạn 2.400 ký tự.", "Chi phí context không còn tăng theo toàn bộ độ dài chat."],
    ]
    add_table(
        doc,
        ["#", "Giải pháp", "Cách triển khai", "Tác động kỳ vọng"],
        solution_rows,
        [720, 1800, 4260, 2580],
    )

    add_heading(doc, "6. Kết quả benchmark sau tối ưu", 1)
    comparison_rows = [
        ["Router latency TB", "1.548,8 ms", "260,2 ms", "-83,2%"],
        ["Model-switch TB", "23.130,5 ms", "7.714,3 ms", "-66,6%"],
        ["Generation TB", "11.266,0 ms", "6.647,7 ms", "-41,0%"],
        ["End-to-end TB", "36.530,3 ms", "14.996,3 ms", "-58,9%"],
        ["End-to-end trung vị", "23.850 ms", "11.314 ms", "-52,6%"],
        ["Cache hit", "16,7%", "50,0%", "Tăng 3 lần"],
        ["Input token lớn nhất", "1.081", "410", "-62,1%"],
        ["Model eviction", "4", "2", "-50,0%"],
    ]
    add_table(
        doc,
        ["Chỉ số", "Trước", "Sau", "Thay đổi"],
        comparison_rows,
        [3420, 1980, 1980, 1980],
        numeric_columns={1, 2, 3},
        improvement_column=3,
    )

    add_heading(doc, "6.1. Chi tiết từng lượt sau tối ưu", 2)
    turn_rows = [
        ["1", "OTHER", "rule", "40", "0", "2.707", "3.078", "Có", "268"],
        ["2", "MATH", "llm", "1.471", "14.950", "7.165", "23.931", "Không", "272"],
        ["3", "MATH", "sticky", "7", "0", "5.995", "6.564", "Có", "410"],
        ["4", "OTHER", "rule", "1", "0", "10.903", "11.314", "Có", "400"],
        ["5", "HISTORY", "rule", "15", "15.724", "8.617", "24.661", "Không", "272"],
        ["6", "ENGLISH", "rule", "27", "15.612", "4.499", "20.430", "Không", "80"],
    ]
    add_table(
        doc,
        ["Lượt", "Môn", "Route", "Router ms", "Switch ms", "Gen ms", "E2E ms", "Cache", "Input"],
        turn_rows,
        [660, 1120, 980, 1100, 1200, 1040, 1160, 1000, 1100],
        numeric_columns={0, 3, 4, 5, 6, 8},
    )
    add_callout(
        doc,
        "Quan sát",
        "Lượt MATH thứ hai sử dụng sticky route nên router chỉ mất 7 ms và không phải đổi model. Lượt ENGLISH chỉ gửi 80 input tokens thay vì 1.081 tokens như baseline.",
        fill=LIGHT_GREEN,
    )

    add_heading(doc, "7. Xử lý hội thoại dài và chuyển model", 1)
    add_body(
        doc,
        "Cần tách hai loại chi phí: model-switch latency là thời gian tải trọng số model vào GPU; còn lịch sử dài làm tăng tokenize/prefill và thời gian đến token đầu tiên. "
        "Việc ghim model xử lý loại chi phí thứ nhất, trong khi cửa sổ lịch sử theo môn xử lý loại chi phí thứ hai.",
    )
    history_rows = [
        ["Đã áp dụng", "Subject-scoped window", "Chỉ lấy tối đa 2 lượt hoàn chỉnh gần nhất thuộc đúng môn đang xử lý, tối đa 2.400 ký tự."],
        ["Khuyến nghị tiếp", "Rolling summary", "Khi lịch sử vượt ngưỡng, tạo bản tóm tắt trạng thái theo từng môn và gửi summary + 1–2 lượt gần nhất."],
        ["Khuyến nghị nâng cao", "KV/prefix cache", "Cache past_key_values theo session và model để tránh prefill lại prefix; cần TTL/LRU và giới hạn VRAM."],
        ["Tùy chọn", "Relevant-turn retrieval", "Truy xuất một số lượt cũ liên quan bằng từ khóa hoặc embedding thay vì gửi toàn bộ hội thoại."],
    ]
    add_table(doc, ["Mức", "Giải pháp", "Mô tả"], history_rows, [1740, 2100, 5520])

    add_heading(doc, "8. Kết luận và giới hạn", 1)
    add_body(
        doc,
        "Ba phương án 1, 4 và 5 mang lại cải thiện rõ rệt: thời gian end-to-end trung bình giảm 58,9%, model-switch giảm 66,6% và router giảm 83,2%. "
        "Kiến trúc hai slot giúp OTHER/General luôn sẵn sàng, còn sticky route loại bỏ các lần phân tuyến không cần thiết.",
    )
    add_body(
        doc,
        "Kết quả hiện tại dựa trên 6 lượt và chịu ảnh hưởng của tunnel, tải GPU và dao động sinh token. Để có kết luận thống kê ổn định, nên chạy cùng kịch bản từ 3–5 lần, báo cáo trung bình, P50/P95 và độ lệch chuẩn.",
    )
    add_callout(
        doc,
        "Đề xuất ưu tiên tiếp theo",
        "Giữ cấu hình hiện tại, bổ sung rolling summary theo môn trước; chỉ triển khai KV/prefix cache sau khi đo ngân sách VRAM và tỷ lệ session đồng thời.",
    )

    add_heading(doc, "Phụ lục A. Vị trí triển khai chính", 1)
    code_rows = [
        ["Sticky route", r"backend\src\services\routing\routingOrchestrator.ts"],
        ["Slot và history window", r"backend\src\controllers\chatController.ts"],
        ["Preload/pin từ giao diện", r"frontend_v2\src\pages\ChatView.tsx"],
        ["Pinned slot metadata", r"gpu-service\app.py"],
    ]
    add_table(doc, ["Thành phần", "Tệp"], code_rows, [2880, 6480])

    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(build_report())
