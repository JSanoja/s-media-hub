// Wrapper mínimo sobre ffmpeg/ffprobe con child_process.spawn (reemplaza fluent-ffmpeg, deprecado).
// Siempre se pasan argumentos como array: nunca se invoca una shell.
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const running = new Set();

export function createFfmpeg({ ffmpegPath, ffprobePath, timeoutMs = 60_000 } = {}) {
  const ffmpegBin = ffmpegPath || ffmpegStatic;
  const ffprobeBin = ffprobePath || ffprobeStatic.path;

  function run(bin, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      running.add(child);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (err) => {
        clearTimeout(timer);
        running.delete(child);
        reject(err);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        running.delete(child);
        if (code === 0) return resolve({ stdout, stderr });
        const reason = signal ? `señal ${signal}` : `código ${code}`;
        reject(
          new Error(
            `${bin} terminó con ${reason}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`,
          ),
        );
      });
    });
  }

  /** Duración en segundos (o null si no se puede determinar). */
  async function probeDuration(file) {
    const { stdout } = await run(ffprobeBin, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : null;
  }

  /** Captura un frame JPG en `atSec` segundos y lo guarda en `outFile`. */
  async function screenshot(file, outFile, { atSec = 0, width = 640 } = {}) {
    await run(ffmpegBin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(Math.max(0, atSec)),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale=${width}:-2`,
      '-q:v',
      '3',
      outFile,
    ]);
    return outFile;
  }

  return { run, probeDuration, screenshot };
}

/** Mata los procesos ffmpeg/ffprobe en curso (graceful shutdown). */
export function killAll() {
  for (const child of running) child.kill('SIGKILL');
  running.clear();
}
