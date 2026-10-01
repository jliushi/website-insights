import { PSL_RULES } from './psl-data.js';

let rules = null;

function loadRules() {
  if (rules) return rules;
  rules = { exact: new Set(), wildcard: new Set(), exception: new Set() };
  for (const r of PSL_RULES.split(' ')) {
    if (r.startsWith('!')) rules.exception.add(r.slice(1));
    else if (r.startsWith('*.')) rules.wildcard.add(r.slice(2));
    else rules.exact.add(r);
  }
  return rules;
}

/** Returns the public suffix (e.g. "co.uk") for an ASCII hostname. */
export function publicSuffix(hostname) {
  const { exact, wildcard, exception } = loadRules();
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (exception.has(candidate)) return labels.slice(i + 1).join('.');
    if (exact.has(candidate)) return candidate;
    const parent = labels.slice(i + 1).join('.');
    if (parent && wildcard.has(parent)) return candidate;
  }
  // Unknown TLD: the default rule "*" treats the last label as the suffix.
  return labels[labels.length - 1];
}

/** Returns the registrable domain (eTLD+1), or null for IPs, localhost and bare suffixes. */
export function registrableDomain(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isIp(host) || !host.includes('.')) return null;
  const suffix = publicSuffix(host);
  if (host === suffix) return null;
  const rest = host.slice(0, host.length - suffix.length - 1).split('.');
  return `${rest[rest.length - 1]}.${suffix}`;
}

export function isIp(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
}

export function tldOf(domain) {
  return domain.split('.').pop();
}

/** Decodes punycode labels for display ("xn--bcher-kva.de" -> "bücher.de"). */
export function displayHost(hostname) {
  if (!hostname.includes('xn--')) return hostname;
  return hostname.split('.').map((l) => (l.startsWith('xn--') ? punycodeDecode(l.slice(4)) ?? l : l)).join('.');
}

// RFC 3492 decoder, enough for display purposes.
function punycodeDecode(input) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  let n = 128, i = 0, bias = 72;
  const output = [];
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) output.push(input.charCodeAt(j));
  const adapt = (delta, numPoints, first) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (idx >= input.length) return null;
      const c = input.charCodeAt(idx++);
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      if (digit >= base) return null;
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}
