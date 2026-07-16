import fs from 'node:fs/promises';
import path from 'node:path';

import {
  AUDIO_DIR,
  DEFAULT_FPS,
  HORIZONTAL_OUTPUT,
  NATIVE_DIR,
  OUTPUT_DIR,
  VERTICAL_OUTPUT,
  WORK_DIR,
  parseArgs,
  parseTarget,
} from './config.mjs';
import { commandExists, run } from './lib/process-utils.mjs';
import { ensureDir, exists, readJson, resetDir } from './lib/fs-utils.mjs';

const TRANSITION_SECONDS = 0.32;

function srtTime(seconds) {
  const safe = Math.max(0, seconds);
  const ms = Math.round((safe % 1) * 1000);
  const totalSeconds = Math.floor(safe);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function findNativeOverride(target, sceneId) {
  for (const extension of ['mp4', 'mov', 'webm', 'mkv']) {
    const candidate = path.join(NATIVE_DIR, target, `${sceneId}.${extension}`);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function normalizeClip(clip, index, dir, target, canvas) {
  const nativeOverride = await findNativeOverride(target, clip.id);
  const sourceFile = nativeOverride || clip.file;
  if (!sourceFile) {
    throw new Error(`A cena ${clip.id} de ${target} exige uma captura Android em tools/hbx-video-studio/native/${target}/${clip.id}.mp4.`);
  }
  const trimStart = nativeOverride ? 0 : clip.trimStart;
  const out = path.join(dir, `${String(index + 1).padStart(2, '0')}-${clip.id}.mp4`);
  const vf = [
    `fps=${DEFAULT_FPS}`,
    `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease`,
    `pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black`,
    'setsar=1',
    `tpad=stop_mode=clone:stop_duration=${clip.duration.toFixed(3)}`,
    'format=yuv420p',
  ].join(',');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-y',
    '-ss', Number(trimStart || 0).toFixed(3),
    '-i', sourceFile,
    '-t', clip.duration.toFixed(3),
    '-vf', vf,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-movflags', '+faststart',
    out,
  ], { shell: false });
  return { file: out, nativeOverride };
}

async function joinWithTransitions(files, clips, out) {
  if (files.length === 1) {
    await fs.copyFile(files[0], out);
    return clips[0].duration;
  }

  const args = ['-hide_banner', '-loglevel', 'warning', '-y'];
  for (const file of files) args.push('-i', file);

  let previous = '[0:v]';
  let total = clips[0].duration;
  const filters = [];
  for (let index = 1; index < files.length; index += 1) {
    const offset = Math.max(0, total - TRANSITION_SECONDS);
    const label = `[v${index}]`;
    filters.push(`${previous}[${index}:v]xfade=transition=fade:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(3)}${label}`);
    previous = label;
    total += clips[index].duration - TRANSITION_SECONDS;
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', previous,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    out,
  );
  await run('ffmpeg', args, { shell: false });
  return total;
}

async function addAudio(videoFile, target, totalDuration, outputFile) {
  const candidates = [
    path.join(AUDIO_DIR, `${target}.wav`),
    path.join(AUDIO_DIR, `${target}.mp3`),
    path.join(AUDIO_DIR, `${target}.m4a`),
  ];
  const audioFile = (await Promise.all(candidates.map(async (file) => ((await exists(file)) ? file : null)))).find(Boolean);

  if (audioFile) {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'warning',
      '-y',
      '-i', videoFile,
      '-i', audioFile,
      '-filter_complex', '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]',
      '-map', '0:v:0',
      '-map', '[a]',
      '-t', totalDuration.toFixed(3),
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputFile,
    ], { shell: false });
    return { audioFile, silent: false };
  }

  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-y',
    '-i', videoFile,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-t', totalDuration.toFixed(3),
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    outputFile,
  ], { shell: false });
  return { audioFile: null, silent: true };
}

async function makeHorizontal(verticalFile, outputFile) {
  const filter = [
    '[0:v]split=2[bg][fg]',
    `[bg]scale=${HORIZONTAL_OUTPUT.width}:${HORIZONTAL_OUTPUT.height}:force_original_aspect_ratio=increase,crop=${HORIZONTAL_OUTPUT.width}:${HORIZONTAL_OUTPUT.height},boxblur=24:2[bg2]`,
    '[fg]scale=-2:1040[fg2]',
    '[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]',
  ].join(';');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-y',
    '-i', verticalFile,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputFile,
  ], { shell: false });
}

async function makeVertical(horizontalFile, outputFile) {
  const filter = [
    '[0:v]split=2[bg][fg]',
    `[bg]scale=${VERTICAL_OUTPUT.width}:${VERTICAL_OUTPUT.height}:force_original_aspect_ratio=increase,crop=${VERTICAL_OUTPUT.width}:${VERTICAL_OUTPUT.height},boxblur=24:2[bg2]`,
    '[fg]scale=1040:-2[fg2]',
    '[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]',
  ].join(';');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-y',
    '-i', horizontalFile,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputFile,
  ], { shell: false });
}

