// Synthesized 8-bit "coin" blip via the Web Audio API — no audio file, no
// copyright. The classic arcade coin is two quick square-wave notes: a short
// grace note that jumps up to a longer, ringing note with an exponential decay.
// Must be triggered from a user gesture (the tip click satisfies this).

let ctx: AudioContext | null = null;

export function playCoinSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    ctx = ctx ?? new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(987.77, now); // B5 grace note
    osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6 ring

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.setValueAtTime(0.18, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  } catch {
    // Audio unavailable (autoplay policy, no device) — fail silently.
  }
}
