(function () {
  'use strict';
  async function read(file) {
    if (!file || !/\.(md|markdown)$/i.test(file.name)) throw new Error('请选择 .md 或 .markdown 文件');
    if (file.size > 200 * 1024) throw new Error('Markdown 文件最多 200 KB');
    var content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch (e) { throw new Error('请将文档保存为 UTF-8 编码后上传'); }
    content = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!content.trim() || content.includes('\0')) throw new Error('文档为空或不是有效的文本文件');
    if (content.length > 50000) throw new Error('正文最多 50000 字，请拆分后上传');
    var heading = /^#\s+(.+)$/m.exec(content);
    var title = (heading ? heading[1].replace(/[\*_`]/g, '').replace(/\s+#+\s*$/, '') : file.name.replace(/\.(md|markdown)$/i, '')).trim().slice(0, 60);
    var summary = content.split('\n').find(function (line) { return line.trim() && !/^(#|```|~~~|\s*[-*] )/.test(line); });
    return { title: title || '导入的文档', content: content, text: (summary || '由 Markdown 文件导入').slice(0, 160) };
  }
  function controls() {
    return '<div class="md-file-tools"><button type="button" class="btn btn-soft btn-small" data-md-import>导入 Markdown 文件</button><input class="md-document-file" type="file" accept=".md,.markdown,text/markdown" hidden><select class="md-import-mode" aria-label="文档导入方式"><option value="replace">替换正文</option><option value="append">追加正文</option></select><span class="field-hint">UTF-8 · 最多 200 KB / 50000 字 · 保存前可预览</span></div>';
  }
  function wire(root, toast) {
    root.querySelectorAll('.md-box').forEach(function (box) {
      var input = box.querySelector('.md-document-file'), button = box.querySelector('[data-md-import]');
      if (!input || !button) return;
      button.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', async function () {
        var file = input.files[0]; input.value = ''; if (!file) return;
        var tx = box.querySelector('.md-input');
        try {
          var doc = await read(file);
          if (!document.contains(tx)) return;
          var value = box.querySelector('.md-import-mode').value === 'append' && tx.value.trim() ? tx.value + '\n\n' + doc.content : doc.content;
          if (value.length > tx.maxLength) throw new Error('导入后正文超过字数上限');
          tx.value = value; tx.dispatchEvent(new Event('input', { bubbles: true }));
          ['title', 'text'].forEach(function (key) { var field = root.querySelector('[name="' + key + '"]'); if (field && !field.value.trim()) field.value = doc[key]; });
          box.querySelector('[data-action="md-tab-prev"]').click();
          toast('文件已导入，请预览后保存');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }
  window.MingLongMarkdownImport = { read: read, controls: controls, wire: wire };
})();
