export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+62')) return cleaned.substring(1);
  if (cleaned.startsWith('62')) return cleaned;
  if (cleaned.startsWith('0')) return `62${cleaned.substring(1)}`;
  return `62${cleaned}`;
}

export function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  return /^[1-9][0-9]{7,14}$/.test(formatted);
}
