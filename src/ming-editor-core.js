(function () {
  'use strict';
  var activeFullscreen = null;
  function setFullscreenButton(box, active) {
    var btn = box.querySelector('[data-action="md-fullscreen"]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-label', active ? '退出全屏编辑' : '全屏编辑');
    btn.setAttribute('title', active ? '退出全屏编辑（Esc）' : '全屏编辑（Esc 退出）');
    btn.textContent = active ? '⛶ 退出全屏' : '⛶ 全屏';
  }
  function exitFullscreen(box) {
    if (!box || !box.classList.contains('md-is-fullscreen')) return;
    box.classList.remove('md-is-fullscreen');
    var wrap = box.closest('.md-wrap');
    if (wrap) wrap.classList.remove('md-wrap-is-fullscreen');
    if (activeFullscreen === box) activeFullscreen = null;
    if (!document.querySelector('.md-box.md-is-fullscreen')) document.body.classList.remove('md-fullscreen-open');
    setFullscreenButton(box, false);
    var tx = box.querySelector('.md-input');
    if (tx && document.contains(tx)) tx.focus({ preventScroll: true });
  }
  function enterFullscreen(box) {
    if (!box) return;
    if (activeFullscreen && activeFullscreen !== box) exitFullscreen(activeFullscreen);
    var preview = box.querySelector('.md-preview');
    var editTab = box.querySelector('[data-action="md-tab-edit"]');
    // 全屏编辑始终从源码开始；如果当前停在预览，会先把当前位置同步回编辑器。
    if (preview && !preview.hidden && editTab) toggle(editTab, 'edit');
    box.classList.add('md-is-fullscreen');
    var wrap = box.closest('.md-wrap');
    if (wrap) wrap.classList.add('md-wrap-is-fullscreen');
    document.body.classList.add('md-fullscreen-open');
    activeFullscreen = box;
    setFullscreenButton(box, true);
    var tx = box.querySelector('.md-input');
    if (tx) setTimeout(function () { tx.focus({ preventScroll: true }); }, 0);
  }
  function toggleFullscreen(btn) {
    var box = btn && btn.closest('.md-box');
    if (!box) return;
    if (box.classList.contains('md-is-fullscreen')) exitFullscreen(box);
    else enterFullscreen(box);
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && activeFullscreen) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      exitFullscreen(activeFullscreen);
    }
  });
  function escape(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function imageMarkdown(name, url) { return '![' + String(name || '图片').replace(/[\[\]\r\n\\]/g, '') + '](' + url + ')'; }
  function html() {
    return '<details class="md-media"><summary>图床 <span>上传后手动插入正文</span></summary>' +
      '<div class="md-media-tools"><button type="button" class="btn btn-soft btn-small" data-md-action="choose">上传图片</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-md-action="refresh">我的图片</button>' +
      '<input class="md-media-file" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden>' +
      '<span class="field-hint">自动压缩 · 图片链接可重复使用</span></div>' +
      '<div class="md-upload-status" role="status" aria-live="polite"></div><div class="md-media-list"></div></details>' +
      '<details class="md-pdf"><summary>PDF 附件 <span>上传后设为本文阅读附件</span></summary>' +
      '<div class="md-media-tools"><button type="button" class="btn btn-soft btn-small" data-md-pdf-action="choose">上传 PDF</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-md-pdf-action="refresh">我的 PDF</button>' +
      '<input class="md-pdf-file" type="file" accept="application/pdf,.pdf" hidden>' +
      '<span class="field-hint">单个 PDF 建议不超过 20MB · 阅读时自动隐藏文章目录</span></div>' +
      '<div class="md-pdf-status" role="status" aria-live="polite"></div><div class="md-pdf-list"></div></details>';
  }
  function wire(root, ctx) {
    root.querySelectorAll('.md-box').forEach(function (box) {
      var tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview');
      var panel = box.querySelector('.md-media'), list = box.querySelector('.md-media-list');
      var input = box.querySelector('.md-media-file'), status = box.querySelector('.md-upload-status');
      var pdfPanel = box.querySelector('.md-pdf'), pdfList = box.querySelector('.md-pdf-list');
      var pdfInput = box.querySelector('.md-pdf-file'), pdfStatus = box.querySelector('.md-pdf-status');
      var pdfField = box.querySelector('[data-md-pdf-field]');
      var state = { selection: 0, end: 0, pending: [], images: [], loaded: false, loading: false, confirmDelete: '', deleting: '', deleted: new Set(), pdfPending: [], pdfs: [], pdfLoaded: false, pdfLoading: false, pdfDeleting: '' };
      box._mdState = state; box._mdCtx = ctx;
      function remember() {
        state.selection = tx.selectionStart; state.end = tx.selectionEnd;
        var line = tx.value.slice(0, state.selection).split('\n').length;
        box.querySelector('.md-position').textContent = '第 ' + line + ' 行';
      }
      ['input','keyup','click','select','blur'].forEach(function (event) { tx.addEventListener(event, remember); });
      px.addEventListener('scroll', function () {
        if (px.hidden || Math.abs(px.scrollTop - (box._mdPreviewTop || 0)) < 1) return;
        var anchor = previewAnchor(px);
        if (anchor) {
          px.dataset.activeLine = String(anchor.line);
          box.querySelector('.md-position').textContent = '第 ' + anchor.line + ' 行';
        }
      }, { passive: true });
      remember();
      function insert(text) {
        if (!px.hidden) toggle(box.querySelector('[data-action="md-tab-edit"]'), 'edit');
        tx.focus(); tx.setSelectionRange(state.selection, state.end);
        if (tx.value.length - (state.end - state.selection) + text.length > tx.maxLength) { ctx.toast('正文已达到字数上限', 'info'); return false; }
        tx.setRangeText(text, state.selection, state.end, 'end'); remember();
        tx.dispatchEvent(new Event('input', { bubbles: true })); return true;
      }
      function paintStatus() {
        status.innerHTML = state.pending.map(function (it) {
          return '<div class="md-upload-row"><span>' + escape(it.name) + ' · ' +
            (it.error ? escape(it.error) : it.progress) + '</span>' +
            (it.error ? '<button type="button" data-md-action="retry" data-upload-id="' + it.id + '">重试</button><button type="button" data-md-action="cancel" data-upload-id="' + it.id + '">取消</button>' : '') + '</div>';
        }).join('');
      }
      function paintLibrary() {
        list.innerHTML = state.images.length ? state.images.map(function (it, i) {
          var busy = state.deleting === it.url, disabled = busy ? ' disabled' : '';
          return '<article class="md-media-card"><img src="' + escape(it.url) + '" alt="' + escape(it.label || '图床图片') + '" loading="lazy">' +
            '<div class="md-media-meta">' + escape(it.createdAt ? new Date(it.createdAt).toLocaleDateString('zh-CN') : '刚刚上传') + '</div>' +
            '<div class="md-media-actions"><button type="button" data-md-action="insert" data-image-index="' + i + '"' + disabled + '>插入</button>' +
            '<button type="button" data-md-action="link" data-image-index="' + i + '"' + disabled + '>链接</button>' +
            '<button type="button" data-md-action="markdown" data-image-index="' + i + '"' + disabled + '>Markdown</button>' +
            '<button type="button" class="md-media-delete" data-md-action="delete" data-image-index="' + i + '"' + (state.deleting ? ' disabled' : '') + '>删除</button></div>' +
            (state.confirmDelete === it.url ? '<div class="md-media-confirm"><p>删除后，已引用这张图片的文章会受影响。</p>' +
              '<button type="button" class="md-media-delete" data-md-action="delete-confirm" data-image-index="' + i + '"' + (state.deleting ? ' disabled' : '') + '>' + (busy ? '删除中…' : '确认删除') + '</button>' +
              '<button type="button" data-md-action="delete-cancel" data-image-index="' + i + '"' + disabled + '>取消</button></div>' : '') + '</article>';
        }).join('') : '<p class="field-hint">图片库还是空的。上传后的图片会保存在这里。</p>';
        if (ctx.prepare) ctx.prepare(list);
      }
      function paintPdfStatus() {
        if (!pdfStatus) return;
        pdfStatus.innerHTML = state.pdfPending.map(function (it) {
          return '<div class="md-upload-row"><span>' + escape(it.name) + ' · ' + (it.error ? escape(it.error) : it.progress) + '</span>' +
            (it.error ? '<button type="button" data-md-pdf-action="retry" data-pdf-upload-id="' + it.id + '">重试</button><button type="button" data-md-pdf-action="cancel" data-pdf-upload-id="' + it.id + '">取消</button>' : '') + '</div>';
        }).join('');
      }
      function setPdf(asset) {
        if (!pdfField) return;
        pdfField.value = asset ? JSON.stringify(asset) : '';
        state.pdfs = state.pdfs.map(function (it) { it.selected = !!asset && it.path === asset.path; return it; });
        paintPdfLibrary();
        if (asset && ctx.toast) ctx.toast('已设为本文 PDF 阅读附件');
      }
      function paintPdfLibrary() {
        if (!pdfList) return;
        pdfList.innerHTML = state.pdfs.length ? state.pdfs.map(function (it, i) {
          var selected = it.selected || (pdfField && pdfField.value && pdfField.value.indexOf(String(it.path || '')) >= 0);
          var busy = state.pdfDeleting === it.name;
          return '<article class="md-pdf-card' + (selected ? ' is-selected' : '') + '"><div class="md-pdf-icon">PDF</div><div class="md-pdf-meta"><strong>' + escape(it.label || it.name || 'PDF 文档') + '</strong><span>' + escape(it.size ? (Math.max(1, Math.round(it.size / 1024)) + ' KB') : 'PDF 文档') + ' · ' + escape(it.createdAt ? new Date(it.createdAt).toLocaleDateString('zh-CN') : '刚刚上传') + '</span></div>' +
            '<div class="md-media-actions"><button type="button" data-md-pdf-action="use" data-pdf-index="' + i + '"' + (busy ? ' disabled' : '') + '>' + (selected ? '本文已选' : '设为本文') + '</button><button type="button" class="md-media-delete" data-md-pdf-action="delete" data-pdf-index="' + i + '"' + (busy ? ' disabled' : '') + '>' + (busy ? '删除中…' : '删除') + '</button></div></article>';
        }).join('') : '<p class="field-hint">还没有 PDF。上传后可设为本文附件，阅读时会使用浏览器 PDF 阅读器。</p>';
      }
      function loadPdfLibrary() {
        if (!ctx.pdfList || state.pdfLoading) return;
        state.pdfLoading = true; if (pdfList) pdfList.textContent = '正在读取 PDF…';
        ctx.pdfList().then(function (res) {
          if (!res.ok) throw new Error(res.json.error || '读取失败，请重试');
          state.pdfs = res.json.pdfs || [];
          state.pdfLoaded = true; paintPdfLibrary();
        }).catch(function (err) { if (pdfList) pdfList.textContent = err.message; }).finally(function () { state.pdfLoading = false; });
      }
      async function runPdf(it) {
        it.error = ''; it.progress = '上传中…'; paintPdfStatus();
        try {
          var data = await fileToData(it.file);
          var res = await ctx.pdfUpload({ data: data, name: it.name }, function (pct) { it.progress = '上传中 ' + pct + '%'; paintPdfStatus(); });
          var raw = res.json && ((res.json.pdfs && res.json.pdfs[0]) || (res.json.url && { url: res.json.url, name: res.json.name, path: res.json.path, size: it.file.size, label: it.name, createdAt: Date.now() }));
          if (!res.ok || !raw || !raw.url && !raw.path) throw new Error((res.json && res.json.error) || 'PDF 上传失败，请重试');
          raw.label = raw.label || it.name; raw.size = raw.size || it.file.size; raw.createdAt = raw.createdAt || Date.now();
          state.pdfs = [raw].concat(state.pdfs.filter(function (x) { return x.path !== raw.path; }));
          setPdf(raw); state.pdfPending = state.pdfPending.filter(function (x) { return x !== it; }); paintPdfStatus(); paintPdfLibrary();
        } catch (err) { it.error = err.message || 'PDF 上传失败，请重试'; paintPdfStatus(); }
      }
      function fileToData(file) {
        return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '').split(',').pop()); }; reader.onerror = function () { reject(new Error('PDF 读取失败')); }; reader.readAsDataURL(file); });
      }
      function queuePdf(files) {
        if (!pdfPanel || !ctx.pdfUpload) return;
        pdfPanel.open = true;
        var file = Array.from(files || []).find(function (f) { return /application\/pdf/i.test(f.type) || /\.pdf$/i.test(f.name); });
        if (!file) { ctx.toast('请选择 PDF 文件', 'info'); return; }
        if (file.size > 20 * 1024 * 1024) { ctx.toast('PDF 过大，单个文件不能超过 20MB', 'info'); return; }
        var it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), file: file, name: file.name || '文档.pdf', progress: '等待上传…' };
        state.pdfPending.push(it); paintPdfStatus(); runPdf(it);
      }
      function loadLibrary() {
        if (state.loading) return;
        var initial = state.images.slice();
        state.loading = true; list.textContent = '正在读取图片库…';
        ctx.list().then(function (res) {
          if (!res.ok) throw new Error(res.json.error || '读取失败，请重试');
          var fresh = res.json.images || [];
          var added = state.images.filter(function (x) { return !initial.some(function (y) { return y.url === x.url; }) && !fresh.some(function (y) { return y.url === x.url; }); });
          state.images = added.concat(fresh).filter(function (x) { return !state.deleted.has(x.url); });
          state.loaded = true; paintLibrary();
        }).catch(function (err) { list.textContent = err.message; }).finally(function () { state.loading = false; });
      }
      async function remove(asset) {
        if (state.deleting) return;
        state.deleting = asset.url; paintLibrary();
        try {
          var res = await ctx.remove(asset);
          if (!res.ok) throw new Error(res.json.error || '删除失败，请重试');
          state.deleted.add(asset.url);
          state.images = state.images.filter(function (x) { return x.url !== asset.url; });
          state.confirmDelete = ''; ctx.toast('图片已删除');
        } catch (err) { ctx.toast(err.message || '删除失败，请重试', 'error'); }
        finally { state.deleting = ''; paintLibrary(); }
      }
      async function run(it) {
        it.error = ''; it.progress = '压缩中…'; paintStatus();
        try {
          var compressed = it.compressed || await ctx.compress(it.file); it.compressed = compressed;
          it.progress = '上传中…'; paintStatus();
          var res = await ctx.upload({ data: compressed.data, name: it.name }, function (pct) {
            it.progress = '上传中 ' + pct + '%'; paintStatus();
          });
          if (!res.ok || !res.json.url) throw new Error(res.json.error || '上传失败，请重试');
          var asset = { url: res.json.url, name: res.json.name, label: it.name, createdAt: Date.now() };
          if (!state.images.some(function (x) { return x.url === asset.url; })) state.images.unshift(asset);
          if (document.contains(tx)) {
            ctx.toast('图片已上传到图床，点击「插入」加入正文');
          }
          state.pending = state.pending.filter(function (x) { return x !== it; });
          paintStatus(); paintLibrary();
        } catch (err) { it.error = err.message || '上传失败，请重试'; paintStatus(); }
      }
      async function queue(files) {
        panel.open = true;
        var chosen = Array.from(files || []).slice(0, 6);
        if (files.length > 6) ctx.toast('一次最多上传 6 张图片', 'info');
        for (var file of chosen) {
          if (!/^image\//i.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) { ctx.toast('请选择图片文件', 'info'); continue; }
          var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var it = { id: id, file: file, name: file.name || '图片', progress: '等待上传…' };
          state.pending.push(it); paintStatus();
        }
        // 上传只进入图床；正文由用户点击「插入」时修改。
        for (var pending of state.pending.slice()) { if (!pending.started) { pending.started = true; await run(pending); } }
      }
      panel.addEventListener('toggle', function () { if (panel.open && !state.loaded) loadLibrary(); });
      input.addEventListener('change', function () { var files = Array.from(input.files || []); input.value = ''; queue(files); });
      if (pdfPanel && pdfInput) {
        pdfPanel.addEventListener('toggle', function () { if (pdfPanel.open && !state.pdfLoaded) loadPdfLibrary(); });
        pdfInput.addEventListener('change', function () { var files = Array.from(pdfInput.files || []); pdfInput.value = ''; queuePdf(files); });
      }
      box.addEventListener('paste', function (event) {
        var files = event.clipboardData && event.clipboardData.files;
        if (files && files.length) { event.preventDefault(); queue(files); }
      });
      box.addEventListener('dragover', function (event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); box.classList.add('md-dragging'); }
      });
      box.addEventListener('dragleave', function () { box.classList.remove('md-dragging'); });
      box.addEventListener('drop', function (event) {
        box.classList.remove('md-dragging');
        if (event.dataTransfer && event.dataTransfer.files.length) { event.preventDefault(); queue(event.dataTransfer.files); }
      });
      box.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-md-action]');
        var pdfBtn = event.target.closest('[data-md-pdf-action]');
        if (!btn && !pdfBtn) return;
        if (!btn) {
          var pdfActionOnly = pdfBtn.dataset.mdPdfAction;
          var pendingOnly = state.pdfPending.find(function (x) { return x.id === pdfBtn.dataset.pdfUploadId; });
          if (pdfActionOnly === 'choose' && pdfInput) { pdfInput.click(); return; }
          if (pdfActionOnly === 'refresh') { loadPdfLibrary(); return; }
          if (pdfActionOnly === 'retry' && pendingOnly && pendingOnly.error) { runPdf(pendingOnly); return; }
          if (pdfActionOnly === 'cancel' && pendingOnly && pendingOnly.error) { state.pdfPending = state.pdfPending.filter(function (x) { return x !== pendingOnly; }); paintPdfStatus(); return; }
          var pdfAssetOnly = state.pdfs[Number(pdfBtn.dataset.pdfIndex)];
          if (pdfAssetOnly && pdfActionOnly === 'use') { setPdf(pdfAssetOnly); return; }
          if (pdfAssetOnly && pdfActionOnly === 'delete' && ctx.pdfRemove && !state.pdfDeleting) {
            state.pdfDeleting = pdfAssetOnly.name; paintPdfLibrary();
            ctx.pdfRemove(pdfAssetOnly).then(function (res) { if (!res.ok) throw new Error(res.json.error || '删除失败'); if (pdfField && pdfField.value.indexOf(String(pdfAssetOnly.path || '')) >= 0) setPdf(null); state.pdfs = state.pdfs.filter(function (x) { return x.name !== pdfAssetOnly.name; }); ctx.toast('PDF 已删除'); }).catch(function (err) { ctx.toast(err.message || '删除失败', 'error'); }).finally(function () { state.pdfDeleting = ''; paintPdfLibrary(); });
            return;
          }
        }
        if (!btn) return;
        var action = btn.dataset.mdAction, it = state.pending.find(function (x) { return x.id === btn.dataset.uploadId; });
        if (action === 'choose') input.click();
        if (action === 'refresh') loadLibrary();
        if (action === 'retry' && it && it.error) run(it);
        if (action === 'cancel' && it && it.error) { state.pending = state.pending.filter(function (x) { return x !== it; }); paintStatus(); }
        var asset = state.images[Number(btn.dataset.imageIndex)];
        if (!asset) return;
        if (action === 'delete' && !state.deleting) { state.confirmDelete = asset.url; paintLibrary(); }
        if (action === 'delete-cancel' && !state.deleting) { state.confirmDelete = ''; paintLibrary(); }
        if (action === 'delete-confirm' && state.confirmDelete === asset.url) remove(asset);
        if (action === 'insert') insert('\n' + imageMarkdown(asset.label || '图片', asset.url) + '\n');
        if (action === 'link' || action === 'markdown') {
          var text = action === 'link' ? asset.url : imageMarkdown(asset.label || '图片', asset.url);
          navigator.clipboard.writeText(text).then(function () { ctx.toast('已复制'); }).catch(function () { ctx.toast('复制失败，请使用「插入」按钮', 'info'); });
        }
        pdfBtn = event.target.closest('[data-md-pdf-action]');
        if (!pdfBtn) return;
        var pdfAction = pdfBtn.dataset.mdPdfAction;
        var pendingPdf = state.pdfPending.find(function (x) { return x.id === pdfBtn.dataset.pdfUploadId; });
        if (pdfAction === 'choose' && pdfInput) { pdfInput.click(); return; }
        if (pdfAction === 'refresh') { loadPdfLibrary(); return; }
        if (pdfAction === 'retry' && pendingPdf && pendingPdf.error) { runPdf(pendingPdf); return; }
        if (pdfAction === 'cancel' && pendingPdf && pendingPdf.error) { state.pdfPending = state.pdfPending.filter(function (x) { return x !== pendingPdf; }); paintPdfStatus(); return; }
        var pdfAsset = state.pdfs[Number(pdfBtn.dataset.pdfIndex)];
        if (!pdfAsset) return;
        if (pdfAction === 'use') { setPdf(pdfAsset); return; }
        if (pdfAction === 'delete' && ctx.pdfRemove && !state.pdfDeleting) {
          state.pdfDeleting = pdfAsset.name; paintPdfLibrary();
          ctx.pdfRemove(pdfAsset).then(function (res) { if (!res.ok) throw new Error(res.json.error || '删除失败'); if (pdfField && pdfField.value.indexOf(String(pdfAsset.path || '')) >= 0) setPdf(null); state.pdfs = state.pdfs.filter(function (x) { return x.name !== pdfAsset.name; }); ctx.toast('PDF 已删除'); }).catch(function (err) { ctx.toast(err.message || '删除失败', 'error'); }).finally(function () { state.pdfDeleting = ''; paintPdfLibrary(); });
        }
      });
    });
  }
  function renderPreview(box) {
    var tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview'), ctx = box._mdCtx;
    px.innerHTML = ctx.render(tx.value, true);
    // 编辑器里的图片立即加载，避免视口外的懒加载图片改变目标位置。
    px.querySelectorAll('img').forEach(function (img) { img.loading = 'eager'; });
    ctx.math(px);
  }
  function stopTracking(box) { if (box._mdStop) { box._mdStop(); box._mdStop = null; } }
  function previewAnchor(px) {
    var viewport = px.getBoundingClientRect(), baseline = viewport.top + 18;
    var nodes = Array.from(px.querySelectorAll('[data-source-line]')).filter(function (node) {
      return !node.querySelector('[data-source-line]') ||
        (node.tagName === 'SPAN' && node.dataset.sourceLine === node.dataset.sourceEnd);
    });
    var selected = null, distance = Infinity;
    nodes.forEach(function (node) {
      Array.from(node.getClientRects()).forEach(function (rect) {
        if (!rect.height || rect.bottom <= baseline || rect.top >= viewport.bottom) return;
        var delta = Math.max(0, rect.top - baseline);
        if (delta < distance) {
          distance = delta;
          selected = { line: Number(node.dataset.sourceLine), offset: Math.max(14, rect.top - viewport.top) };
          var x = rect.left + 1, y = Math.min(rect.bottom - 1, viewport.bottom - 2, Math.max(baseline, rect.top) + rect.height / 2);
          var caret = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
          var range = !caret && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
          var textNode = caret ? caret.offsetNode : range && range.startContainer;
          var textOffset = caret ? caret.offset : range && range.startOffset;
          if (textNode && textNode.nodeType === 3 && node.contains(textNode)) {
            var prefix = document.createRange(); prefix.setStart(node, 0); prefix.setEnd(textNode, textOffset);
            selected.fragment = textNode.nodeValue; selected.textOffset = textOffset;
            selected.progress = prefix.toString().length / Math.max(1, node.textContent.length);
          }
        }
      });
    });
    if (!selected && nodes.length) {
      var last = nodes[nodes.length - 1];
      selected = { line: Number(last.dataset.sourceEnd || last.dataset.sourceLine), offset: 18 };
    }
    return selected;
  }
  function lineStart(text, line) {
    var at = 0;
    for (var n = 1; n < line; n++) {
      var next = text.indexOf('\n', at);
      if (next < 0) return text.length;
      at = next + 1;
    }
    return at;
  }
  function sourcePosition(text, anchor) {
    var start = lineStart(text, anchor.line), end = text.indexOf('\n', start);
    var source = text.slice(start, end < 0 ? text.length : end);
    if (!anchor.fragment) return start;
    var desired = source.length * anchor.progress - anchor.textOffset, best = -1, distance = Infinity;
    for (var at = source.indexOf(anchor.fragment); at >= 0; at = source.indexOf(anchor.fragment, at + 1)) {
      var delta = Math.abs(at - desired);
      if (delta < distance) { best = at; distance = delta; }
    }
    return best < 0 ? start : start + best + anchor.textOffset;
  }
  function previewCaretRect(tx, target) {
    var line = tx.value.slice(0, tx.selectionStart).split('\n').length;
    if (Number(target.dataset.sourceLine) !== line) return target.getBoundingClientRect();
    var start = lineStart(tx.value, line), end = tx.value.indexOf('\n', start);
    var source = tx.value.slice(start, end < 0 ? tx.value.length : end);
    var caret = tx.selectionStart - start, from = 0, node;
    var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || node.parentElement.closest('.math-pending,.math-inline,.math-display')) continue;
      var at = source.indexOf(node.nodeValue, from);
      if (at < 0) continue;
      var last = at + node.nodeValue.length;
      if (caret >= at && caret <= last) {
        var range = document.createRange(), offset = Math.min(caret - at, node.nodeValue.length - 1);
        range.setStart(node, Math.max(0, offset)); range.setEnd(node, Math.min(node.nodeValue.length, offset + 1));
        var rect = range.getBoundingClientRect();
        if (rect.height) return rect;
      }
      from = last;
    }
    return target.getBoundingClientRect();
  }
  function sourceScroll(tx, at, offset) {
    // 用相同宽度和字体量出源码位置，长行换行时也能正确定位。
    var computed = getComputedStyle(tx), mirror = document.createElement('div');
    ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing',
      'tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','textIndent'].forEach(function (key) { mirror.style[key] = computed[key]; });
    Object.assign(mirror.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      pointerEvents: 'none', width: tx.clientWidth + 'px', boxSizing: 'border-box',
      whiteSpace: tx.wrap === 'off' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word', border: '0'
    });
    mirror.setAttribute('aria-hidden', 'true');
    mirror.appendChild(document.createTextNode(tx.value.slice(0, at)));
    var marker = document.createElement('span'); marker.textContent = '\u200b';
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(tx.value.slice(at) || '\u200b'));
    document.body.appendChild(mirror);
    var top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    mirror.remove();
    return Math.max(0, top - offset);
  }
  function toggle(btn, mode) {
    var box = btn.closest('.md-box'), tx = box.querySelector('.md-input'), px = box.querySelector('.md-preview');
    if (mode === 'edit' && px.hidden) { tx.focus({ preventScroll: true }); return; }
    if (mode === 'prev' && !px.hidden) return;
    var anchor = mode === 'edit' && Math.abs(px.scrollTop - (box._mdPreviewTop || 0)) >= 1 ? previewAnchor(px) : null;
    stopTracking(box);
    box.querySelectorAll('.m-tab').forEach(function (tab) { tab.classList.toggle('on', tab === btn); });
    if (mode === 'edit') {
      px.hidden = true; tx.hidden = false;
      var start = anchor ? sourcePosition(tx.value, anchor) : (box._mdStart || 0);
      tx.focus({ preventScroll: true }); tx.setSelectionRange(start, anchor ? start : (box._mdEnd || 0));
      tx.scrollTop = anchor ? sourceScroll(tx, start, anchor.offset) : (box._mdScroll || 0);
      tx.dispatchEvent(new Event('select', { bubbles: true }));
      return;
    }
    box._mdStart = tx.selectionStart; box._mdEnd = tx.selectionEnd; box._mdScroll = tx.scrollTop;
    var line = tx.value.slice(0, tx.selectionStart).split('\n').length;
    var height = Math.max(300, tx.getBoundingClientRect().height);
    px.style.height = height + 'px'; px.style.paddingBottom = (height - 42) + 'px';
    renderPreview(box); px.hidden = false; tx.hidden = true;
    px.dataset.activeLine = String(line);
    var nodes = Array.from(px.querySelectorAll('[data-source-line]'));
    var matches = nodes.filter(function (node) { return +node.dataset.sourceLine <= line && +(node.dataset.sourceEnd || node.dataset.sourceLine) >= line; });
    var target = matches.filter(function (node) {
      return +node.dataset.sourceLine === line && +(node.dataset.sourceEnd || node.dataset.sourceLine) === line &&
        !node.matches('.math-pending,.math-inline,.math-display');
    }).pop() || matches.pop();
    if (!target) target = nodes.find(function (node) { return +node.dataset.sourceLine >= line; }) || nodes[nodes.length - 1];
    if (target) target.classList.add('md-current-line');
    var tracking = true, frame = 0;
    function align() {
      if (!tracking || !target || px.hidden) return;
      px.scrollTop += previewCaretRect(tx, target).top - px.getBoundingClientRect().top - 18;
      box._mdPreviewTop = px.scrollTop;
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(align); }
    function stop() { tracking = false; cancelAnimationFrame(frame); if (observer) observer.disconnect(); px.removeEventListener('wheel', stop); px.removeEventListener('touchstart', stop); px.removeEventListener('pointerdown', stop); px.removeEventListener('keydown', stop); }
    var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer) Array.from(px.children).forEach(function (node) { observer.observe(node); });
    px.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', schedule, { once: true }); img.addEventListener('error', schedule, { once: true }); });
    ['wheel','touchstart','pointerdown','keydown'].forEach(function (event) { px.addEventListener(event, stop, { passive: true }); });
    box._mdStop = stop; align(); schedule();
  }
  function busy(root) {
    return Array.from(root.querySelectorAll('.md-box')).some(function (box) { return !!(box._mdState && (box._mdState.pending.length || box._mdState.pdfPending.length)); });
  }
  function destroy(root) {
    root.querySelectorAll('.md-box').forEach(function (box) {
      exitFullscreen(box);
      stopTracking(box);
    });
  }
  window.MingLongEditorCore = { html: html, wire: wire, toggle: toggle, fullscreen: toggleFullscreen, busy: busy, destroy: destroy };
})();
