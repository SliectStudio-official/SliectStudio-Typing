/* 代码模式输入组件：ghost 原文 + 透明 textarea 回显，Tab/Enter 缩进辅助，禁粘贴。
 * 与 typing-engine.js 解耦；普通文章仍走原引擎。
 */
(function (global) {
  'use strict';

  function escapeChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  function create(container, options) {
    options = options || {};
    var text = String(options.text || '');
    var label = options.label || '代码';
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var onFinish = typeof options.onFinish === 'function' ? options.onFinish : function () {};
    var debug = /(?:^|[?&])debug=1(?:&|=|$)/.test(global.location.search);
    var destroyed = false;
    var finished = false;
    var enabled = !!options.enabled;
    var startedAt = 0;
    var assisted = new Array(text.length).fill(false);
    var errorSet = {};
    var lastValue = '';
    var rafId = null;
    var selectionRafId = null;
    var rootEl = null;
    var input;
    var ghost;
    var stage;
    var body;
    var gutter;
    var measure;
    var statsEls = {};

    function fail(where, e) {
      console.error('[代码模式] ' + where, e);
    }

    function buildDom() {
      container.innerHTML = '';
      container.classList.add('code-mode-host');
      var root = document.createElement('div');
      root.id = 'code-typing';
      root.className = 'code-editor';
      rootEl = root;
      root.innerHTML =
        '<div class="code-editor-head">' +
          '<span class="code-file"></span><span class="code-lang">代码</span>' +
          '<span class="code-stats">' +
            '<span>进度 <b data-code-stat="progress">0%</b></span>' +
            '<span>速度 <b data-code-stat="speed">0</b></span>' +
            '<span>准确率 <b data-code-stat="acc">100%</b></span>' +
            '<span>错误 <b data-code-stat="errors">0</b></span>' +
            '<span>用时 <b data-code-stat="time">0.0</b>s</span>' +
          '</span>' +
        '</div>' +
        '<div class="code-editor-body">' +
          '<div class="code-gutter code-metric" aria-hidden="true"></div>' +
          '<div class="code-stage">' +
            '<pre class="code-ghost code-metric code-pad" aria-hidden="true"></pre>' +
            '<textarea class="code-input code-metric code-pad" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" aria-label="代码输入"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="code-editor-foot">' +
          '<span><kbd>Tab</kbd> 补齐缩进（不计入击键）</span>' +
          '<span><kbd>Enter</kbd> 换行（需自己按）</span>' +
          '<span>禁止粘贴</span>' +
          '<span class="code-debug-wrap"></span>' +
        '</div>';
      container.appendChild(root);
      input = root.querySelector('.code-input');
      ghost = root.querySelector('.code-ghost');
      stage = root.querySelector('.code-stage');
      body = root.querySelector('.code-editor-body');
      gutter = root.querySelector('.code-gutter');
      root.querySelector('.code-file').textContent = label;
      statsEls = {};
      root.querySelectorAll('[data-code-stat]').forEach(function (el) {
        statsEls[el.getAttribute('data-code-stat')] = el;
      });
      measure = document.createElement('span');
      measure.className = 'code-measure code-metric';
      measure.setAttribute('aria-hidden', 'true');
      stage.appendChild(measure);
      if (debug) {
        var wrap = root.querySelector('.code-debug-wrap');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-debug-btn';
        btn.textContent = '显示辅助字符';
        btn.addEventListener('click', function () {
          root.classList.toggle('show-assist');
          btn.textContent = root.classList.contains('show-assist') ? '隐藏辅助字符' : '显示辅助字符';
          render();
        });
        wrap.appendChild(btn);
      }
      input.disabled = !enabled || finished;
      input.addEventListener('keydown', onKeyDown);
      input.addEventListener('input', onInput);
      input.addEventListener('paste', prevent);
      input.addEventListener('drop', prevent);
      input.addEventListener('keyup', scheduleCaret);
      input.addEventListener('click', scheduleCaret);
      input.addEventListener('focus', scheduleCaret);
      input.addEventListener('select', scheduleSelection);
      input.addEventListener('keyup', scheduleSelection);
      input.addEventListener('mouseup', scheduleSelection);
      input.addEventListener('click', scheduleSelection);
      document.addEventListener('selectionchange', onSelectionChange);
    }

    function prevent(e) {
      e.preventDefault();
    }

    function stats() {
      var value = input ? input.value : '';
      var typed = 0;
      var correct = 0;
      var wrong = 0;
      var assistCount = 0;
      for (var i = 0; i < value.length; i++) {
        if (assisted[i]) { assistCount += 1; continue; }
        typed += 1;
        if (value[i] === text[i]) correct += 1;
        else wrong += 1;
      }
      var errors = 0;
      for (var key in errorSet) if (errorSet[key]) errors += 1;
      var elapsedMs = startedAt ? Date.now() - startedAt : 0;
      var minutes = elapsedMs / 60000;
      var speed = minutes > 0 ? Math.round(correct / minutes) : 0;
      var accuracy = typed > 0 ? Math.round(correct / typed * 1000) / 10 : 100;
      return {
        typed: typed,
        correct: correct,
        wrong: wrong,
        accuracy: accuracy,
        errors: errors,
        elapsedMs: elapsedMs,
        speed: speed,
        length: text.length,
        assisted: assistCount,
        finished: finished,
        value: value
      };
    }

    function render() {
      if (!ghost || destroyed) return;
      try {
        var value = input.value;
        var html = '';
        for (var i = 0; i < text.length; i++) {
          var target = text[i];
          var typedHere = i < value.length;
          if (target === '\n') {
            if (typedHere && value[i] !== '\n') html += '<span class="char ch-bad ch-typed wrong">\u21b5</span>';
            html += '\n';
            continue;
          }
          var shown = typedHere ? value[i] : target;
          var cls;
          if (!typedHere) cls = 'char ch-pending';
          else if (shown === target) cls = assisted[i] ? 'char ch-assist' : 'char ch-ok correct';
          else cls = 'char ch-bad ch-typed wrong';
          if (shown === ' ') shown = '\u00b7';
          else shown = escapeChar(shown);
          html += '<span class="' + cls + '" data-index="' + i + '">' + shown + '</span>';
        }
        ghost.innerHTML = html;
        var lines = text.split('\n').length;
        var gutterText = '';
        for (var ln = 1; ln <= lines; ln++) gutterText += (ln > 1 ? '\n' : '') + ln;
        gutter.textContent = gutterText;
        var s = stats();
        statsEls.progress.textContent = Math.min(100, Math.round(value.length / Math.max(1, text.length) * 100)) + '%';
        statsEls.speed.textContent = s.speed;
        statsEls.acc.textContent = s.accuracy + '%';
        statsEls.errors.textContent = s.errors;
        statsEls.time.textContent = (s.elapsedMs / 1000).toFixed(1);
        scheduleCaret();
        scheduleSelection();
        if (!finished && value.length >= text.length && text.length > 0) finish();
        emit(s);
      } catch (e) {
        fail('渲染异常', e);
      }
    }

    function emit(s) {
      try { onChange(s || stats()); } catch (e) { fail('onChange 异常', e); }
    }

    function recordErrors() {
      var value = input.value;
      for (var i = 0; i < value.length; i++) {
        if (value[i] !== text[i] && !assisted[i]) errorSet[i] = true;
      }
    }

    function applyInputDiff(oldValue, newValue) {
      var start = 0;
      while (start < oldValue.length && start < newValue.length && oldValue[start] === newValue[start]) start += 1;
      var oldEnd = oldValue.length;
      var newEnd = newValue.length;
      while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
        oldEnd -= 1;
        newEnd -= 1;
      }
      var inserted = newEnd - start;
      var next = assisted.slice(0, start);
      for (var i = 0; i < inserted; i++) next.push(false);
      for (var j = oldEnd; j < assisted.length; j++) next.push(assisted[j]);
      while (next.length < newValue.length) next.push(false);
      assisted = next.slice(0, newValue.length);
    }

    function setValue(next, caret) {
      input.value = next;
      lastValue = next;
      if (typeof caret === 'number') input.setSelectionRange(caret, caret);
    }

    function insertText(str, markAssist) {
      try {
        var start = input.selectionStart;
        var end = input.selectionEnd;
        var value = input.value;
        var next = value.slice(0, start) + str + value.slice(end);
        var nextAssisted = assisted.slice(0, start);
        for (var i = 0; i < str.length; i++) nextAssisted.push(!!markAssist);
        for (var j = end; j < assisted.length; j++) nextAssisted.push(assisted[j]);
        if (next.length > text.length) {
          next = next.slice(0, text.length);
          nextAssisted = nextAssisted.slice(0, text.length);
        }
        while (nextAssisted.length < next.length) nextAssisted.push(false);
        assisted = nextAssisted;
        setValue(next, Math.min(start + str.length, next.length));
        if (!startedAt) startedAt = Date.now();
        recordErrors();
        render();
      } catch (e) {
        fail('插入异常', e);
      }
    }

    function onKeyDown(e) {
      if (!enabled || finished || destroyed) return;
      try {
        if (e.key === 'Tab') {
          e.preventDefault();
          var pos = input.selectionStart;
          var run = 0;
          while (run < 8 && text[pos + run] === ' ') run += 1;
          if (run > 0) {
            insertText(new Array(run + 1).join(' '), true);
          } else {
            var value = input.value;
            var col = value.slice(value.lastIndexOf('\n', pos - 1) + 1, pos).length;
            var need = 2 - (col % 2);
            if (need <= 0) need = 2;
            insertText(new Array(need + 1).join(' '), false);
          }
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          var p = input.selectionStart;
          var nl = text.indexOf('\n', p);
          var indent = '';
          if (nl >= 0) {
            var m = text.slice(nl + 1).match(/^ */);
            indent = m ? m[0] : '';
            if (indent.length > 8) indent = indent.slice(0, 8);
          }
          var str = '\n' + indent;
          var exact = text.slice(p, p + str.length) === str;
          insertText(str, exact);
        }
      } catch (err) {
        fail('按键处理异常', err);
      }
    }

    function onInput() {
      if (!enabled || finished || destroyed) return;
      try {
        var value = input.value;
        applyInputDiff(lastValue, value);
        if (value.length > text.length) value = value.slice(0, text.length);
        if (assisted.length > value.length) assisted.length = value.length;
        while (assisted.length < value.length) assisted.push(false);
        input.value = value;
        lastValue = value;
        if (!startedAt && value.length > 0) startedAt = Date.now();
        recordErrors();
        render();
      } catch (e) {
        fail('输入处理异常', e);
      }
    }

    function finish() {
      if (finished) return;
      finished = true;
      input.disabled = true;
      var s = stats();
      try { onFinish(s); } catch (e) { fail('onFinish 异常', e); }
    }

    function measureLine(textValue) {
      if (!measure) return 0;
      measure.textContent = textValue.replace(/ /g, '\u00a0') || '\u00a0';
      return measure.getBoundingClientRect().width;
    }

    function ensureCaretVisible() {
      rafId = null;
      if (!input || !body || !stage || destroyed) return;
      try {
        var pos = input.selectionStart || 0;
        var before = input.value.slice(0, pos);
        var lines = before.split('\n');
        var lineIndex = lines.length - 1;
        var cs = getComputedStyle(input);
        var padLeft = parseFloat(cs.paddingLeft) || 0;
        var padTop = parseFloat(cs.paddingTop) || 0;
        var lineHeight = parseFloat(cs.lineHeight) || 24;
        var stageRect = stage.getBoundingClientRect();
        var bodyRect = body.getBoundingClientRect();
        var caretX = stageRect.left - bodyRect.left + padLeft + measureLine(lines[lineIndex]);
        if (caretX > body.clientWidth - 32) body.scrollLeft += caretX - body.clientWidth + 32;
        else if (caretX < 48) body.scrollLeft = Math.max(0, body.scrollLeft + caretX - 48);
        var caretY = padTop + lineIndex * lineHeight;
        if (caretY < body.scrollTop + 8) body.scrollTop = Math.max(0, caretY - 8);
        else if (caretY > body.scrollTop + body.clientHeight - 12) body.scrollTop = caretY - body.clientHeight + 12;
      } catch (e) {
        fail('光标滚动异常', e);
      }
    }

    function scheduleCaret() {
      if (rafId || destroyed) return;
      rafId = requestAnimationFrame(ensureCaretVisible);
    }

    // 低透明度选区在 Chromium 双击时仍会盖住 ghost 文字，改为自绘选区
    function updateSelectionHighlight() {
      selectionRafId = null;
      if (!input || !ghost || destroyed) return;
      var start = input.selectionStart || 0;
      var end = input.selectionEnd || 0;
      if (rootEl) rootEl.classList.toggle('selecting', end > start);
      var chars = ghost.querySelectorAll('.char');
      for (var i = 0; i < chars.length; i++) {
        var idx = Number(chars[i].getAttribute('data-index'));
        chars[i].classList.toggle('sel', idx >= start && idx < end);
      }
    }

    function scheduleSelection() {
      if (selectionRafId || destroyed) return;
      selectionRafId = requestAnimationFrame(updateSelectionHighlight);
    }

    function onSelectionChange() {
      if (document.activeElement === input) scheduleSelection();
    }

    function restore(typedCount) {
      try {
        var n = Math.max(0, Math.min(text.length, Number(typedCount) || 0));
        finished = false;
        assisted = new Array(text.length).fill(false);
        errorSet = {};
        setValue(text.slice(0, n), n);
        if (input) input.disabled = !enabled;
        startedAt = Date.now();
        render();
      } catch (e) {
        fail('恢复进度异常', e);
      }
    }

    function enable(flag) {
      enabled = !!flag;
      if (input) {
        input.disabled = !enabled || finished;
        if (enabled && !finished) {
          if (!startedAt) startedAt = Date.now();
          input.focus();
          scheduleCaret();
        }
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (selectionRafId) { cancelAnimationFrame(selectionRafId); selectionRafId = null; }
      document.removeEventListener('selectionchange', onSelectionChange);
      try {
        if (container) {
          container.innerHTML = '';
          container.classList.remove('code-mode-host');
        }
      } catch (e) {
        fail('销毁异常', e);
      }
    }

    try {
      buildDom();
      render();
      if (enabled) enable(true);
    } catch (e) {
      console.error('[代码模式] 初始化异常', e);
      try { container.innerHTML = ''; } catch (_) {}
      throw e;
    }

    return {
      state: stats,
      restore: restore,
      enable: enable,
      focus: function () { if (input && !input.disabled) input.focus(); },
      destroy: destroy,
      getErrors: function () {
        var out = [];
        for (var key in errorSet) if (errorSet[key]) out.push(Number(key));
        return out;
      }
    };
  }

  global.createCodeTyping = create;
  global.CodeTyping = { create: create };
})(window);
