/** The parts of EXT_disjoint_timer_query_webgl2 we use. */
interface TimerExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** The parts of WebGL2 the timer needs (narrow, so tests can pass a fake). */
export type TimerGL = Pick<
  WebGL2RenderingContext,
  | 'getExtension'
  | 'createQuery'
  | 'deleteQuery'
  | 'beginQuery'
  | 'endQuery'
  | 'getQueryParameter'
  | 'getParameter'
  | 'QUERY_RESULT'
  | 'QUERY_RESULT_AVAILABLE'
>;

/** How quickly the shown value follows new samples (0–1 per sample). */
const SMOOTHING = 0.1;
/** Stop starting new queries if this many are still in flight (GPU far behind). */
const MAX_PENDING = 8;

/**
 * Measures GPU time per frame with a WebGL timer query, for the F1 stats.
 * FPS alone can't show GPU overload: the browser keeps calling the frame at 60 Hz while finished
 * frames queue up behind the GPU, which feels like input lag (found in M2).
 * Results arrive a few frames late; `ms` is a smoothed value, or null when unsupported.
 */
export class GpuTimer {
  ms: number | null = null;
  private readonly ext: TimerExt | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private readonly gl: TimerGL) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  begin(): void {
    if (!this.ext || this.active || this.pending.length >= MAX_PENDING) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext) return;
    if (this.active) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    this.collect();
  }

  private collect(): void {
    const { gl } = this;
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return; // results come in order
      this.pending.shift();
      // A "disjoint" event (GPU clock change, context switch) makes the sample meaningless.
      if (!gl.getParameter(this.ext!.GPU_DISJOINT_EXT)) {
        const sample = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        this.ms = this.ms === null ? sample : this.ms + (sample - this.ms) * SMOOTHING;
      }
      gl.deleteQuery(q);
    }
  }
}
