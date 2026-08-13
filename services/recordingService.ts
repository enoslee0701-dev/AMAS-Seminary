// recordingService.ts — small helper around MediaRecorder + optional backend upload.

export interface CapturedRecording {
  blob: Blob;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export class SermonRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTs = 0;
  private mimeType = '';

  isRecording(): boolean {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state === 'recording');
  }

  /** Begin capture. Throws if mic access is denied or MediaRecorder unsupported. */
  async start(): Promise<void> {
    if (this.isRecording()) return;
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API is not available in this WebView.');
    }
    this.mimeType = pickMimeType();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.startTs = performance.now();
    this.mediaRecorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.mediaRecorder.ondataavailable = ev => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.mediaRecorder.start(1000); // emit chunks each second so we recover from refresh
  }

  /** Stop capture and return the assembled recording. Releases the mic. */
  async stop(): Promise<CapturedRecording> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      throw new Error('Recorder not running.');
    }
    const recorder = this.mediaRecorder;
    const stoppedAt = performance.now();
    await new Promise<void>(resolve => {
      const done = () => { recorder.removeEventListener('stop', done); resolve(); };
      recorder.addEventListener('stop', done);
      recorder.stop();
    });
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
    const out: CapturedRecording = {
      blob,
      durationMs: Math.max(0, Math.round(stoppedAt - this.startTs)),
      sizeBytes: blob.size,
      mimeType: this.mimeType || 'audio/webm',
    };
    this.chunks = [];
    return out;
  }

  /** Discard the in-progress recording and release the mic. */
  cancel(): void {
    try { this.mediaRecorder?.stop(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}

function backendBase(): string {
  return ((((import.meta as any).env?.VITE_API_BASE_URL) ?? '') as string).replace(/\/$/, '');
}

/** Optional backend upload. Returns the recording id on success or null if no backend / failure. */
export async function uploadRecording(
  rec: CapturedRecording,
  roomId: string,
  userId: string,
): Promise<{ id: string; uploadedAt: number } | null> {
  const base = backendBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/recordings`, {
      method: 'POST',
      headers: {
        'Content-Type': rec.mimeType,
        'X-Room-Id': roomId,
        'X-User-Id': userId,
        'X-Duration-Ms': String(rec.durationMs),
      },
      body: rec.blob,
    });
    if (!res.ok) {
      console.warn('[recordingService.upload] backend rejected:', res.status);
      return null;
    }
    return (await res.json()) as { id: string; uploadedAt: number };
  } catch (err) {
    console.warn('[recordingService.upload] network error:', err);
    return null;
  }
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
