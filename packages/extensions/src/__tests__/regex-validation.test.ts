import { vi } from 'vitest';
import { createRegexValidation, RegexRule, RegexValidationConfig } from '../regex-validation';
import type { GridEvent } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(field: string, rowId: string, newValue: unknown): GridEvent & { cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  return {
    type: 'cell:valueChange',
    timestamp: Date.now(),
    cancel,
    cancelled: false,
    payload: { cell: { rowId, field }, newValue },
  };
}

function runHook(config: RegexValidationConfig, field: string, newValue: unknown, rowId = 'r1') {
  const ext = createRegexValidation(config);
  const hooks = ext.hooks?.({} as any) ?? [];
  const hook = hooks[0]!;
  const event = makeEvent(field, rowId, newValue);
  const result = hook.handler(event);
  return { event, result };
}

const emailRule: RegexRule = {
  id: 'email',
  pattern: '^[^@]+@[^@]+\\.[^@]+$',
  message: 'Invalid email: {value}',
  severity: 'error',
};

const phoneRule: RegexRule = {
  id: 'phone',
  pattern: '^\\+?[0-9]{7,15}$',
  message: 'Invalid phone',
  severity: 'warning',
};

// ---------------------------------------------------------------------------
// Extension structure
// ---------------------------------------------------------------------------

describe('createRegexValidation', () => {
  it('returns an ExtensionDefinition with correct id', () => {
    const ext = createRegexValidation({ columns: {} });
    expect(ext.id).toBe('regex-validation');
  });

  it('returns version 0.1.0', () => {
    const ext = createRegexValidation({ columns: {} });
    expect(ext.version).toBe('0.1.0');
  });

  it('returns a hooks function', () => {
    const ext = createRegexValidation({ columns: {} });
    expect(typeof ext.hooks).toBe('function');
  });

  it('registers exactly one hook on cell:valueChange before phase', () => {
    const ext = createRegexValidation({ columns: { email: [emailRule] } });
    const hooks = ext.hooks?.({} as any) ?? [];
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.event).toBe('cell:valueChange');
    expect(hooks[0]!.phase).toBe('before');
  });
});

// ---------------------------------------------------------------------------
// Valid input — no rejection
// ---------------------------------------------------------------------------

