import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Speaker } from '../mission/missionTypes';
import { impactVolume, type SoundId } from './sounds';

/** One sound to play, at a volume (0–1). */
export interface Cue {
  readonly id: SoundId;
  readonly volume: number;
}

/** What the mapping plays into: the audio engine (or a fake in tests). */
export interface SoundSink {
  play(id: SoundId, volume?: number): void;
  /** The static under a line on the outside net. */
  radioHiss(on: boolean): void;
}

/** Where the sensor is looking (impacts far from it are quieter). */
export type AimDistance = (x: number, z: number) => number;

/**
 * Who is on the outside net (squelch and static) rather than the gunship's own intercom (a
 * click): Ridgeback on the ground, Kestrel 6 and the strike pilot.
 */
export const OUTSIDE_NET: ReadonlySet<Speaker> = new Set(['RIDGEBACK', 'KESTREL', 'PILOT']);

type Mapper<K extends keyof GameEvents> = (e: GameEvents[K], aim: AimDistance) => Cue[];

const cue = (id: SoundId, volume = 1): Cue => ({ id, volume });

/**
 * The sound for each game event (M9, pure): the one place that says what you hear. Events not
 * listed make no sound of their own (the radio line about them has its squelch).
 */
export const EVENT_SOUNDS: { readonly [K in keyof GameEvents]?: Mapper<K> } = {
  shotFired: (e) => [cue(`fire${e.weapon}`)],
  impact: (e) => [cue(`impact${e.weapon}`, impactVolume(e.distanceToAim, e.weapon))],
  enemyShell: (e, aim) => [cue('impact40', impactVolume(aim(e.x, e.z)))],
  hullHit: (e) => [cue('hullHit', e.by === 'missile' ? 1 : 0.6)],
  flares: (e) => [e.result === 'empty' ? cue('deny') : cue('flare')],
  weaponSelected: () => [cue('select')],
  // The 105 mm gets the loader's clank before its beep; the others just beep.
  weaponReady: (e) => (e.weapon === '105' ? [cue('breech'), cue('ready')] : [cue('ready')]),
  radioKey: (e) =>
    OUTSIDE_NET.has(e.speaker) ? [cue(e.on ? 'squelchOpen' : 'squelchClose')] : [cue('intercom')],
};

/** The cues an event plays (pure; for tests and the wiring below). */
export function cuesFor<K extends keyof GameEvents>(
  type: K,
  e: GameEvents[K],
  aim: AimDistance,
): Cue[] {
  const m = EVENT_SOUNDS[type] as Mapper<K> | undefined;
  return m ? m(e, aim) : [];
}

/** Subscribes the sink to every event that makes a sound. Returns a function that unsubscribes. */
export function wireSounds(
  bus: EventBus<GameEvents>,
  sink: SoundSink,
  aim: AimDistance,
): () => void {
  const offs: (() => void)[] = [];
  for (const type of Object.keys(EVENT_SOUNDS) as (keyof GameEvents)[]) {
    offs.push(
      bus.on(type, (e) => {
        for (const c of cuesFor(type, e, aim)) sink.play(c.id, c.volume);
      }),
    );
  }
  offs.push(
    bus.on('radioKey', (e) => {
      if (OUTSIDE_NET.has(e.speaker)) sink.radioHiss(e.on);
    }),
  );
  return () => offs.forEach((off) => off());
}
