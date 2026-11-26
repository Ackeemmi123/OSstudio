/**
 * Sound: a quiet ambient chord, off until the visitor turns it on. Played by
 * the browser's own synthesiser (Web Audio), so there is no file to download.
 * It follows the page: scrolling opens the chord's filter, so the sound
 * brightens while the page moves and settles when it rests. It fades in and
 * out, pauses when the tab is hidden, and the choice is remembered; a remembered "on" still waits for the visitor's first click or
 * key press, as browsers rightly require.
 *
 * Markup: <button type="button" data-sg="sound" aria-pressed="false" hidden>
 *           <span class="sound-bars" aria-hidden="true"><i></i>…</span><span>Ljud</span></button>
 * Without JavaScript the button stays hidden: it could do nothing.
 */

const KEY = "sg-sound";
/** A9 chord, open voiced: A2, E3, B3, C♯4, E4. Calm, neither happy nor sad. */
const CHORD = [110, 164.81, 246.94, 277.18, 329.63];
const LEVEL = 0.05;

const remembered = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};
const remember = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* Private browsing: the choice lasts for this page only. */
  }
};

interface Pad {
  context: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
}

function createPad(): Pad | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  const context = new Context();
  const master = context.createGain();
  master.gain.value = 0;

  // A soft low-pass that opens and closes very slowly: the chord breathes.
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const sweep = context.createOscillator();
  const sweepDepth = context.createGain();
  sweep.frequency.value = 0.045;
  sweepDepth.gain.value = 420;
  sweep.connect(sweepDepth).connect(filter.frequency);
  sweep.start();

  // A short echo with a darker tail gives the chord a room to sit in.
  const echo = context.createDelay(1);
  echo.delayTime.value = 0.42;
  const feedback = context.createGain();
  feedback.gain.value = 0.38;
  const tail = context.createBiquadFilter();
  tail.type = "lowpass";
  tail.frequency.value = 1400;
  const wet = context.createGain();
  wet.gain.value = 0.35;
  filter.connect(echo);
  echo.connect(tail).connect(feedback).connect(echo);
  tail.connect(wet).connect(master);
  filter.connect(master);
  master.connect(context.destination);

  // Each note: two slightly detuned oscillators, swelling on its own slow cycle.
  CHORD.forEach((frequency, index) => {
    const voice = context.createGain();
    voice.gain.value = 0.7 / CHORD.length;
    const swell = context.createOscillator();
    const swellDepth = context.createGain();
    swell.frequency.value = 0.06 + index * 0.017;
    swellDepth.gain.value = 0.35 / CHORD.length;
    swell.connect(swellDepth).connect(voice.gain);
    swell.start();
    for (const [type, cents] of [["sine", -5], ["triangle", 5]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = cents;
      oscillator.connect(voice);
      oscillator.start();
    }
    voice.connect(filter);
  });
  return { context, master, filter };
}

export function mountSound(button: HTMLButtonElement): void {
  let pad: Pad | null = null;
  let wanted = remembered();
  let playing = false;

  const show = () => {
    button.setAttribute("aria-pressed", String(wanted));
    button.classList.toggle("is-playing", playing);
  };

  const start = () => {
    pad ??= createPad();
    if (!pad) return;
    const { context, master } = pad;
    void context.resume();
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(LEVEL, now + 2.5);
    playing = true;
    show();
  };
  const stop = () => {
    playing = false;
    show();
    if (!pad) return;
    const { context, master } = pad;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 1.2);
    setTimeout(() => !playing && void context.suspend(), 1300);
  };

  button.addEventListener("click", () => {
    // A remembered "on" that has not started yet starts on this click.
    if (wanted && !playing) return start();
    wanted = !wanted;
    remember(wanted);
    if (wanted) start();
    else stop();
  });

  // Remembered "on": the first click or key anywhere starts it.
  if (wanted) {
    const first = (event: Event) => {
      removeEventListener("pointerdown", first, true);
      removeEventListener("keydown", first, true);
      if (event.target instanceof Node && button.contains(event.target)) return;
      if (wanted && !playing) start();
    };
    addEventListener("pointerdown", first, true);
    addEventListener("keydown", first, true);
  }

  // The scroll opens the filter: brighter while the page moves, settling as it rests.
  let lastY = scrollY;
  let lastTime = performance.now();
  const onScroll = () => {
    if (!pad || !playing) return;
    const now = performance.now();
    const speed = Math.abs(scrollY - lastY) / Math.max(16, now - lastTime);
    lastY = scrollY;
    lastTime = now;
    const { context, filter } = pad;
    filter.frequency.setTargetAtTime(900 + Math.min(1800, speed * 900), context.currentTime, 0.08);
    filter.frequency.setTargetAtTime(900, context.currentTime + 0.25, 0.6);
  };
  addEventListener("scroll", onScroll, { passive: true });

  // Quiet while the tab is hidden; back when it returns.
  document.addEventListener("visibilitychange", () => {
    if (!pad || !playing) return;
    if (document.visibilityState === "hidden") void pad.context.suspend();
    else void pad.context.resume();
  });

  button.hidden = false;
  show();
}