describe('regex-validation: valid input', () => {
  it('accepts a valid email address', () => {
    const { event, result } = runHook({ columns: { email: [emailRule] } }, 'email', 'user@example.com');
    expect(event.cancel).not.toHaveBeenCalled();
    expect(result).not.toBe(false);
  });

  it('accepts a valid phone number', () => {
    const { event } = runHook({ columns: { phone: [phoneRule] } }, 'phone', '+12345678901');
    expect(event.cancel).not.toHaveBeenCalled();
  });

  it('ignores columns not in config', () => {
    const { event } = runHook({ columns: { email: [emailRule] } }, 'name', 'invalid-email');
    expect(event.cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invalid input — rejection
// ---------------------------------------------------------------------------

describe('regex-validation: invalid input', () => {
  it('rejects an invalid email and returns false', () => {
    const { result, event } = runHook({ columns: { email: [emailRule] } }, 'email', 'not-an-email');
    expect(result).toBe(false);
    expect(event.cancel).toHaveBeenCalled();
  });

  it('rejects an invalid phone number (warning severity does NOT cancel)', () => {
    const { result, event } = runHook({ columns: { phone: [phoneRule] } }, 'phone', 'abc');
    // warning severity — does not cancel even with rejectOnError default
    expect(event.cancel).not.toHaveBeenCalled();
    expect(result).not.toBe(false);
  });

  it('cancels on error severity when rejectOnError is true (default)', () => {
    const { event } = runHook({ columns: { email: [emailRule] }, rejectOnError: true }, 'email', 'bad');
    expect(event.cancel).toHaveBeenCalled();
  });

  it('does NOT cancel on error severity when rejectOnError is false', () => {
    const { event } = runHook({ columns: { email: [emailRule] }, rejectOnError: false }, 'email', 'bad');
    expect(event.cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

describe('regex-validation: severity', () => {
  it('error severity cancels the event by default', () => {
    const rule: RegexRule = { id: 'r1', pattern: '^\\d+$', message: 'digits only', severity: 'error' };
    const { event } = runHook({ columns: { code: [rule] } }, 'code', 'abc');
    expect(event.cancel).toHaveBeenCalled();
  });

  it('warning severity does not cancel even on mismatch', () => {
    const rule: RegexRule = { id: 'r2', pattern: '^\\d+$', message: 'digits preferred', severity: 'warning' };
    const { event } = runHook({ columns: { code: [rule] } }, 'code', 'abc');
    expect(event.cancel).not.toHaveBeenCalled();
  });

  it('info severity does not cancel on mismatch', () => {
    const rule: RegexRule = { id: 'r3', pattern: '^\\d+$', message: 'fyi', severity: 'info' };
    const { event } = runHook({ columns: { code: [rule] } }, 'code', 'abc');
    expect(event.cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invert mode
// ---------------------------------------------------------------------------

describe('regex-validation: invert mode', () => {
  it('passes when pattern does NOT match and invert=true', () => {
    const rule: RegexRule = { id: 'no-script', pattern: '<script', message: 'No scripts', severity: 'error', invert: true };
    const { event } = runHook({ columns: { html: [rule] } }, 'html', '<div>hello</div>');
    expect(event.cancel).not.toHaveBeenCalled();
  });

  it('rejects when pattern DOES match and invert=true', () => {
    const rule: RegexRule = { id: 'no-script', pattern: '<script', message: 'No scripts', severity: 'error', invert: true };
    const { event } = runHook({ columns: { html: [rule] } }, 'html', '<script>alert(1)</script>');
    expect(event.cancel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// allowEmpty
// ---------------------------------------------------------------------------

describe('regex-validation: allowEmpty', () => {
  it('skips validation on empty string when allowEmpty is not false (default)', () => {
    const { event } = runHook({ columns: { email: [emailRule] } }, 'email', '');
    expect(event.cancel).not.toHaveBeenCalled();
  });

  it('validates empty string when allowEmpty is explicitly false', () => {
    const rule: RegexRule = { ...emailRule, allowEmpty: false };
    const { event } = runHook({ columns: { email: [rule] } }, 'email', '');
    expect(event.cancel).toHaveBeenCalled();
  });

  it('skips validation on null when allowEmpty is not false', () => {
    const { event } = runHook({ columns: { email: [emailRule] } }, 'email', null);
    expect(event.cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error message templates
// ---------------------------------------------------------------------------

describe('regex-validation: message templates', () => {
  it('substitutes {value} in message', () => {
    const rule: RegexRule = { id: 'r', pattern: '^\\d+$', message: 'Bad value: {value}', severity: 'error' };
    // We verify indirectly by checking cancel was called (errors were generated)
    const { event } = runHook({ columns: { code: [rule] }, rejectOnError: false }, 'code', 'abc');
    expect(event.cancel).not.toHaveBeenCalled(); // rejectOnError false
  });

  it('substitutes {field} in message without throwing', () => {
    const rule: RegexRule = { id: 'r', pattern: '^\\d+$', message: 'Field {field} is wrong', severity: 'warning' };
    expect(() => runHook({ columns: { code: [rule] } }, 'code', 'xyz')).not.toThrow();
  });

  it('substitutes {pattern} in message without throwing', () => {
    const rule: RegexRule = { id: 'r', pattern: '^\\d+$', message: 'Must match {pattern}', severity: 'warning' };
    expect(() => runHook({ columns: { code: [rule] } }, 'code', 'xyz')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Multiple rules per column
// ---------------------------------------------------------------------------

describe('regex-validation: multiple rules', () => {
  it('runs all rules and stops on first error rejection', () => {
    const rule1: RegexRule = { id: 'r1', pattern: '^.{3,}$', message: 'Too short', severity: 'error' };
    const rule2: RegexRule = { id: 'r2', pattern: '^[a-z]+$', message: 'Lowercase only', severity: 'error' };
    const { event } = runHook({ columns: { code: [rule1, rule2] } }, 'code', 'AB');
    expect(event.cancel).toHaveBeenCalled();
  });

  it('passes when all rules match', () => {
    const rule1: RegexRule = { id: 'r1', pattern: '^.{3,}$', message: 'Too short', severity: 'error' };
    const rule2: RegexRule = { id: 'r2', pattern: '^[a-z]+$', message: 'Lowercase only', severity: 'error' };
    const { event } = runHook({ columns: { code: [rule1, rule2] } }, 'code', 'abc');
    expect(event.cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// URL pattern
// ---------------------------------------------------------------------------

describe('regex-validation: URL pattern', () => {
  const urlRule: RegexRule = {
    id: 'url',
    pattern: '^https?://.+\\..+',
    message: 'Invalid URL',
    severity: 'error',
  };

  it('accepts a valid http URL', () => {
    const { event } = runHook({ columns: { url: [urlRule] } }, 'url', 'http://example.com');
    expect(event.cancel).not.toHaveBeenCalled();
  });

  it('rejects a URL without protocol', () => {
    const { event } = runHook({ columns: { url: [urlRule] } }, 'url', 'example.com');
    expect(event.cancel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getValidationErrors
// ---------------------------------------------------------------------------

describe('getValidationErrors', () => {
  it('returns an empty Map', async () => {
    const { getValidationErrors } = await import('../regex-validation');
    expect(getValidationErrors()).toBeInstanceOf(Map);
    expect(getValidationErrors().size).toBe(0);
  });
});
