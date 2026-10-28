import { describe, expect, it } from 'vitest';
import { pageArgs, pageInfo } from './pagination.util.js';

describe('pageArgs', () => {
  it('returns everything (no take, no skip) when there is no limit', () => {
    expect(pageArgs(undefined)).toEqual({});
    expect(pageArgs(undefined, 3)).toEqual({});
  });

  it('treats a limit of 0 as no limit', () => {
    expect(pageArgs(0)).toEqual({});
  });

  it('starts at the first page by default', () => {
    expect(pageArgs(10)).toEqual({ take: 10, skip: 0 });
  });

  it('skips the pages before the requested one', () => {
    expect(pageArgs(10, 3)).toEqual({ take: 10, skip: 20 });
  });
});

describe('pageInfo', () => {
  it('counts the pages', () => {
    expect(pageInfo(25, 1, 10)).toEqual({ total: 25, page: 1, pages: 3 });
  });

  it('does not add an empty page when the total fits exactly', () => {
    expect(pageInfo(20, 2, 10).pages).toBe(2);
  });

  it('always has at least one page, even with no results', () => {
    expect(pageInfo(0, 1, 10).pages).toBe(1);
  });

  it('has a single page when there is no limit', () => {
    expect(pageInfo(500, 1)).toEqual({ total: 500, page: 1, pages: 1 });
  });
});
