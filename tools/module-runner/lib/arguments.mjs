export function parseArguments(argv) {
  const options = new Map();
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const separator = token.indexOf('=');
    if (separator !== -1) {
      options.set(token.slice(2, separator), token.slice(separator + 1));
      continue;
    }

    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options.set(name, true);
      continue;
    }

    options.set(name, next);
    index += 1;
  }

  return { options, positionals };
}

export function requireOption(options, name) {
  const value = options.get(name);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required --${name} option.`);
  }
  return value;
}

export function optionalString(options, name, fallback = null) {
  const value = options.get(name);
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string') {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}
