import { describe, it, expect } from 'vitest';
import { redactToken } from '../middleware/auth.js';
import {
  resolveMcpBindHost,
  resolveMcpToken,
  shouldWarnLanExposure,
} from '../boot-config.js';

describe('MCP boot config', () => {
  it('defaults bind host to 127.0.0.1', () => {
    expect(resolveMcpBindHost({})).toBe('127.0.0.1');
  });

  it('respects DARE_MCP_BIND override', () => {
    expect(resolveMcpBindHost({ DARE_MCP_BIND: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('warns on 0.0.0.0 LAN exposure', () => {
    expect(shouldWarnLanExposure('0.0.0.0')).toBe(true);
    expect(shouldWarnLanExposure('127.0.0.1')).toBe(false);
  });

  it('boot log redaction never contains full generated token', () => {
    const token = resolveMcpToken({});
    const masked = redactToken(token);
    expect(masked).not.toBe(token);
    if (token.length > 8) {
      expect(masked).not.toContain(token);
    }
  });

  it('uses DARE_MCP_TOKEN when provided', () => {
    const token = 'my-fixed-boot-token-value';
    expect(resolveMcpToken({ DARE_MCP_TOKEN: token })).toBe(token);
    expect(redactToken(token)).not.toContain(token);
  });
});
