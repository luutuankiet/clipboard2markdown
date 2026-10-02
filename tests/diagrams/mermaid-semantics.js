// Parses the Mermaid this repo generates into sets, so tests compare meaning:
// nodes (id, label, shape), edges (from, to, label, style), subgraph membership,
// notes, comments and colour-key classes. Ordering and whitespace never fail a test.

function unquote(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/#quot;/g, '"');
  return s;
}

export function parseMermaid(text) {
  const out = { kind: 'flowchart', direction: null, nodes: [], edges: [], members: [], subgraphs: [], comments: [], outline: [], classDefs: [], classes: [] };
  const stack = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('%% generated from')) continue;
    if (line.startsWith('%% outline')) { out.kind = 'outline'; out.comments.push(line); continue; }
    if (line.startsWith('%%')) {
      if (out.kind === 'outline' && /^%%\s{3}/.test(line)) out.outline.push(line.replace(/^%%\s+/, ''));
      else out.comments.push(line);
      continue;
    }
    let m;
    if ((m = /^flowchart (TB|LR|TD|BT|RL)$/.exec(line))) { out.direction = m[1]; continue; }
    if ((m = /^subgraph (\S+)(?:\s*\[(.*)\])?$/.exec(line))) {
      out.subgraphs.push(`${m[1]}|${m[2] ? unquote(m[2]) : ''}`);
      if (stack.length) out.members.push(`${m[1]} in ${stack[stack.length - 1]}`);
      stack.push(m[1]);
      continue;
    }
    if (line === 'end') { stack.pop(); continue; }
    if ((m = /^classDef (\S+) (\S+)$/.exec(line))) { out.classDefs.push(`${m[1]} ${m[2]}`); continue; }
    if ((m = /^class (\S+) (\S+)$/.exec(line))) { m[1].split(',').forEach((id) => out.classes.push(`${id} ${m[2]}`)); continue; }
    if ((m = /^(\S+) (<-->|<-\.->|-\.->|-\.-|-->|---)(?:\|(.*)\|)? (\S+)$/.exec(line))) {
      out.edges.push(`${m[1]} ${m[2]} ${m[4]}${m[3] ? ' : ' + unquote(m[3]) : ''}`);
      continue;
    }
    if ((m = /^([A-Za-z][\w]*)(\(\(|\[|\{)(.*)(\)\)|\]|\})$/.exec(line))) {
      const shape = { '((': 'ellipse', '[': 'rect', '{': 'diamond' }[m[2]];
      out.nodes.push(`${m[1]}|${unquote(m[3])}|${shape}`);
      if (stack.length) out.members.push(`${m[1]} in ${stack[stack.length - 1]}`);
      continue;
    }
    throw new Error('unparsed Mermaid line: ' + line);
  }
  for (const k of ['nodes', 'edges', 'members', 'subgraphs', 'comments', 'outline', 'classDefs', 'classes']) out[k].sort();
  return out;
}
