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

export function formatPhoneDisplay(phone: string): string {
  if (phone.startsWith('62')) {
    return `+${phone.substring(0, 2)} ${phone.substring(2, 5)}-${phone.substring(5, 9)}-${phone.substring(9)}`;
  }
  return `+${phone}`;
}
