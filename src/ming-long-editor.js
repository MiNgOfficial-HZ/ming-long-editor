/* Ming Long Editor · standalone mount API */
(function (global) {
  'use strict';
  var core = global.MingLongEditorCore;
  var importer = global.MingLongMarkdownImport;
  var renderer = global.MingLongMarkdownRenderer;
  if (!core || !importer || !renderer) throw new Error('Ming Long Editor requires the core, importer and renderer scripts first');

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function emptyResult(key) { return Promise.resolve({ ok: true, json: key === 'pdf' ? { pdfs: [] } : { images: [] } }); }
  function unavailable(label) {
    return Promise.resolve({ ok: false, json: { error: label + '尚未配置，请传入 options.media 适配器' } });
  }
  function fileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve({ data: String(reader.result || '').split(',').pop(), size: file.size, type: file.type || '' }); };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsDataURL(file);
    });
  }
  function helpHtml() {
    var rows = [
      ['# 标题', '一级标题'], ['## 标题', '二级标题'], ['**加粗**', '加粗'], ['==高亮==', '文字高亮'],
      ['> 引用', '引用'], ['- 列表', '无序列表'], ['- [ ] 待办', '任务清单'], ['[文字](链接)', '链接'],
      ['![图](链接)', '图片'], ['两个空格 ↵', '强制换行'], ['<br>', 'HTML 换行'], ['$$公式$$', '公式']
    ];
    return '<aside class="md-help" aria-label="Markdown 符号速查"><div class="md-help-head"><span>📖 Markdown 速查</span><small>点一下插入</small></div>' +
      rows.map(function (row) {
        return '<button type="button" class="md-sym" data-ml-insert="' + escape(row[0]) + '" title="点击插入"><code>' + escape(row[0]) + '</code><span>' + escape(row[1]) + '</span></button>';
      }).join('') + '<p class="md-help-note">支持 Markdown、图片、PDF 附件与 KaTeX（可选）。</p></aside>';
  }
  function controlsHtml(options) {
    var value = options.value || '';
    var placeholder = options.placeholder || '# 从这里开始写…';
    return '<div class="md-wrap"><div class="md-box">' +
      '<div class="md-tabs"><button type="button" class="m-tab on" data-action="md-tab-edit">✏️ 编辑</button><button type="button" class="m-tab" data-action="md-tab-prev">👁️ 预览</button><button type="button" class="m-tab md-fullscreen-btn" data-action="md-fullscreen" aria-label="全屏编辑" aria-pressed="false" title="全屏编辑（Esc 退出）">⛶ 全屏</button><span class="md-position">第 1 行</span></div>' +
      importer.controls() + '<textarea class="md-input" rows="14" maxlength="' + (options.maxLength || 50000) + '" placeholder="' + escape(placeholder) + '">' + escape(value) + '</textarea>' +
      '<div class="md-preview md-body" tabindex="0" aria-label="Markdown 预览" hidden></div>' +
      '<input type="hidden" data-md-pdf-field value="">' + core.html() +
      '</div>' + helpHtml() + '</div>';
  }

  function mount(target, options) {
    options = options || {};
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('MingLongEditor.mount 找不到挂载节点');
    var media = options.media || {};
    var toast = options.toast || function (message, kind) {
      if (typeof options.onToast === 'function') options.onToast(message, kind || 'info');
    };
    var root = document.createElement('div');
    root.className = 'ming-long-editor';
    root.innerHTML = controlsHtml(options);
    host.appendChild(root);
    var textarea = root.querySelector('.md-input');
    var ctx = {
      render: options.render || renderer.render,
      math: options.math || function (node) { renderer.hydrateMath(node, options.katex || global.katex); },
      prepare: options.prepare || function () {},
      toast: toast,
      compress: options.compressImage || media.compressImage || fileAsBase64,
      upload: media.uploadImage || function () { return unavailable('图片上传'); },
      list: media.listImages || function () { return emptyResult('image'); },
      remove: media.deleteImage || function () { return unavailable('图片删除'); },
      pdfUpload: media.uploadPdf || function () { return unavailable('PDF 上传'); },
      pdfList: media.listPdfs || function () { return emptyResult('pdf'); },
      pdfRemove: media.deletePdf || function () { return unavailable('PDF 删除'); }
    };
    core.wire(root, ctx);
    importer.wire(root, toast);
    textarea.addEventListener('input', function () { if (typeof options.onChange === 'function') options.onChange(textarea.value); });
    root.addEventListener('click', function (event) {
      var actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        var action = actionButton.getAttribute('data-action');
        if (action === 'md-tab-edit') { core.toggle(actionButton, 'edit'); return; }
        if (action === 'md-tab-prev') { core.toggle(actionButton, 'prev'); return; }
        if (action === 'md-fullscreen') { core.fullscreen(actionButton); return; }
      }
      var insert = event.target.closest('[data-ml-insert]');
      if (!insert) return;
      var text = insert.getAttribute('data-ml-insert') || '';
      var examples = { '# 标题': '# ', '## 标题': '## ', '**加粗**': '**重点**', '==高亮==': '==重点==', '> 引用': '> ', '- 列表': '- ', '- [ ] 待办': '- [ ] ', '[文字](链接)': '[文字](https://)', '![图](链接)': '![图](https://)', '两个空格 ↵': '  \n', '<br>': '<br>\n', '$$公式$$': '$$\n公式\n$$' };
      var value = examples[text] || text, start = textarea.selectionStart, end = textarea.selectionEnd;
      textarea.focus(); textarea.setRangeText(value, start, end, 'end'); textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    var initialMode = options.mode === 'preview' ? 'prev' : 'edit';
    if (initialMode === 'prev') core.toggle(root.querySelector('[data-action="md-tab-prev"]'), 'prev');
    return {
      element: root,
      getValue: function () { return textarea.value; },
      setValue: function (value) { textarea.value = String(value == null ? '' : value); textarea.dispatchEvent(new Event('input', { bubbles: true })); },
      focus: function () { textarea.focus(); },
      destroy: function () { core.destroy(root); root.remove(); },
      preview: function () { core.toggle(root.querySelector('[data-action="md-tab-prev"]'), 'prev'); },
      edit: function () { core.toggle(root.querySelector('[data-action="md-tab-edit"]'), 'edit'); },
      fullscreen: function () { core.fullscreen(root.querySelector('[data-action="md-fullscreen"]')); }
    };
  }

  global.MingLongEditor = { mount: mount, render: renderer.render, readMarkdown: importer.read };
})(window);
