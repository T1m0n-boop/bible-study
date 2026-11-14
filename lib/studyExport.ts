// Browser-only exports. Install: npm install pdfmake docx && npm install -D @types/pdfmake
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

export type ExportLanguage = "en" | "ro";
export type ExportSupplement = { item_type: "reference" | "hint" | "explanation"; content: string; sort_order: number };
export type ExportNote = {
  question_number: number; question_text: string; note_text: string;
  table_config: { headers: string[]; rows: string[] } | null;
  table_answers: Record<string, string> | null;
  supplements: ExportSupplement[] | null;
};
export type ExportStudy = { title: string; passage: string | null; sessionName: string | null; sessionId: string; notes: ExportNote[] };

const labels = {
  en: { notes: "My notes", table: "Table answers", reference: "Bible reference", hint: "Hint", explanation: "Explanation", question: "Question", session: "Bible Study Session", empty: "No notes entered", category: "Category", answer: "Answer" },
  ro: { notes: "Notițele mele", table: "Răspunsuri în tabel", reference: "Referință biblică", hint: "Indiciu", explanation: "Explicație", question: "Întrebarea", session: "Sesiune de studiu biblic", empty: "Nu au fost introduse notițe", category: "Categorie", answer: "Răspuns" },
};

function safeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 65) || "bible-study";
}

export async function downloadStudyPdf(study: ExportStudy, language: ExportLanguage, size: "mobile" | "a4") {
  const pdfModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfModule.default;
  // pdfmake's bundled Roboto fonts support Romanian diacritics.
  pdfMake.addVirtualFileSystem(fontsModule.default);
  const l = labels[language];
  const content: Content[] = [
    { text: study.title, style: "title" },
    ...(study.passage ? [{ text: study.passage, style: "passage" } as Content] : []),
    { text: study.sessionName || l.session, style: "session" },
  ];
  for (const note of study.notes) {
    content.push({ text: `${l.question} ${note.question_number}`, style: "questionLabel", margin: [0, 14, 0, 3] });
    content.push({ text: note.question_text, style: "question" });
    content.push({ text: l.notes, style: "sectionLabel", margin: [0, 9, 0, 3] });
    content.push({ text: note.note_text.trim() || l.empty, style: "note" });
    if (note.table_config?.rows?.length) {
      content.push({ text: l.table, style: "sectionLabel", margin: [0, 10, 0, 4] });
      const h = note.table_config.headers;
      const answers = note.table_answers || {};
      content.push({ table: { headerRows: 1, widths: ["43%", "57%"], body: [
        [h?.[0] || l.category, h?.[1] || l.answer],
        ...note.table_config.rows.map((row, index) => [row, answers[String(index)] || " "]),
      ] }, layout: "lightHorizontalLines", fontSize: size === "mobile" ? 9 : 10 });
    }
    for (const item of [...(note.supplements || [])].sort((a,b) => a.sort_order-b.sort_order)) {
      content.push({ text: l[item.item_type], style: "sectionLabel", margin: [0, 10, 0, 3] });
      content.push({ text: item.content, style: "supplement" });
    }
  }
  const mobile = size === "mobile";
  const definition: TDocumentDefinitions = {
    pageSize: mobile ? { width: 320, height: 568 } : "A4",
    pageMargins: mobile ? [19, 24, 19, 28] : [45, 48, 45, 48],
    defaultStyle: { font: "Roboto", fontSize: mobile ? 11 : 11, lineHeight: 1.3, color: "#263245" },
    styles: {
      title: { fontSize: mobile ? 18 : 21, bold: true, color: "#253d8c", margin: [0,0,0,6] },
      passage: { fontSize: 11, color: "#4259a4", margin: [0,0,0,4] },
      session: { fontSize: 9, color: "#657184", margin: [0,0,0,12] },
      questionLabel: { fontSize: 9, bold: true, color: "#4259a4" },
      question: { fontSize: mobile ? 12 : 13, bold: true },
      sectionLabel: { fontSize: 9, bold: true, color: "#4259a4" },
      note: { fontSize: 11 }, supplement: { fontSize: 10, color: "#3c4858" },
    },
    content,
  };
  pdfMake.createPdf(definition).download(`${safeName(study.title)}-${mobile ? "mobile" : "A4"}.pdf`);
}

export async function downloadStudyDocx(study: ExportStudy, language: ExportLanguage) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel } = await import("docx");
  const l = labels[language];
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ text: study.title, heading: HeadingLevel.TITLE }),
    ...(study.passage ? [new Paragraph({ text: study.passage, heading: HeadingLevel.HEADING_2 })] : []),
    new Paragraph({ text: study.sessionName || l.session, spacing: { after: 260 } }),
  ];
  for (const note of study.notes) {
    children.push(new Paragraph({ text: `${l.question} ${note.question_number}`, heading: HeadingLevel.HEADING_2, spacing: { before: 260 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: note.question_text, bold: true })], spacing: { after: 140 } }));
    children.push(new Paragraph({ text: l.notes, heading: HeadingLevel.HEADING_3 }));
    for (const line of (note.note_text || "").split(/\r?\n/)) children.push(new Paragraph({ text: line || " " }));
    if (note.table_config?.rows?.length) {
      children.push(new Paragraph({ text: l.table, heading: HeadingLevel.HEADING_3, spacing: { before: 180 } }));
      const makeRow = (left: string, right: string) => new TableRow({ children: [
        new TableCell({ children: [new Paragraph(left || " ")] }),
        new TableCell({ children: [new Paragraph(right || " ")] }),
      ] });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
        makeRow(note.table_config.headers?.[0] || l.category, note.table_config.headers?.[1] || l.answer),
        ...note.table_config.rows.map((row, index) => makeRow(row, note.table_answers?.[String(index)] || " ")),
      ] }));
    }
    for (const item of [...(note.supplements || [])].sort((a,b) => a.sort_order-b.sort_order)) {
      children.push(new Paragraph({ text: l[item.item_type], heading: HeadingLevel.HEADING_3, spacing: { before: 180 } }));
      for (const line of item.content.split(/\r?\n/)) children.push(new Paragraph({ text: line || " " }));
    }
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${safeName(study.title)}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
