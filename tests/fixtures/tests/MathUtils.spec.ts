import { MathUtils } from '../src/MathUtils';

const utils = new MathUtils();

describe('MathUtils', () => {
  it('should add two numbers', () => {
    expect(utils.add(1, 2)).toBe(3);
  });

  // subtract() is deliberately not tested here.
  // The second test in index.test.ts appends a call to cover it dynamically.
});