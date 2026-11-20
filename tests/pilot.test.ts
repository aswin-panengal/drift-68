import { describe, expect, it } from 'vitest';
import { CAR_IDS, TRACK_IDS } from '../src/shared/types';
import { driveLap } from './helpers/lapPilot';

describe('continuous course driving', () => {
  for (const track of TRACK_IDS) {
    for (const car of CAR_IDS) {
      it(`drives a complete ${track} lap in ${car} without teleporting`, () => {
        const { lap } = driveLap(track, car);
        expect(lap.finished, `${track}/${car} reached checkpoint ${lap.next}`).toBe(true);
      });
    }
  }
});
