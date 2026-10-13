/*
 * Ming Long Editor · safe, dependency-free Markdown renderer
 *
 * It deliberately escapes HTML first. Only the three Markdown line-break
 * spellings are turned back into <br />. Consumers can replace render() with
 * their own renderer while keeping the editor and source-line synchronisation.
 */
(function (global) {
  'use strict';

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function attr(value) { return escape(value).replace(/`/g, '&#96;'); }
  function sourceAttr(line, end) {
    return line == null ? '' : ' data-source-line="' + line + '" data-source-end="' + (end == null ? line : end) + '"';
  }

  function createInline() {
    var math = [];
    function mathToken(index) { return '\u0001' + index + '\u0001'; }
    function protectMath(value, firstLine) {
      return value.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g,
        function (match, displayDollar, displayBracket, inlineParen, inlineDollar, offset) {
          var tex = displayDollar != null ? displayDollar : displayBracket != null ? displayBracket : inlineParen != null ? inlineParen : inlineDollar;
          var display = displayDollar != null || displayBracket != null;
          if (!tex || !tex.trim()) return match;
          if (!display && !/[\\^_{}=+\-*/<>a-zA-Z\u4e00-\u9fa5]/.test(tex)) return match;
          var line = firstLine == null ? null : firstLine + value.slice(0, offset).split('\n').length - 1;
          var end = line == null ? null : line + match.split('\n').length - 1;
          math.push({ tex: tex, display: display, line: line, end: end });
          return mathToken(math.length - 1) + (end != null && end > line ? '\n'.repeat(end - line) : '');
        });
    }
    function restoreMath(value) {
      return value.replace(/\u0001(\d+)\u0001/g, function (match, index) {
        var item = math[Number(index)];
        if (!item) return match;
        return '<span class="math-pending"' + sourceAttr(item.line, item.end) +
          ' data-tex="' + attr(item.tex) + '" data-display="' + (item.display ? '1' : '0') + '">' +
          escape(item.tex) + '</span>';
      });
    }
    function inline(value) {
      var code = [];
      value = value.replace(/`([^`]+)`/g, function (_, text) { code.push(text); return '\u0003' + (code.length - 1) + '\u0003'; });
      value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (match, alt, url) {
        if (!/^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(url)) return match;
        return '<img src="' + attr(url) + '" alt="' + attr(alt) + '" loading="lazy" decoding="async" />';
      });
      value = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, url) {
        if (!/^(https?:\/\/|mailto:)/i.test(url)) return match;
        return '<a href="' + attr(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      });
      value = value.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
      value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      value = value.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      value = value.replace(/==([^=]+)==/g, '<mark>$1</mark>');
      value = value.replace(/&lt;br\s*\/?&gt;/gi, '<br />');
      value = value.replace(/( {2,}|\\+)\n/g, function (_, marker) {
        if (marker.charAt(0) === ' ') return '<br />';
        return marker.length % 2 ? marker.slice(0, -1) + '<br />' : marker + ' ';
      }).replace(/\n/g, ' ');
      return value.replace(/\u0003(\d+)\u0003/g, function (_, index) { return '<code>' + code[Number(index)] + '</code>'; });
    }
    return { inline: inline, protectMath: protectMath, restoreMath: restoreMath };
  }

  function render(source, mapped) {
    var inline = createInline();
    var raw = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
    var safe = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var segments = safe.split('```'), output = [], line = 1;

    function tableRow(row) { return row.replace(/^\||\|$/g, '').split('|'); }
    function listItem(item, itemLine) {
      var task = item.match(/^\[([ xX])\]\s+([\s\S]*)$/);
      if (task) return '<li' + sourceAttr(itemLine) + ' class="md-task"><input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + ' />' + inline.inline(task[2]) + '</li>';
      return '<li' + sourceAttr(itemLine) + '>' + inline.inline(item) + '</li>';
    }
    function block(text, firstLine) {
      var lines = text.split('\n'), out = [], list = null, ordered = false, para = [];
      function flushParagraph() {
        if (!para.length) return;
        var joined = para.map(function (item) { return item.text; }).join('\n');
        var content = para.map(function (item, index) {
          var next = index < para.length - 1;
          var rendered = inline.inline(item.text + (next ? '\n' : ''));
          return '<span' + sourceAttr(item.line) + '>' + rendered + '</span>';
        }).join('');
        if (firstLine == null) content = inline.inline(joined);
        out.push('<p' + sourceAttr(para[0].line, para[para.length - 1].line) + '>' + content + '</p>');
        para = [];
      }
      function flushList() {
        if (!list) return;
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + sourceAttr(list[0].line, list[list.length - 1].line) + '>' + list.map(function (item) { return listItem(item.text, item.line); }).join('') + '</' + tag + '>');
        list = null;
      }
      for (var i = 0; i < lines.length; i++) {
        var rawLine = lines[i].replace(/^\s+/, ''), trimmed = rawLine.trim(), currentLine = firstLine == null ? null : firstLine + i;
        if (!trimmed) { flushParagraph(); flushList(); continue; }
        if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
          flushParagraph(); flushList();
          var head = tableRow(trimmed), rows = []; i += 2;
          while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(tableRow(lines[i].trim())); i++; }
          i--;
          var th = head.map(function (cell) { return '<th>' + inline.inline(cell.trim()) + '</th>'; }).join('');
          var body = rows.map(function (row, index) { return '<tr' + sourceAttr(currentLine == null ? null : currentLine + index + 2) + '>' + head.map(function (_, col) { return '<td>' + inline.inline((row[col] || '').trim()) + '</td>'; }).join('') + '</tr>'; }).join('');
          out.push('<table' + sourceAttr(currentLine, currentLine == null ? null : currentLine + rows.length + 1) + '><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table>');
          continue;
        }
        var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) { flushParagraph(); flushList(); var level = heading[1].length; out.push('<h' + level + sourceAttr(currentLine) + '>' + inline.inline(heading[2]) + '</h' + level + '>'); continue; }
        if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) { flushParagraph(); flushList(); out.push('<hr' + sourceAttr(currentLine) + ' />'); continue; }
        if (/^(?:>|&gt;)\s?/.test(trimmed)) {
          flushParagraph(); flushList(); var quote = [], qStart = currentLine;
          while (i < lines.length && /^(?:>|&gt;)\s?/.test(lines[i].trim())) { quote.push(inline.inline(lines[i].replace(/^\s+/, '').replace(/^(?:>|&gt;)\s?/, ''))); i++; }
          i--; out.push('<blockquote' + sourceAttr(qStart, currentLine == null ? null : firstLine + i) + '>' + quote.join('<br />') + '</blockquote>'); continue;
        }
        var unordered = trimmed.match(/^[-*+]\s+(.+)$/), numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (unordered || numbered) {
          var nextOrdered = !!numbered;
          flushParagraph();
          if (!list || ordered !== nextOrdered) { flushList(); list = []; ordered = nextOrdered; }
          list.push({ text: (unordered || numbered)[1], line: currentLine }); continue;
        }
        flushList(); para.push({ text: rawLine, line: currentLine });
      }
      flushParagraph(); flushList(); return out.join('');
    }

    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i], count = segment.split('\n').length - 1;
      if (i % 2 === 1) {
        var codeLines = segment.split('\n'), language = codeLines.shift() || '', codeStart = line + (language ? 1 : 0);
        var code = codeLines.length ? codeLines.join('\n') : language;
        var codeHtml = mapped ? code.split('\n').map(function (value, index) { return '<span class="md-source-code"' + sourceAttr(codeStart + index) + '>' + value + '</span>'; }).join('') : code;
        output.push('<pre' + sourceAttr(mapped ? line : null, mapped ? line + count : null) + '><code' + (language ? ' data-language="' + attr(language) + '"' : '') + '>' + codeHtml + '</code></pre>');
      } else {
        var protectedSegment = inline.protectMath(segment, mapped ? line : null);
        output.push(inline.restoreMath(block(protectedSegment, mapped ? line : null)));
      }
      line += count;
    }
    return output.join('');
  }

  function hydrateMath(root, katex) {
    if (!root || !katex || typeof katex.render !== 'function') return;
    root.querySelectorAll('.math-pending').forEach(function (node) {
      try {
        katex.render(node.getAttribute('data-tex') || '', node, {
          displayMode: node.getAttribute('data-display') === '1',
          throwOnError: false, strict: false, trust: false
        });
        node.className = node.getAttribute('data-display') === '1' ? 'math-display' : 'math-inline';
      } catch (error) { /* keep the escaped fallback text */ }
    });
  }

  global.MingLongMarkdownRenderer = { render: render, hydrateMath: hydrateMath };
})(window);
