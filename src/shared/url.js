(function attachPumpUrl(global) {
  "use strict";

  const HOSTNAME_ALIAS_SUFFIXES = {
    "twitter.com": "x.com"
  };

  function stripWww(hostname) {
    return String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  }

  function normalizeHostname(input) {
    const rawInput = String(input || "").trim().toLowerCase();

    if (!rawInput || /\s/.test(rawInput)) {
      return "";
    }

    let candidate = rawInput.replace(/^view-source:/, "");

    if (candidate.startsWith("//")) {
      candidate = `https:${candidate}`;
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      const hostname = stripWww(parsed.hostname);

      if (!hostname || hostname.includes("..")) {
        return "";
      }

      return hostname;
    } catch (_error) {
      return "";
    }
  }

  function canonicalizeHostnameAlias(hostname) {
    const normalizedHostname = normalizeHostname(hostname);

    if (!normalizedHostname) {
      return "";
    }

    const alias = Object.entries(HOSTNAME_ALIAS_SUFFIXES)
      .find(([from]) => normalizedHostname === from || normalizedHostname.endsWith(`.${from}`));

    if (!alias) {
      return normalizedHostname;
    }

    const [from, to] = alias;
    return normalizedHostname.slice(0, normalizedHostname.length - from.length) + to;
  }

  function hostnameMatchesRule(currentHostname, ruleHostname) {
    const current = canonicalizeHostnameAlias(currentHostname);
    const rule = canonicalizeHostnameAlias(ruleHostname);

    if (!current || !rule) {
      return false;
    }

    return current === rule || current.endsWith(`.${rule}`);
  }

  global.PumpUrl = {
    normalizeHostname,
    stripWww,
    hostnameMatchesRule,
    canonicalizeHostnameAlias
  };
})(globalThis);
