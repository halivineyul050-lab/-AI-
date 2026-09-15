from pathlib import Path
import argparse
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "泥壳AI工具站_竞品横纵分析报告.md"
OUTPUT = ROOT / "output" / "pdf" / "泥壳AI工具站_竞品横纵分析报告.pdf"

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
FONT = "STSong-Light"


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"(https?://[^\s<]+)", r"<link href='\1' color='#2563eb'>\1</link>", text)
    return text


styles = getSampleStyleSheet()
body = ParagraphStyle(
    "BodyCN", parent=styles["BodyText"], fontName=FONT, fontSize=9.4,
    leading=16.2, textColor=colors.HexColor("#263444"), alignment=TA_JUSTIFY,
    spaceAfter=4.5, wordWrap="CJK",
)
quote = ParagraphStyle(
    "QuoteCN", parent=body, leftIndent=8, rightIndent=8, borderColor=colors.HexColor("#2563eb"),
    borderWidth=0, borderPadding=7, backColor=colors.HexColor("#f1f5f9"),
    textColor=colors.HexColor("#475569"),
)
bullet = ParagraphStyle("BulletCN", parent=body, leftIndent=13, firstLineIndent=-7, bulletIndent=4)
h1 = ParagraphStyle("H1CN", parent=body, fontSize=22, leading=30, textColor=colors.HexColor("#173f66"), alignment=TA_CENTER)
h2 = ParagraphStyle("H2CN", parent=body, fontSize=15, leading=22, textColor=colors.HexColor("#0f766e"), spaceBefore=12, spaceAfter=7)
h3 = ParagraphStyle("H3CN", parent=body, fontSize=12, leading=18, textColor=colors.HexColor("#2563eb"), spaceBefore=8, spaceAfter=4)
h4 = ParagraphStyle("H4CN", parent=body, fontSize=10.5, leading=17, textColor=colors.HexColor("#6d28d9"), spaceBefore=6, spaceAfter=3)
small = ParagraphStyle("SmallCN", parent=body, fontSize=8, leading=12, textColor=colors.HexColor("#64748b"))


class ReportDoc(BaseDocTemplate):
    def __init__(self, filename, title="泥壳AI工具站竞品横纵分析"):
        self.report_title = title
        super().__init__(filename, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                         topMargin=20 * mm, bottomMargin=18 * mm,
                         title=title, author="Codex")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="main", frames=frame, onPage=self.decorate))

    def decorate(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(18 * mm, A4[1] - 11 * mm, self.report_title)
        canvas.drawCentredString(A4[0] / 2, 9 * mm, f"第 {doc.page} 页")
        canvas.setStrokeColor(colors.HexColor("#dbe4ee"))
        canvas.line(18 * mm, A4[1] - 13 * mm, A4[0] - 18 * mm, A4[1] - 13 * mm)
        canvas.restoreState()


def parse_table(lines):
    rows = []
    for line in lines:
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", p) for p in parts):
            continue
        rows.append([Paragraph(inline(p), small) for p in parts])
    if not rows:
        return Spacer(1, 1)
    widths = [165 * mm / len(rows[0])] * len(rows[0])
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#173f66")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def build_story(markdown: str):
    lines = markdown.splitlines()
    title = lines[0].removeprefix("# ").strip()
    meta = lines[1].removeprefix(">").strip()
    story = [Spacer(1, 42 * mm), Paragraph(inline(title), h1), Spacer(1, 10 * mm),
             Paragraph(inline(meta), ParagraphStyle("Meta", parent=small, alignment=TA_CENTER, fontSize=9, leading=15)),
             Spacer(1, 22 * mm), Paragraph("横纵分析法深度研究报告", ParagraphStyle("Sub", parent=h3, alignment=TA_CENTER)),
             Spacer(1, 42 * mm), Paragraph("基于本地产品实测与国内外代表性竞品公开页面", ParagraphStyle("Note", parent=small, alignment=TA_CENTER)), PageBreak()]
    i = 2
    paragraph = []

    def flush():
        if paragraph:
            story.append(Paragraph(inline("".join(paragraph).strip()), body))
            paragraph.clear()

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            flush()
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and lines[i + 1].startswith("|"):
            flush()
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            story.extend([Spacer(1, 4), parse_table(table_lines), Spacer(1, 7)])
            continue
        if line.startswith("#### "):
            flush(); story.append(Paragraph(inline(line[5:]), h4))
        elif line.startswith("### "):
            flush(); story.append(Paragraph(inline(line[4:]), h3))
        elif line.startswith("## "):
            flush(); story.append(Paragraph(inline(line[3:]), h2))
        elif line.startswith("> "):
            flush(); story.append(Paragraph(inline(line[2:]), quote))
        elif re.match(r"^[-*] ", line):
            flush(); story.append(Paragraph("• " + inline(line[2:]), bullet))
        elif re.match(r"^\d+\. ", line):
            flush(); story.append(Paragraph(inline(line), bullet))
        else:
            paragraph.append(line.strip())
        i += 1
    flush()
    return story


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", default=str(SOURCE))
    parser.add_argument("output", nargs="?", default=str(OUTPUT))
    parser.add_argument("--title", default="泥壳AI工具站竞品横纵分析")
    args = parser.parse_args()
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = ReportDoc(str(output), args.title)
    doc.build(build_story(source.read_text(encoding="utf-8")))
    print(output)


if __name__ == "__main__":
    main()
