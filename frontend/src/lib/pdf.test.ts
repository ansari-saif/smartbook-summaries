import { describe, expect, it } from 'vitest';
import { isPdfFile } from './pdf';

function fakeFile(name: string, type = ''): File {
  return new File(['%PDF'], name, { type });
}

describe('isPdfFile', () => {
  it('accepts application/pdf', () => {
    expect(isPdfFile(fakeFile('notes.bin', 'application/pdf'))).toBe(true);
  });

  it('accepts .pdf extension when mime is empty', () => {
    expect(isPdfFile(fakeFile('book.PDF'))).toBe(true);
  });

  it('rejects non-pdf files', () => {
    expect(isPdfFile(fakeFile('photo.png', 'image/png'))).toBe(false);
  });

  it('rejects nullish values', () => {
    expect(isPdfFile(null)).toBe(false);
    expect(isPdfFile(undefined)).toBe(false);
  });
});
