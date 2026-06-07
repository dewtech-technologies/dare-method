import { add, sub } from './math';

describe('math', () => {
  it('add sums two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('sub subtracts two numbers', () => {
    expect(sub(5, 2)).toBe(3);
  });
  it('add handles zero', () => {
    expect(add(0, 0)).toBe(0);
  });
});
