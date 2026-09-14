import { badRequest } from "./security.js";

/**
 * Normalize a phone number to the JID format Baileys expects.
 * Accepts: "0812-3456-7890", "+62 812 3456 7890", "62812...@s.whatsapp.net"
 */
export function normalizePhone(input, defaultCountryCode = "62") {
  if (!input) throw badRequest("Nomor tujuan wajib diisi");

  let value = String(input).trim();

  // Already a JID
  if (value.includes("@")) return value;

  // wa.me links
  const waLink = value.match(/wa\.me\/(\d+)/i);
  if (waLink) value = waLink[1];

  value = value.replace(/[^\d+]/g, "");

  if (value.startsWith("+")) value = value.slice(1);

  // Local format 08xxx -> 628xxx
  if (value.startsWith("0")) value = defaultCountryCode + value.slice(1);
  else if (!value.startsWith(defaultCountryCode) && value.length <= 11) {
    value = defaultCountryCode + value;
  }

  if (value.length < 8 || value.length > 15) {
    throw badRequest(`Nomor tidak valid: ${input}`);
  }

  return `${value}@s.whatsapp.net`;
}

export function phoneFromJid(jid) {
  if (!jid) return null;
  return String(jid).split("@")[0].split(":")[0];
}

export function prettyPhone(jid) {
  const raw = phoneFromJid(jid);
  if (!raw) return jid;
  return `+${raw}`;
}

/**
 * Replace {{var}} placeholders. Missing variables resolve to an empty string
 * so a broadcast never sends a literal "{{nama}}" to a customer.
 */
export function renderTemplate(template, vars = {}) {
  if (!template) return "";
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function extractTemplateVars(template) {
  const vars = new Set();
  const re = /{{\s*([\w.-]+)\s*}}/g;
  let match;
  while ((match = re.exec(template || "")) !== null) vars.add(match[1]);
  return [...vars];
}

/** Small deterministic sleep helper used by the inline queue fallback. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
