import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, FileChartColumn, FileText, Flag, FolderOpen, Globe2, Layers3, LayoutDashboard, Link2, ListChecks, LoaderCircle, Plus, Redo2, Route, Settings2, ShieldCheck, Sparkles, Trash2, Undo2, WandSparkles, X } from 'lucide-react';
import { baselineOf, colors, dateLabel, descendants, fromISO, insertTask, makeDemo, monday, phases, removeTask, schedule, statuses, today, toISO, validateRoadmap, type Language, type Roadmap, type ScheduledTask, type Task } from './model';
import { dictionaries, type Dictionary } from './i18n';

const STORAGE_KEY = 'roadly.project.v1';
const ROW = 76;
type Notice = { text: string; error?: boolean };
function loadInitial() {
  let lang: Language = 'ru';
  try { const stored = localStorage.getItem('roadly.language'); if (stored === 'en' || stored === 'uk' || stored === 'ru') lang = stored; } catch { /* Browser storage may be disabled. */ }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { lang, roadmap: raw ? validateRoadmap(JSON.parse(raw)) : makeDemo(lang), recovery: false };
  } catch { return { lang, roadmap: makeDemo(lang), recovery: true }; }
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export default function App() {
  const [initial] = useState(loadInitial);
  const [compact, setCompact] = useState(() => window.innerWidth <= 760);
  const LABEL = compact ? 184 : 266;
  const [lang, setLang] = useState(initial.lang);
  const t = dictionaries[lang];
  const [history, setHistory] = useState({ past: [] as Roadmap[], present: initial.roadmap, future: [] as Roadmap[] });
  const project = history.present;
  const [storageFailed, setStorageFailed] = useState(initial.recovery);
  const [recovery, setRecovery] = useState(initial.recovery);
  const [preview, setPreview] = useState<Task[] | null>(null);
  const tasks = schedule(preview ?? project.tasks);
  const [editor, setEditor] = useState<{ task?: Task; after?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [guide, setGuide] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<'week' | 'month'>('month');
  const [showBaseline, setShowBaseline] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [lastChange, setLastChange] = useState(0);
  const [viewAnchor, setViewAnchor] = useState(() => monday(initial.roadmap.tasks.length ? Math.min(...schedule(initial.roadmap.tasks).map(t => t.start)) : today()));
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; x: number; start: number; moved: boolean; next: Task[] | null } | null>(null);
  const suppressClick = useRef(false);
  const dayWidth = zoom === 'week' ? 30 : 18;
  const firstDay = tasks.length ? Math.min(...tasks.map(task => task.start)) : today();
  const lastDay = tasks.length ? Math.max(...tasks.map(task => task.end)) : firstDay;
  const baselineEntries = showBaseline && project.baseline ? Object.entries(project.baseline).filter(([id]) => project.tasks.some(t => t.id === id)).map(([, b]) => b) : [];
  const anchor = Math.abs(firstDay - viewAnchor) > 90 ? monday(firstDay) : viewAnchor;
  const rangeStart = Math.min(anchor, monday(firstDay), ...baselineEntries.map(b => monday(b.start)));
  const rangeEnd = Math.max(rangeStart + (zoom === 'week' ? 35 : 42), lastDay + 5, ...baselineEntries.map(b => b.end + 2));
  const dayCount = Math.min(2190, rangeEnd - rangeStart);
  const chartWidth = dayCount * dayWidth;
  const days = Array.from({ length: dayCount }, (_, i) => rangeStart + i);
  const baselineChanged = tasks.filter(task => project.baseline?.[task.id] && (project.baseline[task.id].start !== task.start || project.baseline[task.id].end !== task.end));
  const completed = tasks.filter(task => task.status === 'done').length;
  const lateness = project.deadline !== null ? Math.max(0, lastDay - 1 - project.deadline) : 0;
  const taskMap = new Map(tasks.map(task => [task.id, task]));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('roadly.language', lang); } catch { /* Project save feedback is handled below. */ }
  }, [lang]);
  useEffect(() => {
    if (recovery) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); setStorageFailed(false); }
    catch { setStorageFailed(true); }
  }, [project, recovery]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), notice.error ? 10000 : 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!exportMenu) return;
    const close = (event: MouseEvent) => { if (!exportRef.current?.contains(event.target as Node)) setExportMenu(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setExportMenu(false); };
    window.addEventListener('click', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key); };
  }, [exportMenu]);

  function feedback(message: string, error = false) { setNotice({ text: message, error }); }
  function compare(next: Roadmap) {
    const before = new Map(schedule(project.tasks).map(task => [task.id, task]));
    const moved = schedule(next.tasks).filter(task => before.has(task.id) && (before.get(task.id)!.start !== task.start || before.get(task.id)!.end !== task.end)).map(task => task.id);
    setChanged(moved); setLastChange(moved.length);
  }
  function commit(next: Roadmap, message?: string) {
    try {
      validateRoadmap(next); compare(next);
      if (recovery) {
        // Preserve an unreadable saved copy before replacing it with a new project.
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) localStorage.setItem(`${STORAGE_KEY}.recovery.${Date.now()}`, raw); } catch { feedback(t.saveFailed, true); return false; }
        setRecovery(false);
      }
      setHistory(current => ({ past: [...current.past.slice(-49), current.present], present: next, future: [] }));
      if (message) feedback(message);
      return true;
    } catch (error) { feedback(t[(error as Error).message as keyof Dictionary] ?? t.invalidData, true); return false; }
  }
  function travel(direction: 'undo' | 'redo') {
    const source = direction === 'undo' ? history.past : history.future;
    const next = source.at(-1); if (!next) return;
    compare(next);
    setHistory(direction === 'undo'
      ? { past: history.past.slice(0, -1), present: next, future: [...history.future, project] }
      : { past: [...history.past, project], present: next, future: history.future.slice(0, -1) });
  }
  function newTask(after?: string) {
    if (project.tasks.length >= 80) { feedback(t.tooMany, true); return; }
    setEditor({ after: after ?? project.tasks.at(-1)?.id });
  }
  function moveTask(id: string, requestedStart: number, source = project.tasks) {
    const target = schedule(source).find(task => task.id === id)!;
    const minimum = Math.max(fromISO('2000-01-01'), ...target.dependsOn.map(d => taskMap.get(d)!.end));
    return source.map(task => task.id === id ? { ...task, earliestStart: Math.max(minimum, requestedStart) } : task);
  }
  function saveTask(task: Task, after: string | null, existing: boolean) {
    const nextTasks = existing ? project.tasks.map(old => old.id === task.id ? task : old) : insertTask(project.tasks, task, after);
    if (commit({ ...project, tasks: nextTasks }, existing ? t.updated : t.added)) setEditor(null);
  }
  async function exportFile(format: 'pdf' | 'pptx') {
    setExportMenu(false);
    if (!tasks.length) { feedback(t.noTasksExport, true); return; }
    setBusy(true);
    try {
      const { exportRoadmap } = await import('./export');
      await exportRoadmap(project, lang, format, showBaseline); feedback(t.exported);
    } catch { feedback(t.exportFailed, true); }
    finally { setBusy(false); }
  }
  function saveCopy() {
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${project.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 70) || 'roadmap'}.roadly.json`);
  }
  async function openCopy(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('invalidData');
      const next = validateRoadmap(JSON.parse(await file.text()));
      if (!window.confirm(t.importConfirm)) return;
      if (commit(next, t.imported)) setViewAnchor(monday(next.tasks.length ? Math.min(...next.tasks.map(task => task.earliestStart)) : today()));
    } catch { feedback(t.importFailed, true); }
  }
  function replaceProject(demo = false) {
    if (!window.confirm(demo ? t.demoConfirm : t.newConfirm)) return;
    const next = demo ? makeDemo(lang) : { version: 1 as const, title: t.newTitle, description: t.newDescription, tasks: [], baseline: null, deadline: null };
    if (commit(next)) { setViewAnchor(monday(today())); setGuide(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Roadly"><span className="brand-icon"><Route size={23} strokeWidth={2.6}/></span>roadly<span className="brand-dot">.</span></a>
      <div className="workspace-card"><div className="workspace-avatar">P<span/></div><div><strong>{t.workspace}</strong><small>Roadmap studio</small></div></div>
      <p className="nav-label">{t.myProject}</p>
      <nav aria-label={t.myProject}>
        <button className="nav-item selected" onClick={() => scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' })}><LayoutDashboard size={18}/>{t.roadmap}<span className="nav-count">1</span></button>
        <button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={18}/>{t.projectSettings}</button>
      </nav>
      <p className="nav-label tools-label">{t.tools}</p>
      <button className="nav-item" onClick={saveCopy}><ArrowDownToLine size={18}/>{t.exportBackup}</button>
      <button className="nav-item" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={18}/>{t.importBackup}</button>
      <button className="nav-item" onClick={() => setGuide(true)}><CircleHelp size={18}/>{t.howItWorks}</button>
      <button className="new-roadmap" onClick={() => replaceProject()}><Plus size={16}/>{t.reset}</button>
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={20}/><strong>{t.localOnly}</strong><p>{t.localHint}</p></div>
        <div className="language-select"><Globe2 size={17}/><select aria-label={t.language} value={lang} onChange={e => setLang(e.target.value as Language)}><option value="en">English</option><option value="uk">Українська</option><option value="ru">Русский</option></select><ChevronDown size={14}/></div>
        <div className="profile"><span className="avatar">PM</span><div><strong>{t.workspace}</strong><small>{t.footer}</small></div></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><FolderOpen size={16}/><span>{t.workspace}</span><ChevronRight size={13}/><strong>{t.roadmap}</strong></div><button className="help-button" onClick={() => setGuide(true)} aria-label={t.howItWorks}><CircleHelp size={19}/></button></header>
      <div className="main-content">
        <div className="page-heading"><div className="heading-copy"><div className="eyebrow"><span/>{t.studio}</div><button className="project-title" onClick={() => setSettings(true)} title={t.projectSettings}><h1>{project.title}</h1><Settings2 size={19}/></button><p>{project.description}</p></div><div className="heading-actions"><div className={`save-state ${storageFailed ? 'warning' : ''}`}><span/>{storageFailed ? t.saveFailed : t.saved}</div><div className="action-row"><div className="export-wrapper" ref={exportRef}><button className="button secondary" onClick={() => setExportMenu(!exportMenu)} aria-expanded={exportMenu} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>}<span>{busy ? t.exporting : t.export}</span><ChevronDown size={14}/></button>{exportMenu && <div className="export-menu"><div className="menu-heading">{t.exportHint}</div><button onClick={() => exportFile('pdf')}><span className="file-icon pdf"><FileText size={20}/></span><span><strong>{t.pdf}</strong><small>.pdf</small></span><ArrowRight size={15}/></button><button onClick={() => exportFile('pptx')}><span className="file-icon pptx"><FileChartColumn size={20}/></span><span><strong>{t.pptx}</strong><small>{t.editable} · .pptx</small></span><ArrowRight size={15}/></button></div>}</div><button className="button primary" onClick={() => newTask()}><Plus size={18}/>{t.addTask}</button></div></div></div>
        <section className="stats" aria-label={t.projectSettings}>
          <Stat icon={<ListChecks size={19}/>} label={t.tasks} value={String(tasks.length).padStart(2, '0')} detail={`${completed} / ${tasks.length} ${t.completed}`}><div className="mini-progress"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }}/></div></Stat>
          <Stat icon={<Clock3 size={19}/>} label={t.duration} value={String(lastDay - firstDay).padStart(2, '0')} detail={t.calendarDays}/>
          <Stat icon={<Flag size={19}/>} label={t.finish} value={tasks.length ? dateLabel(lastDay - 1, lang) : '—'} detail={project.deadline === null ? t.noDeadline : lateness ? `+${lateness} ${t.late}` : t.onTime} warning={lateness > 0}/>
          <Stat icon={<Layers3 size={19}/>} label={t.shifts} value={String(baselineChanged.length).padStart(2, '0')} detail={baselineChanged.length ? t.shiftedTasks : t.noShifts} accent/>
        </section>
        <section className="roadmap-card">
          <div className="roadmap-top"><div><div className="section-heading"><h2>{t.timeline}</h2><span className="live-badge"><span/>{t.animated}</span></div><p>{t.timelineHint}</p></div><div className="history-buttons"><button className="icon-button" aria-label={t.undo} title={t.undo} disabled={!history.past.length} onClick={() => travel('undo')}><Undo2 size={17}/></button><button className="icon-button" aria-label={t.redo} title={t.redo} disabled={!history.future.length} onClick={() => travel('redo')}><Redo2 size={17}/></button><span className="divider"/><button className="icon-button" title={t.projectSettings} aria-label={t.projectSettings} onClick={() => setSettings(true)}><Settings2 size={18}/></button></div></div>
          <div className="timeline-toolbar"><div className="segmented"><button aria-pressed={zoom === 'week'} className={zoom === 'week' ? 'active' : ''} onClick={() => setZoom('week')}>{t.week}</button><button aria-pressed={zoom === 'month'} className={zoom === 'month' ? 'active' : ''} onClick={() => setZoom('month')}>{t.month}</button></div><div className="toolbar-right"><button className="today-button" onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, (today() - rangeStart) * dayWidth - 160), behavior: 'smooth' })}><CalendarDays size={14}/>{t.today}</button><span className="divider"/><label className="toggle-label" title={t.baselineHint}><input type="checkbox" checked={showBaseline} onChange={e => setShowBaseline(e.target.checked)}/><span className="toggle"/>{t.baseline}</label><button className="baseline-button" onClick={() => commit({ ...project, baseline: baselineOf(project.tasks) }, t.baselineSaved)} disabled={!tasks.length}><CheckCheck size={15}/><span>{t.setBaseline}</span></button></div></div>
          {tasks.length ? <div className="timeline-scroll" ref={scrollRef} data-testid="timeline-scroll">
            <div className="timeline-content" style={{ width: LABEL + chartWidth }}>
              <div className="timeline-header"><div className="column-label" style={{ width: LABEL }}>{t.taskOwner}<span>{tasks.length}</span></div><div className="date-header" style={{ width: chartWidth }}>
                <div className="month-labels">{days.filter((day, i) => i === 0 || new Date(day * 86400000).getUTCDate() === 1).map(day => <span key={day} style={{ left: (day - rangeStart) * dayWidth + 10 }}>{new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(day * 86400000))}</span>)}</div>
                <div className="day-labels">{days.map(day => { const dow = new Date(day * 86400000).getUTCDay(); return <div key={day} className={`day-label ${[0, 6].includes(dow) ? 'weekend' : ''} ${day === today() ? 'is-today' : ''}`} style={{ width: dayWidth }}><span>{zoom === 'week' ? new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(day * 86400000)) : ''}</span><strong>{zoom === 'week' || dow === 1 || day === today() ? new Date(day * 86400000).getUTCDate() : '·'}</strong></div>; })}</div>
              </div></div>
              <div className="timeline-body" style={{ height: tasks.length * ROW }}>
                <div className="grid-columns" style={{ left: LABEL }}>{days.map(day => <div key={day} className={[0, 6].includes(new Date(day * 86400000).getUTCDay()) ? 'weekend' : ''} style={{ width: dayWidth }}/>)}</div>
                <svg className="dependency-lines" style={{ left: LABEL }} width={chartWidth} height={tasks.length * ROW} aria-hidden="true"><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="#b2b7ca"/></marker></defs>{tasks.flatMap((task, index) => task.dependsOn.map(dep => { const parent = taskMap.get(dep)!; const pi = tasks.findIndex(item => item.id === dep); const x1 = (parent.end - rangeStart) * dayWidth - 3; const x2 = (task.start - rangeStart) * dayWidth + 2; const y1 = pi * ROW + 34; const y2 = index * ROW + 34; const mid = Math.max(x1 + 9, x2 - 12); return <path key={`${dep}-${task.id}`} d={`M${x1},${y1} H${mid} V${y2} H${x2}`} fill="none" stroke="#b2b7ca" strokeWidth="1.3" markerEnd="url(#arrow)"/>; }))}</svg>
                {today() >= rangeStart && today() < rangeEnd && <div className="today-line" style={{ left: LABEL + (today() - rangeStart + .5) * dayWidth }}/>} 
                {tasks.map((task, index) => {
                  const base = project.baseline?.[task.id]; const delta = base ? task.end - base.end : 0;
                  return <div className={`task-row ${changed.includes(task.id) ? 'changed' : ''}`} key={task.id} style={{ top: index * ROW, height: ROW }} data-task-id={task.id}>
                    <div className="row-info" style={{ width: LABEL }}><button className="task-info-button" onClick={() => setEditor({ task: project.tasks.find(item => item.id === task.id) })}><span className={`status-mark ${task.status}`} style={{ '--task-color': colors[task.phase] } as CSSProperties}>{task.status === 'done' ? <Check size={10} strokeWidth={3}/> : null}</span><span className="task-info"><strong title={task.title}>{task.title}</strong><small><span className="owner-avatar" style={{ background: colors[task.phase] + '20', color: colors[task.phase] }}>{task.owner ? task.owner.slice(0, 1).toUpperCase() : '—'}</span>{task.owner || t.unassigned}<span className="status-word">· {t[task.status]}</span></small></span></button><button className="insert-button" onClick={() => newTask(task.id)} aria-label={`${t.addTask}: ${task.title}`} title={t.insertAfter}><Plus size={14}/></button></div>
                    {showBaseline && base && <div className="baseline-bar" title={`${t.baseline}: ${dateLabel(base.start, lang)} — ${dateLabel(base.end - 1, lang)}`} style={{ left: LABEL + (base.start - rangeStart) * dayWidth + 3, width: Math.max(3, (base.end - base.start) * dayWidth - 6), background: colors[task.phase] }}/>} 
                    <button className={`task-bar ${dragRef.current?.id === task.id ? 'dragging' : ''} ${task.status === 'done' ? 'complete' : ''}`} data-testid={`bar-${task.id}`} data-start={toISO(task.start)} data-end={toISO(task.end - 1)} style={{ left: LABEL + (task.start - rangeStart) * dayWidth + 3, width: Math.max(20, task.duration * dayWidth - 6), '--task-color': colors[task.phase] } as CSSProperties} aria-label={`${task.title}: ${dateLabel(task.start, lang)} — ${dateLabel(task.end - 1, lang)}. ${t.dragHint}`} title={`${task.title}\n${dateLabel(task.start, lang)} — ${dateLabel(task.end - 1, lang)} · ${task.duration} ${t.calendarDays}\n${t.dragHint}`}
                      onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); suppressClick.current = false; dragRef.current = { id: task.id, x: e.clientX, start: task.start, moved: false, next: null }; }}
                      onPointerMove={e => { const drag = dragRef.current; if (!drag || drag.id !== task.id) return; const delta = Math.round((e.clientX - drag.x) / dayWidth); if (!drag.moved && Math.abs(e.clientX - drag.x) < 5) return; drag.moved = true; const next = moveTask(task.id, drag.start + delta); try { validateRoadmap({ ...project, tasks: next }); drag.next = next; setPreview(next); } catch { /* Ignore out-of-bounds drag positions. */ } }}
                      onPointerUp={e => { const drag = dragRef.current; if (!drag) return; if (drag.moved) { suppressClick.current = true; if (drag.next) commit({ ...project, tasks: drag.next }); } dragRef.current = null; setPreview(null); e.currentTarget.releasePointerCapture(e.pointerId); }}
                      onPointerCancel={() => { dragRef.current = null; setPreview(null); suppressClick.current = true; }}
                      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setEditor({ task: project.tasks.find(item => item.id === task.id) }); }}
                      onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 7 : 1); commit({ ...project, tasks: moveTask(task.id, task.start + delta) }); } }}>
                      {task.status === 'done' && <Check size={13}/>}<span>{task.title}</span><small>{task.duration}{t.day}</small><i className="bar-grip"/>
                    </button>
                    {delta !== 0 && <span className={`delta-badge ${delta < 0 ? 'earlier' : ''}`} style={{ left: LABEL + (task.end - rangeStart) * dayWidth + 5 }}>{delta > 0 ? '+' : ''}{delta}{t.day}</span>}
                  </div>;
                })}
              </div>
            </div>
          </div> : <div className="empty-state"><div><Route size={35}/></div><h3>{t.addFirst}</h3><p>{t.emptyHint}</p><button className="button primary" onClick={() => newTask()}><Plus size={17}/>{t.addTask}</button></div>}
          {!!tasks.length && <button className="add-row" onClick={() => newTask()}><Plus size={16}/>{t.addTask}<span>↵</span></button>}
          <div className="roadmap-footer"><div className="legend">{phases.map(phase => <span key={phase}><i style={{ background: colors[phase] }}/>{t[phase]}</span>)}</div><span className="days-note"><CalendarDays size={13}/>{t.calendarDays}</span></div>
        </section>
        <div className={`change-summary ${lastChange ? 'has-changes' : ''}`} aria-live="polite"><div className="change-icon"><WandSparkles size={18}/></div><div><strong>{lastChange ? t.shiftNotice : t.guide1Title}</strong><p>{lastChange ? `${lastChange} ${t.affected}. ${t.baselineHint}` : t.guide1}</p></div><button onClick={() => setGuide(true)}>{t.howItWorks}<ArrowRight size={15}/></button></div>
        <div className="mobile-tools"><button onClick={saveCopy}><ArrowDownToLine size={15}/>{t.exportBackup}</button><button onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={15}/>{t.importBackup}</button><button onClick={() => replaceProject()}><Plus size={15}/>{t.reset}</button></div>
        <footer className="page-footer"><span>roadly<span className="brand-dot">.</span></span><p>{t.footer}</p><span>v0.1</span></footer>
      </div>
    </main>
    <input ref={fileInput} className="hidden-input" type="file" accept=".json,application/json" aria-label={t.importBackup} onChange={e => { void openCopy(e.target.files?.[0]); e.target.value = ''; }}/>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <CircleHelp size={18}/> : <Check size={18}/>}<span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label={t.close}><X size={15}/></button></div>}
    {editor && <TaskEditor key={editor.task?.id ?? 'new'} project={project} task={editor.task} after={editor.after} lang={lang} onClose={() => setEditor(null)} onSave={saveTask} onDelete={id => { if (window.confirm(t.deleteHint) && commit({ ...project, tasks: removeTask(project.tasks, id) }, t.removed)) setEditor(null); }}/>} 
    {settings && <ProjectSettings project={project} t={t} onClose={() => setSettings(false)} onSave={next => { if (commit(next)) setSettings(false); }}/>} 
    {guide && <Modal title={t.guideTitle} onClose={() => setGuide(false)} t={t} wide><div className="guide-hero"><span><Sparkles size={28}/></span><p>{t.guideIntro}</p></div><div className="guide-steps">{[[Link2, t.guide1Title, t.guide1], [WandSparkles, t.guide2Title, t.guide2], [Download, t.guide3Title, t.guide3]].map(([Icon, title, body], index) => { const I = Icon as typeof Link2; return <div key={index}><span className="guide-step-icon"><I size={22}/></span><div><h3>{title as string}</h3><p>{body as string}</p></div></div>; })}</div><p className="guide-note">{t.guideNote}</p><div className="modal-actions"><button className="button secondary" onClick={() => replaceProject(true)}>{t.demo}</button><button className="button primary" onClick={() => setGuide(false)}>{t.gotIt}<ArrowRight size={16}/></button></div></Modal>}
  </div>;
}

function Stat({ icon, label, value, detail, children, accent, warning }: { icon: ReactNode; label: string; value: string; detail: string; children?: ReactNode; accent?: boolean; warning?: boolean }) {
  return <article className={`stat-card ${accent ? 'accent' : ''}`}><div className="stat-top"><span>{label}</span><i>{icon}</i></div><div className="stat-value">{value}</div><div className={`stat-detail ${warning ? 'warning' : ''}`}>{detail}</div>{children}</article>;
}
function Modal({ title, onClose, t, children, wide = false }: { title: string; onClose: () => void; t: Dictionary; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog className={`modal ${wide ? 'wide' : ''}`} ref={ref} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><div className="modal-heading"><div><span className="eyebrow">ROADLY / STUDIO</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label={t.close}><X size={20}/></button></div>{children}</div></dialog>;
}
function TaskEditor({ project, task, after, lang, onClose, onSave, onDelete }: { project: Roadmap; task?: Task; after?: string; lang: Language; onClose: () => void; onSave: (task: Task, after: string | null, existing: boolean) => void; onDelete: (id: string) => void }) {
  const t = dictionaries[lang];
  const [draft, setDraft] = useState<Task>(() => task ? { ...task } : { id: crypto.randomUUID(), title: '', owner: '', phase: 'development', status: 'planned', earliestStart: project.tasks.length ? Math.min(...project.tasks.map(t => t.earliestStart)) : today(), duration: 3, dependsOn: [] });
  const [afterId, setAfterId] = useState(after ?? '');
  const [error, setError] = useState('');
  const blocked = task ? descendants(project.tasks, task.id) : new Set<string>();
  let projected: ScheduledTask | undefined;
  try { projected = schedule(task ? project.tasks.map(t => t.id === task.id ? draft : t) : insertTask(project.tasks, { ...draft, title: draft.title || 'New' }, afterId || null)).find(t => t.id === draft.id); } catch { /* Validation is shown when saving. */ }
  return <Modal title={task ? t.editTask : t.newTask} onClose={onClose} t={t}><form onSubmit={event => { event.preventDefault(); try { if (!draft.title.trim()) { setError(t.taskPlaceholder); return; } const cleaned = { ...draft, title: draft.title.trim(), owner: draft.owner.trim() }; validateRoadmap({ ...project, tasks: task ? project.tasks.map(item => item.id === task.id ? cleaned : item) : insertTask(project.tasks, cleaned, afterId || null) }); onSave(cleaned, afterId || null, !!task); } catch (error) { setError(t[(error as Error).message as keyof Dictionary] ?? t.invalidData); } }}>
    <label className="field">{t.taskName}<input autoFocus required maxLength={120} placeholder={t.taskPlaceholder} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <div className="field-grid"><label className="field">{t.phase}<select value={draft.phase} onChange={e => setDraft({ ...draft, phase: e.target.value as Task['phase'] })}>{phases.map(p => <option value={p} key={p}>{t[p]}</option>)}</select></label><label className="field">{t.status}<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Task['status'] })}>{statuses.map(p => <option value={p} key={p}>{t[p]}</option>)}</select></label></div>
    <label className="field">{t.owner}<input maxLength={60} placeholder={t.ownerPlaceholder} value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })}/></label>
    {!task && <label className="field">{t.insertAfter}<select value={afterId} onChange={e => { setAfterId(e.target.value); setDraft({ ...draft, dependsOn: [] }); }}><option value="">{t.append}</option>{project.tasks.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select><small>{t.insertionHint}</small></label>}
    <div className="field-grid"><label className="field">{t.start}<input type="date" required min="2000-01-01" max="2100-12-31" value={toISO(draft.earliestStart)} onChange={e => { if (e.target.value) { try { setDraft({ ...draft, earliestStart: fromISO(e.target.value) }); } catch { setError(t.invalidDate); } } }}/></label><label className="field">{t.length}<input type="number" required min={1} max={365} value={Number.isNaN(draft.duration) ? '' : draft.duration} onChange={e => setDraft({ ...draft, duration: e.target.valueAsNumber })}/></label></div>
    <p className="field-hint">{t.minDateHint}</p>
    {(task || !afterId) && project.tasks.length > (task ? 1 : 0) && <fieldset className="dependencies"><legend><Link2 size={15}/>{t.dependencies}</legend><div className="dependency-options">{project.tasks.filter(item => item.id !== draft.id).map(item => <label key={item.id} className={blocked.has(item.id) ? 'disabled' : ''}><input type="checkbox" disabled={blocked.has(item.id)} checked={draft.dependsOn.includes(item.id)} onChange={e => setDraft({ ...draft, dependsOn: e.target.checked ? [...draft.dependsOn, item.id] : draft.dependsOn.filter(id => id !== item.id) })}/><span>{item.title}</span></label>)}</div><p className="field-hint">{t.dependencyHint}</p></fieldset>}
    {projected && Number.isFinite(projected.end) && <div className="projected-dates"><CalendarDays size={17}/><div><small>{t.actualDates}</small><strong>{dateLabel(projected.start, lang, true)}<ArrowRight size={13}/>{dateLabel(projected.end - 1, lang, true)}</strong></div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">{task && <button className="icon-button danger" type="button" title={t.delete} aria-label={t.delete} onClick={() => onDelete(task.id)}><Trash2 size={18}/></button>}<button className="button secondary" type="button" onClick={onClose}>{t.cancel}</button><button className="button primary" type="submit">{task ? t.save : t.create}<ArrowRight size={16}/></button></div>
  </form></Modal>;
}
function ProjectSettings({ project, t, onClose, onSave }: { project: Roadmap; t: Dictionary; onClose: () => void; onSave: (next: Roadmap) => void }) {
  const [draft, setDraft] = useState(project);
  const [error, setError] = useState('');
  return <Modal title={t.projectSettings} onClose={onClose} t={t}><form onSubmit={e => { e.preventDefault(); try { const next = validateRoadmap({ ...draft, title: draft.title.trim(), description: draft.description.trim() }); onSave(next); } catch (error) { setError(t[(error as Error).message as keyof Dictionary] ?? t.invalidData); } }}><label className="field">{t.projectName}<input autoFocus required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label className="field">{t.description}<textarea rows={3} maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><label className="field">{t.targetDate}<input type="date" min="2000-01-01" max="2100-12-31" value={draft.deadline === null ? '' : toISO(draft.deadline)} onChange={e => setDraft({ ...draft, deadline: e.target.value ? fromISO(e.target.value) : null })}/></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>{t.cancel}</button><button className="button primary" type="submit">{t.save}</button></div></form></Modal>;
}
