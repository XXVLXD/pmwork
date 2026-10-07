import { colors, dateLabel, monday, phases, schedule, type Language, type Roadmap, type ScheduledTask } from './model';
import { dictionaries } from './i18n';
import fontUrl from './assets/DejaVuSans.ttf?url';

const W = 1280, H = 720, MARGIN = 44, LEFT = 285, TOP = 191, ROW = 52, CHART_WIDTH = W - LEFT - MARGIN;
type Draw = {
  rect: (x: number, y: number, w: number, h: number, color: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number, color: string, width?: number) => void;
  text: (text: string, x: number, y: number, size: number, color: string, width: number) => void;
};
type Page = { tasks: ScheduledTask[]; start: number; end: number };
export function makeExportPages(project: Roadmap): Page[] {
  const tasks = schedule(project.tasks);
  if (!tasks.length) throw new Error('noTasksExport');
  const first = monday(Math.min(...tasks.map(t => t.start)));
  const end = Math.max(...tasks.map(t => t.end));
  const pages: Page[] = [];
  for (let start = first; start < end; start += 42) {
    const relevant = tasks.filter(task => task.start < start + 42 && task.end > start);
    for (let row = 0; row < relevant.length; row += 8) {
      pages.push({ tasks: relevant.slice(row, row + 8), start, end: Math.min(start + 42, Math.max(end, start + 14)) });
    }
  }
  return pages;
}
function render(draw: Draw, project: Roadmap, lang: Language, page: Page, index: number, total: number, baseline: boolean) {
  const t = dictionaries[lang];
  const { tasks, start, end } = page;
  const span = end - start;
  const scale = CHART_WIDTH / span;
  draw.rect(0, 0, W, H, '#ffffff');
  draw.rect(MARGIN, 37, 5, 16, '#6864df');
  draw.text('ROADLY / ROADMAP STUDIO', MARGIN + 15, 35, 11, '#8e8baf', 900);
  draw.text(project.title, MARGIN, 67, 28, '#333a55', W - 2 * MARGIN);
  draw.text(project.description, MARGIN, 111, 12, '#8c94a8', W - 2 * MARGIN);
  draw.text(`${t.range}: ${dateLabel(start, lang, true)} — ${dateLabel(end - 1, lang, true)}`, MARGIN, 145, 11, '#7d829c', 760);
  draw.rect(MARGIN, TOP - 23, W - 2 * MARGIN, 24, '#f5f6fa');
  draw.text(t.taskOwner, MARGIN + 10, TOP - 18, 8, '#9097ae', LEFT - MARGIN - 20);
  for (let day = start; day < end; day++) {
    const x = LEFT + (day - start) * scale;
    const dow = new Date(day * 86400000).getUTCDay();
    if ([0, 6].includes(dow)) draw.rect(x, TOP, scale, tasks.length * ROW, '#f8f9fc');
    if ((day - start) % 7 === 0) {
      draw.text(dateLabel(day, lang), x + 3, TOP - 18, 8, '#949aaf', scale * 7 - 4);
      draw.line(x, TOP, x, TOP + tasks.length * ROW, '#e9ecf3', .7);
    }
  }
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]; const y = TOP + i * ROW; const color = colors[task.phase];
    draw.line(MARGIN, y + ROW, W - MARGIN, y + ROW, '#edf0f5', .7);
    draw.rect(MARGIN + 9, y + 14, 5, 5, color);
    draw.text(task.title, MARGIN + 22, y + 8, 11, '#58617b', LEFT - MARGIN - 30);
    draw.text(`${task.owner || t.unassigned} · ${t[task.status]}`, MARGIN + 22, y + 28, 8, '#939bb0', LEFT - MARGIN - 30);
    const x = LEFT + (Math.max(task.start, start) - start) * scale + 2;
    const width = (Math.min(task.end, end) - Math.max(task.start, start)) * scale - 4;
    if (width > 0) {
      draw.rect(x, y + 12, width, 23, color);
      if (width > 55) draw.text(`${task.duration}${t.day} · ${task.title}`, x + 6, y + 17, 8, '#ffffff', width - 12);
    }
    const base = baseline ? project.baseline?.[task.id] : undefined;
    if (base && base.start < end && base.end > start) {
      const bx = LEFT + (Math.max(base.start, start) - start) * scale + 2;
      const bw = (Math.min(base.end, end) - Math.max(base.start, start)) * scale - 4;
      if (bw > 0) draw.rect(bx, y + 40, bw, 3, '#c5cada');
    }
  }
  draw.line(LEFT, TOP - 23, LEFT, TOP + tasks.length * ROW, '#e5e9f2');
  phases.forEach((phase, i) => { draw.rect(MARGIN + i * 175, 641, 7, 7, colors[phase]); draw.text(t[phase], MARGIN + i * 175 + 14, 637, 10, '#949ab0', 152); });
  if (baseline && project.baseline) { draw.rect(805, 643, 20, 3, '#c5cada'); draw.text(t.baseline, 833, 637, 9, '#949ab0', 300); }
  draw.line(MARGIN, 667, W - MARGIN, 667, '#e9ecf3');
  draw.text(`roadly.  /  ${t.calendarDays}`, MARGIN, 680, 9, '#a5acc0', 700);
  draw.text(`${t.page} ${index + 1} / ${total}`, W - 185, 680, 9, '#a5acc0', 141);
}
function base64(bytes: Uint8Array) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
let fontPromise: Promise<string> | undefined;
async function getFont() {
  if (!fontPromise) fontPromise = fetch(fontUrl).then(response => {
    if (!response.ok) throw new Error('fontUnavailable'); return response.arrayBuffer();
  }).then(buffer => base64(new Uint8Array(buffer))).catch(error => { fontPromise = undefined; throw error; });
  return fontPromise;
}
export async function exportRoadmap(project: Roadmap, lang: Language, format: 'pdf' | 'pptx', baseline = true) {
  const pages = makeExportPages(project);
  const filename = project.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 70) || 'roadmap';
  if (format === 'pdf') {
    const [{ jsPDF }, font] = await Promise.all([import('jspdf'), getFont()]);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
    pdf.addFileToVFS('DejaVuSans.ttf', font); pdf.addFont('DejaVuSans.ttf', 'Roadly', 'normal'); pdf.setFont('Roadly');
    pdf.setProperties({ title: project.title, subject: project.description, author: 'Roadly', creator: 'Roadly' });
    const draw: Draw = {
      rect(x, y, w, h, color) { pdf.setFillColor(color); pdf.rect(x, y, w, h, 'F'); },
      line(x1, y1, x2, y2, color, width = 1) { pdf.setDrawColor(color); pdf.setLineWidth(width); pdf.line(x1, y1, x2, y2); },
      text(text, x, y, size, color, width) {
        pdf.setFontSize(size); pdf.setTextColor(color);
        let display = text;
        if (pdf.getTextWidth(display) > width) {
          while (display.length && pdf.getTextWidth(display + '…') > width) display = display.slice(0, -1);
          display += '…';
        }
        pdf.text(display, x, y + size, { baseline: 'alphabetic' });
      },
    };
    pages.forEach((page, i) => { if (i) pdf.addPage([W, H], 'landscape'); render(draw, project, lang, page, i, pages.length, baseline); });
    pdf.save(filename + '.pdf');
  } else {
    const { default: pptxgen } = await import('pptxgenjs');
    const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Roadly'; pptx.subject = project.description; pptx.title = project.title; pptx.company = 'Roadly';
    const locale = lang === 'uk' ? 'uk-UA' : lang === 'ru' ? 'ru-RU' : 'en-GB';
    pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
    pages.forEach((page, i) => {
      const slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' };
      slide.addNotes(`${project.title}\n${project.description}\n${dictionaries[lang].calendarDays}\n` + page.tasks.map(t => `${t.title}: ${dateLabel(t.start, lang, true)} — ${dateLabel(t.end - 1, lang, true)}; ${t.owner}; ${dictionaries[lang][t.status]}`).join('\n'));
      const draw: Draw = {
        rect(x, y, w, h, color) { slide.addShape(pptx.ShapeType.rect, { x: x / 96, y: y / 96, w: w / 96, h: h / 96, fill: { color: color.slice(1) }, line: { color: color.slice(1), transparency: 100 } }); },
        line(x1, y1, x2, y2, color, width = 1) { slide.addShape(pptx.ShapeType.line, { x: x1 / 96, y: y1 / 96, w: (x2 - x1) / 96, h: (y2 - y1) / 96, line: { color: color.slice(1), width: width * .75 } }); },
        text(text, x, y, size, color, width) { slide.addText(text, { x: x / 96, y: y / 96, w: width / 96, h: (size * 1.45) / 96, fontFace: 'Arial', fontSize: size * .75, lang: locale, color: color.slice(1), margin: 0, breakLine: false, fit: 'shrink', valign: 'middle', paraSpaceAfter: 0 }); },
      };
      render(draw, project, lang, page, i, pages.length, baseline);
    });
    await pptx.writeFile({ fileName: filename + '.pptx' });
  }
}
