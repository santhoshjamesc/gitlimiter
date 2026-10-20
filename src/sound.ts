import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import type { Metric } from './messages';

// Built-in system sounds per platform, so the extension works without shipping audio files.
const MAC_PLAYER = '/usr/bin/afplay';
const MAC_SOUNDS: Record<Metric, string> = {
	files: '/System/Library/Sounds/Funk.aiff',
	lines: '/System/Library/Sounds/Sosumi.aiff',
};
const WINDOWS_SOUND = 'C:\\Windows\\Media\\Windows Exclamation.wav';
const LINUX_SOUND = '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga';

export type Log = (message: string) => void;

function run(cmd: string, args: string[], log: Log): Promise<void> {
	log(`Playing sound: ${cmd} ${args.join(' ')}`);
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { timeout: 10_000 }, (err, _stdout, stderr) => {
			if (err) {
				reject(new Error(`${err.message}${stderr ? `\n${stderr.trim()}` : ''}`));
			} else {
				resolve();
			}
		});
	});
}

/**
 * Plays an alert sound `repeat` times in a row (system sounds are short, so one play is easy to miss).
 * Resolves to false (after logging why) when no sound could be played, so a missing sound never
 * breaks the alert itself.
 */
export async function playAlertSound(metric: Metric, customFile: string, repeat: number, log: Log): Promise<boolean> {
	try {
		for (let i = 0; i < repeat; i++) {
			await playOnce(metric, customFile, log);
		}
		return true;
	} catch (err) {
		log(`Sound failed: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

/** Expands a leading ~ so `~/sounds/ding.wav` works like the alertImage setting. */
function expandHome(file: string): string {
	return file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : file;
}

async function playOnce(metric: Metric, rawFile: string, log: Log): Promise<void> {
	const customFile = expandHome(rawFile.trim());
	switch (process.platform) {
		case 'darwin':
			await run(MAC_PLAYER, [customFile || MAC_SOUNDS[metric]], log);
			break;
		case 'win32': {
			const file = (customFile || WINDOWS_SOUND).replace(/'/g, "''");
			await run(
				'powershell',
				['-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`],
				log,
			);
			break;
		}
		default: {
			const file = customFile || LINUX_SOUND;
			await run('paplay', [file], log).catch(() => run('aplay', ['-q', file], log));
		}
	}
}