async function makePoster(videoFile, outputFile) {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-y',
    '-ss', '3.0',
    '-i', videoFile,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', '2',
    outputFile,
  ], { shell: false });
}

async function writeSubtitles(manifest, outputFile) {
  let cursor = 0;
  const entries = [];
  let index = 1;
  for (const clip of manifest.clips) {
    const start = cursor + 0.25;
    const end = Math.max(start + 0.8, cursor + clip.duration - 0.25);
    if (clip.narration?.trim()) {
      entries.push(`${index}\n${srtTime(start)} --> ${srtTime(end)}\n${clip.narration.trim()}\n`);
      index += 1;
    }
    cursor += clip.duration - TRANSITION_SECONDS;
  }
  await fs.writeFile(outputFile, `${entries.join('\n')}\n`, 'utf8');
}

async function writeTranscript(manifest, outputFile) {
  const lines = [`# ${manifest.title}`, ''];
  for (const clip of manifest.clips) {
    if (!clip.narration?.trim()) continue;
    lines.push(`## ${clip.id}`, '', clip.narration.trim(), '');
  }
  await fs.writeFile(outputFile, `${lines.join('\n')}\n`, 'utf8');
}

async function renderTarget(target) {
  const manifestPath = path.join(WORK_DIR, target, 'manifest.json');
  if (!(await exists(manifestPath))) {
    throw new Error(`Manifesto ausente para ${target}: ${manifestPath}. Rode npm run video:capture primeiro.`);
  }
  const manifest = await readJson(manifestPath);
  if (!Array.isArray(manifest.clips) || manifest.clips.length === 0) throw new Error(`Manifesto vazio: ${manifestPath}`);

  const targetWork = path.join(WORK_DIR, target, 'render');
  const normalizedDir = await resetDir(path.join(targetWork, 'normalized'));
  const silentMaster = path.join(targetWork, `${target}-silent.mp4`);
  const desktopLayout = manifest.layout === 'desktop';
  const canvas = desktopLayout ? HORIZONTAL_OUTPUT : VERTICAL_OUTPUT;
  await ensureDir(OUTPUT_DIR);

  console.log(`\n[video] normalizando ${target}`);
  const normalized = [];
  const nativeOverrides = [];
  for (let index = 0; index < manifest.clips.length; index += 1) {
    const normalizedClip = await normalizeClip(manifest.clips[index], index, normalizedDir, target, canvas);
    normalized.push(normalizedClip.file);
    if (normalizedClip.nativeOverride) nativeOverrides.push({ scene: manifest.clips[index].id, file: normalizedClip.nativeOverride });
  }

  console.log(`[video] aplicando transições em ${target}`);
  const totalDuration = await joinWithTransitions(normalized, manifest.clips, silentMaster);
  const horizontalOutput = path.join(OUTPUT_DIR, `${target}-horizontal.mp4`);
  const verticalOutput = path.join(OUTPUT_DIR, `${target}-vertical.mp4`);
  let audio;
  if (desktopLayout) {
    audio = await addAudio(silentMaster, target, totalDuration, horizontalOutput);
    console.log(`[video] gerando versão vertical de ${target}`);
    await makeVertical(horizontalOutput, verticalOutput);
  } else {
    audio = await addAudio(silentMaster, target, totalDuration, verticalOutput);
    console.log(`[video] gerando versão horizontal de ${target}`);
    await makeHorizontal(verticalOutput, horizontalOutput);
  }

  const posterOutput = path.join(OUTPUT_DIR, `${target}-poster.jpg`);
  await makePoster(verticalOutput, posterOutput);
  await writeSubtitles(manifest, path.join(OUTPUT_DIR, `${target}.srt`));
  await writeTranscript(manifest, path.join(OUTPUT_DIR, `${target}-narracao.md`));

  return {
    target,
    duration: totalDuration,
    verticalOutput,
    horizontalOutput,
    posterOutput,
    subtitles: path.join(OUTPUT_DIR, `${target}.srt`),
    audio,
    nativeOverrides,
  };
}

async function main() {
  if (!commandExists('ffmpeg', ['-version'])) throw new Error('FFmpeg não encontrado no PATH.');
  const args = parseArgs();
  const targets = parseTarget(args.target || 'all');
  const results = [];
  for (const target of targets) results.push(await renderTarget(target));

  console.log('\n[video] Exportação concluída:');
  for (const result of results) {
    console.log(`  - ${result.verticalOutput}`);
    console.log(`  - ${result.horizontalOutput}`);
    console.log(`  - ${result.posterOutput}`);
    if (result.nativeOverrides.length > 0) {
      for (const override of result.nativeOverrides) console.log(`    cena nativa: ${override.scene} <- ${override.file}`);
    }
    if (result.audio.silent) console.log(`    áudio: faixa silenciosa (adicione ${result.target}.wav em tools/hbx-video-studio/audio e renderize novamente)`);
    else console.log(`    áudio: ${result.audio.audioFile}`);
  }
}

main().catch((error) => {
  console.error(`\n[video] Falha: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
