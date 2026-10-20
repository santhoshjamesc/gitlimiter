import type { FileLines } from './gitStats';

export type Metric = 'files' | 'lines';

const MAX_LISTED_FILES = 5;

const FILE_LIMIT_MESSAGES = [
	'🚨 {n} files changed on this branch! Your future PR now needs its own zip code. Open it while someone can still review it. (limit: {limit})',
	"📁 {n} files changed. At this point it's not a PR, it's a migration. Ship it for review! (limit: {limit})",
	'🐙 {n} files changed! Your reviewer is updating their LinkedIn just in case. Raise that PR now. (limit: {limit})',
	'🧳 {n} files changed. Open the PR before this branch applies for a passport. (limit: {limit})',
	"🎪 {n} files changed! This isn't a PR anymore, it's a circus. Send in the reviewers. (limit: {limit})",
];

// One file over the line limit.
const ONE_FILE_LINE_MESSAGES = [
	"📜 {n} lines changed in {file}! That's not a file, that's a novel. Open the PR before chapter 2. (limit per file: {limit})",
	'🔥 {n} lines changed in {file}. Your reviewer will need snacks and a therapist. Open the PR now! (limit per file: {limit})',
	'🦖 {n} lines changed in {file}! This diff is big enough to have its own weather. PR time. (limit per file: {limit})',
	"☕ {n} lines changed in {file}. Somewhere a reviewer is brewing their third coffee. Don't make it a fourth, open the PR. (limit per file: {limit})",
	'🚂 {n} lines changed in {file}! The diff train has no brakes. Pull into PR station. (limit per file: {limit})',
];

// Several files over the line limit.
const MANY_FILES_LINE_MESSAGES = [
	"📜 {count} files are over {limit} changed lines each: {list}. That's not a PR, that's a book series. Open it before the sequel.",
	'🔥 {count} files are over {limit} changed lines each: {list}. Your reviewer will need snacks and a therapist. Open the PR now!',
	'🦖 {count} files are over {limit} changed lines each: {list}. This diff has its own ecosystem. PR time.',
	"☕ {count} files are over {limit} changed lines each: {list}. That's a whole pot of coffee for your reviewer. Open the PR.",
	'🚂 {count} files are over {limit} changed lines each: {list}. The diff train has no brakes. Pull into PR station.',
];

const ON_BASE_BRANCH_HINT = " (You're on {base} though, so start a branch first 🌱)";

const ALL_CLEAR_MESSAGES = [
	'✨ {files} files on this branch, biggest file {lines} lines. A reviewer could read this over one coffee.',
	'🧘 {files} files on this branch, biggest file {lines} lines. Bite-sized PR, inner peace.',
	'🍃 {files} files on this branch, biggest file {lines} lines. Small PRs, happy reviewers.',
];

const OVER_LIMIT_STATUS_MESSAGES = [
	'🙈 {files} files on this branch, biggest file {lines} lines. That PR should have gone out a while ago.',
	'🧯 {files} files on this branch, biggest file {lines} lines. Open the PR before it catches fire.',
	'🫠 {files} files on this branch, biggest file {lines} lines. Your reviewer is melting just thinking about it.',
];

function pick(list: string[]): string {
	return list[Math.floor(Math.random() * list.length)];
}

function fill(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

/** "a.ts (320), b.ts (301), +2 more" */
export function formatFileList(files: FileLines[]): string {
	const shown = files.slice(0, MAX_LISTED_FILES).map((f) => `${f.file} (${f.lines})`);
	const more = files.length - shown.length;
	return shown.join(', ') + (more > 0 ? `, +${more} more` : '');
}

/**
 * `n` is the file count for the files metric. For the lines metric, `overFiles` lists every
 * file at or over the per-file limit.
 */
export function limitMessage(
	metric: Metric,
	n: number,
	limit: number,
	overFiles: FileLines[],
	onBaseBranch?: string,
): string {
	const hint = onBaseBranch ? fill(ON_BASE_BRANCH_HINT, { base: onBaseBranch }) : '';
	if (metric === 'files') {
		return fill(pick(FILE_LIMIT_MESSAGES), { n, limit }) + hint;
	}
	if (overFiles.length === 1) {
		const [{ file, lines }] = overFiles;
		return fill(pick(ONE_FILE_LINE_MESSAGES), { n: lines, file, limit }) + hint;
	}
	return fill(pick(MANY_FILES_LINE_MESSAGES), { count: overFiles.length, limit, list: formatFileList(overFiles) }) + hint;
}

export function statusMessage(files: number, lines: number, overLimit: boolean): string {
	return fill(pick(overLimit ? OVER_LIMIT_STATUS_MESSAGES : ALL_CLEAR_MESSAGES), { files, lines });
}
