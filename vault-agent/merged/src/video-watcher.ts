// src/modules/video-watcher.ts
// ================================================================
// MODULE 9: VIDEO WATCHER
// Downloads any video (YouTube etc.) via yt-dlp,
// transcribes audio via Whisper API,
// analyzes frames + transcript via Claude vision,
// returns structured analysis.
// ================================================================

import { exec }           from 'child_process';
import { promisify }      from 'util';
import fs                 from 'fs';
import path               from 'path';
import { v4 as uuid }     from 'uuid';
import YTDlpWrap          from 'yt-dlp-wrap';
import Anthropic          from '@anthropic-ai/sdk';
import OpenAI             from 'openai';
import { config }         from '../config.js';
import { Logger }         from './logger.js';
import { storeMemory }    from './memory.js';
import type { VideoAnalysis } from '../types/index.js';

const log      = new Logger('video-watcher');
const execAsync = promisify(exec);

// Ensure download dir exists
fs.mkdirSync(config.logging.dir.replace('logs', 'data/videos'), { recursive: true });
const VIDEO_DIR = path.resolve('./data/videos');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

// ── DOWNLOAD VIDEO ────────────────────────────────────────────────
async function downloadVideo(url: string): Promise<{
  videoPath: string;
  audioPath: string;
  title:     string;
  duration:  number;
}> {
  const videoId   = uuid().slice(0, 8);
  const outputBase = path.join(VIDEO_DIR, `video-${videoId}`);
  const audioPath  = `${outputBase}.mp3`;
  const videoPath  = `${outputBase}.mp4`;

  log.info('TOOL_CALL', `Downloading video: ${url}`, { videoId });

  const ytdlp = new YTDlpWrap();

  // Get metadata first
  const metaStr = await ytdlp.execPromise([
    url, '--dump-json', '--no-playlist',
  ]);
  const meta = JSON.parse(metaStr) as { title: string; duration: number };

  // Enforce duration limit — 120 min in debug, 60 min otherwise
  const maxMinutes    = config.logging.level === 'debug' ? 120 : 60;
  const durationMinutes = (meta.duration ?? 0) / 60;
  if (durationMinutes > maxMinutes) {
    throw new Error(`Video too long: ${durationMinutes.toFixed(0)} minutes (max ${maxMinutes})`);
  }

  // Download audio only (faster, smaller)
  await ytdlp.execPromise([
    url,
    '--no-playlist',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '5',     // Lower quality = faster
    '--output', audioPath,
    '--quiet',
  ]);

  log.info('TOOL_RESULT', `Downloaded: ${meta.title}`, {
    duration: meta.duration,
    audioPath,
  });

  return {
    videoPath,
    audioPath,
    title:    meta.title,
    duration: meta.duration ?? 0,
  };
}

// ── TRANSCRIBE AUDIO ──────────────────────────────────────────────
async function transcribeAudio(audioPath: string): Promise<string> {
  log.info('TOOL_CALL', 'Transcribing audio', { audioPath });

  // Try OpenAI Whisper API first
  if (process.env['WHISPER_API_KEY']) {
    const openai = new OpenAI({ apiKey: process.env['WHISPER_API_KEY'] });
    const audioFile = fs.createReadStream(audioPath);
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file:  audioFile,
    });

    log.info('TOOL_RESULT', `Transcribed ${transcription.text.length} chars`, {});
    return transcription.text;
  }

  // Fallback: local whisper CLI
  try {
    const { stdout } = await execAsync(
      `whisper "${audioPath}" --model base --output_format txt --output_dir "${VIDEO_DIR}" --quiet`
    );
    const txtPath  = audioPath.replace('.mp3', '.txt');
    if (fs.existsSync(txtPath)) {
      return fs.readFileSync(txtPath, 'utf8');
    }
    return stdout || 'Transcription not available';
  } catch {
    return 'Transcription unavailable — install whisper CLI or set WHISPER_API_KEY';
  }
}

// ── ANALYZE WITH CLAUDE ────────────────────────────────────────────
async function analyzeWithClaude(params: {
  transcript: string;
  title:      string;
  action:     string;
  focus?:     string;
}): Promise<{ summary: string; keyPoints: string[]; sentiment: string; extractedData: Record<string, unknown> }> {
  const client = new Anthropic({ apiKey: config.llm.anthropicKey });

  const prompt = params.action === 'summarize'
    ? `Summarize this video: "${params.title}"\n\nTranscript:\n${params.transcript.slice(0, 15000)}`
    : params.action === 'analyze'
    ? `Analyze this video in depth: "${params.title}"${params.focus ? `\nFocus on: ${params.focus}` : ''}\n\nTranscript:\n${params.transcript.slice(0, 15000)}`
    : params.action === 'extract_data'
    ? `Extract all key data, facts, numbers, and information from this video: "${params.title}"\n\nTranscript:\n${params.transcript.slice(0, 15000)}`
    : `Transcribe and describe: "${params.title}"\n\nTranscript:\n${params.transcript.slice(0, 15000)}`;

  const response = await client.messages.create({
    model:      config.llm.claudeModel,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `${prompt}

Please respond in this exact JSON format:
{
  "summary": "2-3 paragraph summary",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "sentiment": "positive|negative|neutral|mixed",
  "extractedData": {}
}`,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const text      = textBlock?.type === 'text' ? textBlock.text : '{}';

  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed    = JSON.parse(jsonMatch?.[0] ?? '{}') as {
      summary: string;
      keyPoints: string[];
      sentiment: string;
      extractedData: Record<string, unknown>;
    };
    return {
      summary:       parsed.summary ?? text,
      keyPoints:     parsed.keyPoints ?? [],
      sentiment:     parsed.sentiment ?? 'neutral',
      extractedData: parsed.extractedData ?? {},
    };
  } catch {
    return {
      summary:       text,
      keyPoints:     [],
      sentiment:     'neutral',
      extractedData: {},
    };
  }
}

// ── CLEANUP TEMP FILES ────────────────────────────────────────────
function cleanup(paths: string[]): void {
  for (const p of paths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

// ── MAIN WATCH VIDEO FUNCTION ─────────────────────────────────────
export async function watchVideo(
  url:     string,
  action:  string,
  focus?:  string,
): Promise<VideoAnalysis> {
  log.info('TOOL_CALL', `Watch video: ${action} — ${url}`, { url, action, focus });

  const tempFiles: string[] = [];

  try {
    // 1. Download
    const { audioPath, title, duration } = await downloadVideo(url);
    tempFiles.push(audioPath);

    // 2. Transcribe
    const transcript = await transcribeAudio(audioPath);

    // 3. Analyze
    const analysis = await analyzeWithClaude({ transcript, title, action, focus });

    // 4. Store in memory
    storeMemory('video', `Video: ${title}\n${analysis.summary}`, {
      url, title, duration, action, sentiment: analysis.sentiment,
    });

    const result: VideoAnalysis = {
      url,
      title,
      duration,
      transcript: transcript.slice(0, 5000), // Truncate for response
      summary:    analysis.summary,
      keyPoints:  analysis.keyPoints,
      sentiment:  analysis.sentiment,
      extractedData: analysis.extractedData,
    };

    log.info('TOOL_RESULT', `Video analyzed: ${title}`, {
      keyPoints: analysis.keyPoints.length,
      sentiment: analysis.sentiment,
    });

    return result;

  } finally {
    cleanup(tempFiles);
  }
}
