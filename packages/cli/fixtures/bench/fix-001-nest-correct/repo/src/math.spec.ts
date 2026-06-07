import { add } from './math';

describe('add', () => {
  it('add sums two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('add handles zero', () => {
    expect(add(0, 0)).toBe(0);
  });
});
