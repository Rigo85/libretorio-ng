import {audioTimeline, chapterAt, chapterBounds, formatAudioTime, restoredPosition} from './audio-player.utils';

describe('Audio positions', () => {
  it('formats long durations without rounding 59.9 into 60 seconds', () => {
    for (const [input, output] of [[0, '0:00'], [59.999, '0:59'], [60, '1:00'], [3599.99, '59:59'], [90061, '25:01:01'], [NaN, '0:00'], [-1, '0:00']] as const) {
      expect(formatAudioTime(input)).toBe(output);
    }
  });
  it('respects chapter boundaries, gaps and absent end times', () => {
    const chapters = [{title:'A', startTimeInSeconds:2, endTimeInSeconds:10}, {title:'B', startTimeInSeconds:12, endTimeInSeconds:20}];
    for (const [time, index] of [[0,-1], [2,0], [9.9,0], [10,-1], [12,1], [20,-1]]) expect(chapterAt(chapters,time)).toBe(index);
    expect(chapterAt([{title:'A', startTimeInSeconds:0}],100)).toBe(0);
  });
  it('restores by source when tracks are reordered, accepting old index-only records', () => {
    const tracks = [{src:'b'}, {src:'a'}];
    expect(restoredPosition({src:'a', trackIndex:0, currentTime:43.4}, tracks)).toEqual({index:1, time:43.4});
    expect(restoredPosition({trackIndex:0, currentTime:43.4}, tracks)).toEqual({index:0, time:43.4});
    for (const value of [null, {}, {src:'missing', currentTime:1}, {trackIndex:2, currentTime:0}, {trackIndex:0, currentTime:-1}, {trackIndex:0, currentTime:Infinity}]) {
      expect(restoredPosition(value, tracks)).toBeUndefined();
    }
  });
  it('uses chapter duration, preserving exact fractional boundaries and gaps', () => {
    const chapters = [
      {title:'A', startTimeInSeconds:0, endTimeInSeconds:21.988979},
      {title:'B', startTimeInSeconds:21.988979, endTimeInSeconds:29.000975},
      {title:'C', startTimeInSeconds:29.000975, endTimeInSeconds:2308.875}
    ];
    expect(audioTimeline(chapters, 21.988979, 2500).chapterIndex).toBe(1);
    const range = audioTimeline(chapters, 100, 2500);
    expect(range.start).toBe(29.000975);
    expect(formatAudioTime(range.duration)).toBe('37:59');
    expect(audioTimeline(chapters, 2400, 2500)).toEqual({start:0, duration:2500, chapterIndex:-1});
    expect(audioTimeline([{title:'intro', startTimeInSeconds:5, endTimeInSeconds:10}], 0, 20).chapterIndex).toBe(-1);
  });
  it('keeps the last chapter at 100% on file end and clips to the actual file duration', () => {
    const chapters = [{title:'Last', startTimeInSeconds:50, endTimeInSeconds:101}];
    expect(audioTimeline(chapters, 99, 100)).toEqual({start:50, duration:50, chapterIndex:0});
    expect(audioTimeline([{...chapters[0], endTimeInSeconds:100}], 100, 100)).toEqual({start:50, duration:50, chapterIndex:0});
    expect(audioTimeline([{...chapters[0], endTimeInSeconds:90}], 100, 100).chapterIndex).toBe(-1);
  });
  it('does not invent durations for absent or invalid chapter boundaries', () => {
    for (const chapter of [
      {title:'A', startTimeInSeconds:0}, {title:'A', startTimeInSeconds:-1, endTimeInSeconds:10},
      {title:'A', startTimeInSeconds:0, endTimeInSeconds:NaN}, {title:'A', startTimeInSeconds:0, endTimeInSeconds:Infinity},
      {title:'A', startTimeInSeconds:5, endTimeInSeconds:5}, {title:'A', startTimeInSeconds:10, endTimeInSeconds:5}
    ]) {
      expect(chapterBounds(chapter)).toBeUndefined();
      expect(audioTimeline([chapter], 5, 100)).toEqual({start:0, duration:100, chapterIndex:-1});
    }
    expect(audioTimeline([], 0, NaN)).toEqual({start:0, duration:0, chapterIndex:-1});
    expect(audioTimeline(undefined, 50, 100)).toEqual({start:0, duration:100, chapterIndex:-1});
  });
});
