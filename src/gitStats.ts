import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

// Git's well-known empty tree, used as the diff base in repos with no commits yet.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_UNTRACKED_BYTES = 1024 * 1024;
const MAX_UNTRACKED_FILES_TO_READ = 2000;

export interface ChangeStats {
	repoRoot: string;
	/** Current branch name, empty when detached. */
	branch: string;
	/** Branch the PR would target, e.g. "origin/main". Undefined when none was found. */
	baseRef?: string;
	files: number;
	added: number;
	removed: number;
	/** added + removed, summed over all files */
	lines: number;
	/** added + removed in the single most-changed file */
	maxFileLines: number;
	/** Path of that file, relative to the repo root. Empty when nothing changed. */
	biggestFile: string;
	/** Every changed file with its added + removed lines, most-changed first. */
	fileLines: FileLines[];
}

export interface FileLines {
	file: string;
	lines: number;
}

function git(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		// --no-optional-locks stops git from touching .git/index, which would re-trigger our file watcher.
		execFile('git', ['--no-optional-locks', ...args], { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
			if (err) {
				reject(err);
			} else {
				resolve(stdout);
			}
		});
	});
}

export async function findRepoRoot(folder: string): Promise<string | undefined> {
	try {
		return (await git(folder, ['rev-parse', '--show-toplevel'])).trim() || undefined;
	} catch {
		return undefined;
	}
}

async function countLines(file: string): Promise<number> {
	try {
		const stat = await fs.stat(file);
		if (!stat.isFile() || stat.size === 0 || stat.size > MAX_UNTRACKED_BYTES) {
			return 0;
		}
		const buf = await fs.readFile(file);
		if (buf.includes(0)) {
			return 0; // binary
		}
		let lines = 0;
		for (const byte of buf) {
			if (byte === 0x0a) {
				lines++;
			}
		}
		return buf[buf.length - 1] === 0x0a ? lines : lines + 1;
	} catch {
		return 0;
	}
}

async function refExists(repoRoot: string, ref: string): Promise<boolean> {
	return git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).then(
		() => true,
		() => false,
	);
}

async function findBaseRef(repoRoot: string, configured: string): Promise<string | undefined> {
	const candidates = configured ? [configured] : [];
	if (!configured) {
		const originHead = await git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(
			() => '',
		);
		candidates.push(originHead.trim(), 'origin/main', 'origin/master', 'main', 'master');
	}
	for (const ref of candidates) {
		if (ref && (await refExists(repoRoot, ref))) {
			return ref;
		}
	}
	return undefined;
}

/**
 * Everything a PR from the current branch would contain: commits since the branch left its base,
 * plus staged, unstaged and untracked changes.
 */
export async function getChangeStats(repoRoot: string, configuredBase: string): Promise<ChangeStats> {
	const [branch, baseRef, hasHead] = await Promise.all([
		git(repoRoot, ['branch', '--show-current']).then((b) => b.trim(), () => ''),
		findBaseRef(repoRoot, configuredBase),
		refExists(repoRoot, 'HEAD'),
	]);
	let diffBase = hasHead ? 'HEAD' : EMPTY_TREE;
	if (hasHead && baseRef) {
		diffBase = (await git(repoRoot, ['merge-base', 'HEAD', baseRef]).catch(() => 'HEAD')).trim();
	}

	const [numstat, untrackedOut] = await Promise.all([
		git(repoRoot, ['diff', '--numstat', diffBase]),
		git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
	]);

	let files = 0;
	let added = 0;
	let removed = 0;
	const fileLines: FileLines[] = [];
	const track = (file: string, lines: number) => fileLines.push({ file, lines });
	for (const line of numstat.split('\n')) {
		if (!line) {
			continue;
		}
		const [a, r, file] = line.split('\t');
		files++;
		// Binary files report "-" for both counts.
		const fileAdded = Number(a) || 0;
		const fileRemoved = Number(r) || 0;
		added += fileAdded;
		removed += fileRemoved;
		track(file, fileAdded + fileRemoved);
	}

	const untracked = untrackedOut.split('\0').filter(Boolean);
	files += untracked.length;
	const toRead = untracked.slice(0, MAX_UNTRACKED_FILES_TO_READ);
	const counts = await Promise.all(toRead.map((f) => countLines(path.join(repoRoot, f))));
	counts.forEach((n, i) => {
		added += n;
		track(toRead[i], n);
	});

	fileLines.sort((a, b) => b.lines - a.lines);
	const maxFileLines = fileLines[0]?.lines ?? 0;
	const biggestFile = maxFileLines > 0 ? fileLines[0].file : '';
	return { repoRoot, branch, baseRef, files, added, removed, lines: added + removed, maxFileLines, biggestFile, fileLines };
}

/** Browser URL for creating a GitHub PR, or undefined when origin is not on GitHub. */
export async function githubCompareUrl(repoRoot: string, baseRef: string, branch: string): Promise<string | undefined> {
	const remote = (await git(repoRoot, ['remote', 'get-url', 'origin']).catch(() => '')).trim();
	const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote);
	if (!match) {
		return undefined;
	}
	const base = baseRef.replace(/^origin\//, '');
	return `https://github.com/${match[1]}/${match[2]}/compare/${encodeURI(base)}...${encodeURI(branch)}?expand=1`;
}

export async function isBranchPushed(repoRoot: string, branch: string): Promise<boolean> {
	return refExists(repoRoot, `refs/remotes/origin/${branch}`);
}
