const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const ICONS = {
  ok: '✓',
  warn: '⚠',
  error: '✗',
  info: 'ℹ',
};

const COLORS = {
  ok: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
  info: ANSI.cyan,
};

export function formatReport(diagnostics, { color = true, projectDir = '.' } = {}) {
  const c = (clr, text) => (color ? `${clr}${text}${ANSI.reset}` : text);

  const lines = [];
  lines.push('');
  lines.push(c(ANSI.bold + ANSI.cyan, '── midnight-doctor ──'));
  lines.push(c(ANSI.dim, `project: ${projectDir}`));
  lines.push('');

  const counts = { ok: 0, warn: 0, error: 0, info: 0 };

  for (const d of diagnostics) {
    counts[d.severity] = (counts[d.severity] || 0) + 1;
    const icon = ICONS[d.severity] || '·';
    const colored = c(COLORS[d.severity] || ANSI.reset, icon);
    lines.push(`${colored} ${c(ANSI.bold, d.title)}`);
    if (d.detail) {
      lines.push(`   ${c(ANSI.dim, d.detail)}`);
    }
    if (d.fix) {
      lines.push(`   ${c(ANSI.green, '→ fix:')} ${d.fix}`);
    }
  }

  lines.push('');
  lines.push(
    c(
      ANSI.bold,
      `summary: ${c(COLORS.ok, counts.ok + ' ok')}  ${c(COLORS.warn, counts.warn + ' warn')}  ${c(COLORS.error, counts.error + ' error')}  ${c(COLORS.info, counts.info + ' info')}`,
    ),
  );
  lines.push('');

  if (counts.error > 0) {
    lines.push(c(ANSI.red, 'Status: needs attention. Fix errors before continuing.'));
  } else if (counts.warn > 0) {
    lines.push(c(ANSI.yellow, 'Status: workable, but warnings deserve a look.'));
  } else {
    lines.push(c(ANSI.green, 'Status: stack looks healthy.'));
  }
  lines.push('');

  return { text: lines.join('\n'), counts };
}
