// Excalidraw scene -> Mermaid reading copy.
//
// Deliberately lossy: positions, colours, fonts and arrow curves are dropped;
// boxes, labels, connections, line style and grouping are kept. The canvas stays
// the master copy.

import { analyzeScene, bounds, center, TUNING } from './scene-model.js';

export const GENERATED_MARKER = 'reading copy, edits here do not change the canvas';

export function headerLine(sourceUrl) {
  return '%% generated from ' + (sourceUrl || 'local scene') + '; ' + GENERATED_MARKER;
}

function oneLine(text) {
  return String(text).replace(/\s*\r?\n\s*/g, ' / ').trim();
}

export function formatLabel(text) {
  var t = String(text).replace(/\r?\n/g, '<br/>');
  if (/^[A-Za-z0-9 _.,'?!-]+$/.test(t) && !/^\s|\s$/.test(t)) return t;
  return '"' + t.replace(/"/g, '#quot;') + '"';
}

function nodeDecl(n) {
  var label = formatLabel(n.label.text);
  if (n.shape === 'ellipse') return n.id + '((' + label + '))';
  if (n.shape === 'diamond') return n.id + '{' + label + '}';
  return n.id + '[' + label + ']';
}

function edgeArrow(e) {
  if (e.kind === 'double') return e.dashed ? '<-.->' : '<-->';
  if (e.kind === 'open') return e.dashed ? '-.-' : '---';
  return e.dashed ? '-.->' : '-->';
}

function edgeLine(model, e) {
  var label = e.label && e.label.text ? '|' + formatLabel(e.label.text) + '|' : '';
  return model.mermaidId(e.from) + ' ' + edgeArrow(e) + label + ' ' + model.mermaidId(e.to);
}

export function flowDirection(model) {
  var cs = Array.from(model.nodes.values()).filter(function (n) {
    return !model.legend || !model.legend.ids.has(n.el.id);
  }).map(function (n) { return center(n.el); });
  if (cs.length < 2) return 'TB';
  var xs = cs.map(function (c) { return c[0]; }), ys = cs.map(function (c) { return c[1]; });
  var spreadX = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  var spreadY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
  return spreadX > spreadY ? 'LR' : 'TB';
}

function commentLines(model) {
  var out = [];
  model.notes.forEach(function (t) { out.push('%% note: ' + oneLine(model.textOf(t))); });
  model.unresolved.forEach(function (e) {
    var label = e.label && e.label.text ? ' "' + oneLine(e.label.text) + '"' : '';
    var from = e.from ? model.mermaidId(e.from) : '?';
    var to = e.to ? model.mermaidId(e.to) : '?';
    out.push('%% unconnected arrow' + label + ': ' + from + ' ' + edgeArrow(e) + ' ' + to);
  });
  model.images.forEach(function (img) {
    var inside = Array.from(model.groups.values()).filter(function (g) {
      var gb = bounds(g.el), c = center(img);
      return c[0] >= gb.x && c[0] <= gb.x + gb.w && c[1] >= gb.y && c[1] <= gb.y + gb.h;
    }).sort(function (a, b) { return bounds(a.el).w * bounds(a.el).h - bounds(b.el).w * bounds(b.el).h; })[0];
    out.push('%% image: embedded picture, contents not readable' + (inside ? ' (inside ' + inside.id + ')' : ''));
  });
  return out;
}

// The canvas's colour key, as Mermaid classes: each box in the diagram is
// tagged with the key entry whose style it wears, and the key boxes themselves
// are not drawn.
function legendClasses(model) {
  var used = new Set();
  return model.legend.items.map(function (item, i) {
    var slug = oneLine(item.node.label.text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    var name = 'key_' + (slug || String(i + 1));
    while (used.has(name)) name += '_';
    used.add(name);
    var bg = item.node.el.backgroundColor;
    return {
      name: name,
      label: oneLine(item.node.label.text),
      fill: bg && bg !== 'transparent' ? bg : 'none',
      members: item.members.map(function (m) { return m.id; }),
    };
  });
}

function legendComment(k) {
  return '%% legend: ' + k.name + ' = ' + k.label;
}

function outlineReason(model) {
  if (model.signals.lifelines >= 2) return 'looks like a sequence diagram (lifelines)';
  if (model.nodes.size && model.signals.dividedNodes * 2 >= model.nodes.size) return 'looks like a class or ER diagram (boxes with member dividers)';
  if (!model.nodes.size) return 'no labelled boxes found';
  if (model.edgeCount > 0) {
    var ratio = model.edges.length / model.edgeCount;
    if (ratio < TUNING.flowchartMinResolvedRatio) {
      return 'only ' + model.edges.length + ' of ' + model.edgeCount + ' arrows connect two boxes';
    }
  }
  return null;
}

export function sceneToMermaid(scene, options) {
  var sourceUrl = options && options.sourceUrl;
  var model = analyzeScene(scene);
  var warnings = [];
  if (model.unresolved.length) warnings.push(model.unresolved.length + ' arrow(s) could not be matched to boxes');
  if (model.images.length) warnings.push(model.images.length + ' embedded image(s) cannot be read');

  var reason = outlineReason(model);
  var lines = [headerLine(sourceUrl)];

  if (reason) {
    lines.push('%% outline (needs agent): ' + reason);
    lines.push('%% labels:');
    model.nodes.forEach(function (n) { if (!model.legend.ids.has(n.el.id)) lines.push('%%   ' + n.id + ': ' + oneLine(n.label.text)); });
    model.groups.forEach(function (g) { if (g.label.text) lines.push('%%   ' + g.id + ' (group): ' + oneLine(g.label.text)); });
    if (model.edges.length) {
      lines.push('%% connections:');
      model.edges.forEach(function (e) {
        lines.push('%%   ' + model.mermaidId(e.from) + ' ' + edgeArrow(e) + ' ' + model.mermaidId(e.to) + (e.label && e.label.text ? ': ' + oneLine(e.label.text) : ''));
      });
    }
    legendClasses(model).forEach(function (k) { lines.push(legendComment(k) + ': ' + k.members.join(', ')); });
    commentLines(model).forEach(function (l) { lines.push(l); });
    return { text: lines.join('\n'), kind: 'outline', warnings: warnings.concat(['outline: ' + reason]) };
  }

  lines.push('flowchart ' + flowDirection(model));

  var childrenOf = function (parentId) {
    var kids = [];
    model.groups.forEach(function (g) { if (g.parent === parentId) kids.push(g); });
    model.nodes.forEach(function (n) { if (n.parent === parentId && !model.legend.ids.has(n.el.id)) kids.push(n); });
    return kids.sort(function (a, b) { return model.order.get(a.el.id) - model.order.get(b.el.id); });
  };
  model.order = new Map((scene.elements || []).map(function (el, i) { return [el.id, i]; }));

  var emit = function (parentId, indent) {
    childrenOf(parentId).forEach(function (item) {
      if (item.kind === 'node') {
        lines.push(indent + nodeDecl(item));
      } else {
        lines.push(indent + 'subgraph ' + item.id + (item.label.text ? ' [' + formatLabel(item.label.text) + ']' : ''));
        emit(item.el.id, indent + '  ');
        lines.push(indent + 'end');
      }
    });
  };
  emit(null, '  ');

  model.edges.forEach(function (e) { lines.push('  ' + edgeLine(model, e)); });
  legendClasses(model).forEach(function (k) {
    lines.push('  ' + legendComment(k));
    lines.push('  classDef ' + k.name + ' fill:' + k.fill);
    if (k.members.length) lines.push('  class ' + k.members.join(',') + ' ' + k.name);
  });
  commentLines(model).forEach(function (l) { lines.push('  ' + l); });

  return { text: lines.join('\n'), kind: 'flowchart', warnings: warnings };
}
