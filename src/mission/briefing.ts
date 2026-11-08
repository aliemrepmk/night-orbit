/** The briefing screen's text (M8, PLAN.md §8 phase 0). Original setting: see PLAN.md §2. */
export const BRIEFING = {
  title: 'OPERATION NIGHT ORBIT',
  situation: [
    'Recon team RIDGEBACK (four operators) has lost its observation post in the Varesh Valley. Militia are moving up from the villages.',
    'Ridgeback will cross the valley on foot: over the fields and the stream bridge, through the village, past the crossroads, to LZ QUARRY.',
    'You are the sensor operator and gunner on LANTERN 2-1. Keep them alive until KESTREL 6 lifts them out.',
  ],
  rules: [
    'Ridgeback wears IR strobes: they blink in every sensor. Never fire on them.',
    'The field clinic in the village is protected. Firing on it ends the mission.',
    'Watch your blast radius near friendlies: the FCO will call danger close.',
  ],
} as const;
