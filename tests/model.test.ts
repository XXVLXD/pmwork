import { describe, expect, it } from 'vitest';
import { baselineOf, descendants, fromISO, insertTask, makeDemo, removeTask, schedule, toISO, validateRoadmap, type Task } from '../src/model';
import { makeExportPages } from '../src/export';

const start = fromISO('2026-10-05');
const task = (id: string, dependsOn: string[] = [], duration = 2): Task => ({ id, title: id, owner: '', phase: 'development', status: 'planned', earliestStart: start, duration, dependsOn });
const chain = () => [task('1'), task('2', ['1']), task('3', ['2']), task('4', ['3'])];

describe('dependency scheduling', () => {
  it('inserting task 5 between 1 and 2 shifts 2, 3 and 4 by exactly three days', () => {
    const original = chain(); const before = schedule(original);
    const inserted = insertTask(original, task('5', [], 3), '1'); const after = schedule(inserted);
    expect(inserted.map(t => t.id)).toEqual(['1', '5', '2', '3', '4']);
    expect(after.find(t => t.id === '1')!.start).toBe(before[0].start);
    for (const id of ['2', '3', '4']) expect(after.find(t => t.id === id)!.start - before.find(t => t.id === id)!.start).toBe(3);
    expect(inserted.find(t => t.id === '2')!.dependsOn).toEqual(['5']);
    expect(original[1].dependsOn).toEqual(['1']);
  });
  it('keeps parallel independent work in place', () => {
    const original = [...chain(), task('parallel')];
    expect(schedule(insertTask(original, task('5', [], 7), '1')).find(t => t.id === 'parallel')!.start).toBe(start);
  });
  it('waits for every prerequisite at a join', () => {
    const tasks = [task('short', [], 2), task('long', [], 8), task('join', ['short', 'long'])];
    expect(schedule(tasks)[2].start).toBe(start + 8);
  });
  it('uses existing slack before moving later tasks', () => {
    const tasks = chain(); tasks[1].earliestStart = start + 10;
    const before = schedule(tasks); const after = schedule(insertTask(tasks, task('5', [], 3), '1'));
    expect(after.find(t => t.id === '2')!.start).toBe(before[1].start);
  });
  it('recalculates after a duration change in arbitrary row order', () => {
    const tasks = chain().reverse(); tasks.find(t => t.id === '1')!.duration = 6;
    expect(schedule(tasks).find(t => t.id === '4')!.start).toBe(start + 10);
  });
  it('reconnects dependencies when a middle task is deleted', () => {
    const tasks = removeTask(chain(), '2');
    expect(tasks.find(t => t.id === '3')!.dependsOn).toEqual(['1']);
    expect(schedule(tasks).find(t => t.id === '4')!.start).toBe(start + 4);
  });
  it('detects cycles and missing prerequisites', () => {
    expect(() => schedule([task('a', ['b']), task('b', ['a'])])).toThrow('cycle');
    expect(() => schedule([task('a', ['missing'])])).toThrow('missingDependency');
  });
  it('finds all descendants for the dependency editor', () => { expect([...descendants(chain(), '1')]).toEqual(['2', '3', '4']); });
  it('preserves original dates in a baseline', () => {
    const tasks = chain(); const baseline = baselineOf(tasks); tasks[0].duration = 10;
    expect(baseline['4'].start).toBe(start + 6);
    expect(schedule(tasks)[3].start).toBe(start + 14);
  });
});
describe('saved projects and dates', () => {
  it('validates every language demo and empty projects', () => {
    for (const lang of ['en', 'uk', 'ru'] as const) expect(validateRoadmap(makeDemo(lang)).tasks).toHaveLength(6);
    expect(validateRoadmap({ ...makeDemo('ru'), tasks: [], baseline: null }).tasks).toEqual([]);
  });
  it('rejects duplicate IDs, invalid values and oversized imported projects', () => {
    const demo = makeDemo('en');
    expect(() => validateRoadmap({ ...demo, tasks: [task('1'), task('1')] })).toThrow();
    expect(() => validateRoadmap({ ...demo, tasks: [{ ...task('1'), duration: 0 }] })).toThrow();
    expect(() => validateRoadmap({ ...demo, tasks: [{ ...task('1'), duration: NaN }] })).toThrow();
    expect(() => validateRoadmap({ ...demo, tasks: Array.from({ length: 81 }, (_, i) => task(`t${i}`)) })).toThrow();
    expect(() => validateRoadmap({ ...demo, tasks: [task('1'), { ...task('2'), earliestStart: start + 1200 }] })).toThrow('tooLong');
  });
  it('handles leap dates and DST boundaries without changing calendar duration', () => {
    expect(toISO(fromISO('2028-02-29'))).toBe('2028-02-29');
    expect(toISO(fromISO('2026-03-28') + 2)).toBe('2026-03-30');
    expect(() => fromISO('2026-02-29')).toThrow('invalidDate');
    expect(() => fromISO('2026-13-01')).toThrow('invalidDate');
  });
});
describe('export pagination', () => {
  it('includes every task when more than eight tasks are exported', () => {
    const project = { ...makeDemo('ru'), tasks: Array.from({ length: 19 }, (_, i) => task(`t${i}`)) };
    const pages = makeExportPages(project);
    expect(pages).toHaveLength(3);
    expect(pages.flatMap(p => p.tasks.map(t => t.id))).toEqual(project.tasks.map(t => t.id));
    expect(pages.every(p => p.tasks.length <= 8)).toBe(true);
  });
  it('continues a long task across date windows', () => {
    const pages = makeExportPages({ ...makeDemo('uk'), tasks: [task('long', [], 100)] });
    expect(pages).toHaveLength(3);
    expect(pages.every(p => p.tasks[0].id === 'long')).toBe(true);
    expect(pages[2].end).toBe(start + 100);
  });
});
