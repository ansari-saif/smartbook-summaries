export function isPdfFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return file.name.toLowerCase().endsWith('.pdf');
}
