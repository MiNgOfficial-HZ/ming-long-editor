# Ming Long Editor

一个可以直接嵌入网页的长文编辑器。它把写作时最容易被拆散的几件事放在同一个编辑区里：Markdown 编辑与预览、Markdown 文件导入、图片图床、PDF 附件、源码与预览双向定位，以及全屏写作。

这个仓库从 MiNgHZ 网站的编辑体验中抽离出来，但不依赖网站的登录、数据库、Cloudflare Worker 或 GitHub Token。图片和 PDF 的保存接口通过适配器传入，数据仍然由使用者自己的服务负责。

## 特性

- 编辑 / 预览双向切换，切换时保持源码行位置
- 预览区滚动到某一段后，切回编辑器会定位到对应源码
- Markdown 文件导入，支持替换或追加正文，并自动读取首个一级标题
- 图片图床入口：上传、读取图片库、插入 Markdown、复制链接、删除
- PDF 附件入口：上传、读取 PDF 库、设为本文附件、删除
- 一键全屏写作；按 `Esc` 退出全屏但保留弹窗和正文
- 默认安全 Markdown 渲染器：先转义 HTML，再处理 Markdown，避免正文注入标签
- 可选 KaTeX 注入公式；也可以替换为自己的 Markdown 渲染器
- 不绑定框架，原生 JavaScript + CSS，适合静态站点、CMS 和后台表单

## 最小用法

把 `src/` 下四个文件按顺序引入：

```html
<link rel="stylesheet" href="src/ming-long-editor.css">
<div id="editor"></div>

<script src="src/ming-markdown-renderer.js"></script>
<script src="src/ming-markdown-import.js"></script>
<script src="src/ming-editor-core.js"></script>
<script src="src/ming-long-editor.js"></script>
<script>
  const editor = MingLongEditor.mount('#editor', {
    value: '# Hello\n\n开始写作。',
    onChange(value) {
      console.log('正文长度：', value.length);
    },
    onToast(message) {
      console.log(message);
    }
  });
</script>
```

打开 `demo/index.html` 可以查看完整 UI。`MingLongEditor.mount()` 返回 `getValue()`、`setValue()`、`preview()`、`edit()`、`fullscreen()` 和 `destroy()`。

## 接入图床与 PDF 接口

编辑器不会替使用者决定存储位置。把适配器传给 `media` 即可：

```js
const editor = MingLongEditor.mount('#editor', {
  media: {
    uploadImage(payload, onProgress) {
      return post('/api/media/image', payload, onProgress);
    },
    listImages() {
      return fetch('/api/media/images').then(toEditorResponse);
    },
    deleteImage(asset) {
      return post('/api/media/delete', { name: asset.name, type: 'image' });
    },
    uploadPdf(payload, onProgress) {
      return post('/api/media/pdf', payload, onProgress);
    },
    listPdfs() {
      return fetch('/api/media/pdfs').then(toEditorResponse);
    },
    deletePdf(asset) {
      return post('/api/media/delete', { name: asset.name, type: 'pdf' });
    }
  }
});
```

上传回调返回的结构是：

```js
{ ok: true, json: { url: 'https://cdn.example.com/a.webp', name: 'a.webp' } }
```

PDF 上传也可以返回 `json.pdfs[0]`，或返回带 `url` / `path` 的附件对象。删除、读取失败时返回 `{ ok: false, json: { error: '原因' } }`，编辑器会在对应区域显示状态。

## 自定义 Markdown 渲染

默认渲染器是 `MingLongMarkdownRenderer.render`。如果项目已经使用 `marked`、`markdown-it` 或自己的渲染器，可以直接传入：

```js
MingLongEditor.mount('#editor', {
  render(source, mapped) {
    return myMarkdownRenderer(source, { sourceLineMapping: mapped });
  },
  math(root) {
    // 在这里调用 KaTeX 或 MathJax
  }
});
```

渲染器应返回 HTML 字符串。若要保留预览到编辑器的行定位，需要为块级节点保留 `data-source-line` 和可选的 `data-source-end` 属性。

## 目录结构

```text
src/
  ming-editor-core.js       编辑、预览、同步、全屏、图片/PDF UI 核心
  ming-markdown-import.js   Markdown 文件读取与替换/追加
  ming-markdown-renderer.js 安全的默认 Markdown 渲染器
  ming-long-editor.js       独立 mount API 和媒体适配器入口
  ming-long-editor.css      不依赖站点的编辑器样式
demo/index.html              无后端的本地演示
tests/smoke.mjs              静态回归检查
```

## 安全边界

- 不要把图床密钥、GitHub Token 或数据库凭据放进浏览器代码。
- 图片与 PDF 上传接口必须在服务端验证登录态、文件类型、文件大小和文件名。
- 默认 Markdown 渲染器会转义原始 HTML，只保留 Markdown 换行写法。
- 生产环境建议为上传接口设置大小限制、内容类型检查、速率限制和对象存储权限。

## License

MIT License，详见 [LICENSE](LICENSE)。
