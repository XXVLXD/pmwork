export type Language = 'en' | 'uk' | 'ru';
export type Phase = 'discovery' | 'design' | 'development' | 'launch';
export type Status = 'planned' | 'active' | 'done';
export interface Task {
  id: string; title: string; owner: string; phase: Phase; status: Status;
  earliestStart: number; duration: number; dependsOn: string[];
}
export interface ScheduledTask extends Task { start: number; end: number }
export interface Roadmap {
  version: 1; title: string; description: string; tasks: Task[];
  baseline: Record<string, { start: number; end: number }> | null;
  deadline: number | null;
}
export const DAY_MS = 86400000;
export const colors: Record<Phase, string> = {
  discovery: '#8b77d8', design: '#539aaa', development: '#637fe0', launch: '#d5a056',
};
export const phases = Object.keys(colors) as Phase[];
export const statuses: Status[] = ['planned', 'active', 'done'];
export const today = () => {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
};
export function toISO(day: number) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
export function fromISO(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalidDate');
  const day = Date.parse(value + 'T00:00:00Z') / DAY_MS;
  if (!Number.isInteger(day) || toISO(day) !== value) throw new Error('invalidDate');
  return day;
}
export const monday = (day: number) => day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7);
export function dateLabel(day: number, lang: Language, year = false) {
  return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric', month: 'short', ...(year ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
  }).format(new Date(day * DAY_MS));
}
export function schedule(tasks: Task[]): ScheduledTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  if (byId.size !== tasks.length) throw new Error('invalidData');
  const result = new Map<string, ScheduledTask>();
  const visiting = new Set<string>();
  function visit(id: string): ScheduledTask {
    const cached = result.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw new Error('cycle');
    const task = byId.get(id);
    if (!task) throw new Error('missingDependency');
    visiting.add(id);
    const start = Math.max(task.earliestStart, ...task.dependsOn.map(dep => visit(dep).end));
    const scheduled = { ...task, start, end: start + task.duration };
    visiting.delete(id); result.set(id, scheduled);
    return scheduled;
  }
  return tasks.map(t => visit(t.id));
}
export function descendants(tasks: Task[], id: string) {
  const result = new Set<string>();
  function visit(parent: string) {
    for (const t of tasks) if (t.dependsOn.includes(parent) && !result.has(t.id)) {
      result.add(t.id); visit(t.id);
    }
  }
  visit(id); return result;
}
export function insertTask(tasks: Task[], task: Task, afterId: string | null): Task[] {
  if (!afterId) return [...tasks, task];
  const index = tasks.findIndex(t => t.id === afterId);
  if (index < 0) throw new Error('missingDependency');
  const result = tasks.map(t => ({ ...t, dependsOn: t.dependsOn.map(d => d === afterId ? task.id : d) }));
  result.splice(index + 1, 0, { ...task, dependsOn: Array.from(new Set([...task.dependsOn, afterId])) });
  schedule(result);
  return result;
}
export function removeTask(tasks: Task[], id: string) {
  const removed = tasks.find(t => t.id === id);
  if (!removed) return tasks;
  return tasks.filter(t => t.id !== id).map(t => ({ ...t,
    dependsOn: Array.from(new Set(t.dependsOn.flatMap(d => d === id ? removed.dependsOn : [d]))),
  }));
}
export function baselineOf(tasks: Task[]) {
  return Object.fromEntries(schedule(tasks).map(t => [t.id, { start: t.start, end: t.end }]));
}
export function validateRoadmap(value: unknown): Roadmap {
  if (!value || typeof value !== 'object') throw new Error('invalidData');
  const r = value as Roadmap;
  if (r.version !== 1 || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 100 ||
      typeof r.description !== 'string' || r.description.length > 300 || !Array.isArray(r.tasks) || r.tasks.length > 80) throw new Error('invalidData');
  const validDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 10957 && v <= 47846;
  for (const task of r.tasks) {
    if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(task.id) ||
        typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120 ||
        typeof task.owner !== 'string' || task.owner.length > 60 || !phases.includes(task.phase) ||
        !statuses.includes(task.status) || !validDay(task.earliestStart) ||
        !Number.isInteger(task.duration) || task.duration < 1 || task.duration > 365 ||
        !Array.isArray(task.dependsOn) || task.dependsOn.length > 80 || task.dependsOn.some(d => typeof d !== 'string')) throw new Error('invalidData');
  }
  const scheduled = schedule(r.tasks);
  const first = Math.min(...scheduled.map(t => t.start));
  const last = Math.max(...scheduled.map(t => t.end));
  if (scheduled.length && (last - first > 1095 || !validDay(last))) throw new Error('tooLong');
  if (r.deadline !== null && !validDay(r.deadline)) throw new Error('invalidData');
  if (r.baseline !== null) {
    if (!r.baseline || typeof r.baseline !== 'object' || Array.isArray(r.baseline)) throw new Error('invalidData');
    for (const [id, item] of Object.entries(r.baseline)) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !item || !validDay(item.start) || !validDay(item.end) || item.end <= item.start) throw new Error('invalidData');
    }
    const active = Object.entries(r.baseline).filter(([id]) => r.tasks.some(task => task.id === id)).map(([, dates]) => dates);
    if (scheduled.length && Math.max(last, ...active.map(b => b.end)) - Math.min(first, ...active.map(b => b.start)) > 1095) throw new Error('tooLong');
  }
  return r;
}
export function makeDemo(lang: Language): Roadmap {
  const content = {
    ru: { title: 'Запуск нового продукта', description: 'От первой идеи до первого довольного клиента', tasks: ['Исследование и стратегия', 'Концепция и прототип', 'Разработка продукта', 'Подготовка запуска', 'Тестирование и доработки', 'Запуск продукта'], people: ['Анна', 'Марк', 'Команда', 'София', 'Команда', 'Анна'] },
    uk: { title: 'Запуск нового продукту', description: 'Від першої ідеї до першого задоволеного клієнта', tasks: ['Дослідження та стратегія', 'Концепція та прототип', 'Розробка продукту', 'Підготовка запуску', 'Тестування та покращення', 'Запуск продукту'], people: ['Анна', 'Марк', 'Команда', 'Софія', 'Команда', 'Анна'] },
    en: { title: 'New product launch', description: 'From the first idea to the first happy customer', tasks: ['Research & strategy', 'Concept & prototype', 'Product development', 'Launch preparation', 'Testing & refinements', 'Product launch'], people: ['Anna', 'Mark', 'Team', 'Sofia', 'Team', 'Anna'] },
  }[lang];
  const start = monday(today());
  const durations = [5, 7, 10, 8, 5, 2];
  const dependencies = [[], ['t1'], ['t2'], ['t2'], ['t3'], ['t4', 't5']];
  const taskPhases: Phase[] = ['discovery', 'design', 'development', 'launch', 'development', 'launch'];
  const tasks: Task[] = content.tasks.map((title, i) => ({ id: `t${i + 1}`, title, owner: content.people[i],
    earliestStart: start, duration: durations[i], dependsOn: dependencies[i], phase: taskPhases[i], status: i === 0 ? 'done' : i === 1 ? 'active' : 'planned',
  }));
  return { version: 1, title: content.title, description: content.description, tasks, baseline: baselineOf(tasks), deadline: start + 30 };
}
