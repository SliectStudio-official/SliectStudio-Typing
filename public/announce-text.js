/* 公告正文的极简链接渲染：只认 [文字](URL)，其余内容一律按纯文本。
 * URL 只允许 http(s):// 或 / 开头的站内路径；不合法时整段保留原文。
 */
(function (global) {
  'use strict';

  var LINK_RE = /\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g;

  function isSafeUrl(url) {
    return /^https?:\/\//.test(url) || /^\/[^\s]*$/.test(url);
  }

  function render(el, text) {
    if (!el) return;
    el.textContent = '';
    var source = text == null ? '' : String(text);
    if (!source) return;

    var last = 0;
    var match;
    LINK_RE.lastIndex = 0;
    while ((match = LINK_RE.exec(source)) !== null) {
      if (match.index > last) el.appendChild(document.createTextNode(source.slice(last, match.index)));
      if (isSafeUrl(match[2])) {
        var link = document.createElement('a');
        link.href = match[2];
        link.textContent = match[1];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'announce-link';
        el.appendChild(link);
      } else {
        el.appendChild(document.createTextNode(match[0]));
      }
      last = LINK_RE.lastIndex;
    }
    if (last < source.length) el.appendChild(document.createTextNode(source.slice(last)));
  }

  global.AnnounceText = { render: render };
})(window);
