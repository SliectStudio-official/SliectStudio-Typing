/* 打字输入引擎（与首页同一套交互与样式）
 * 首页 script.js 里的分段/逐字判定逻辑被复制到这里，供比赛页复用；
 * 目的：用户在首页练出来的手感（按行分段、输完自动翻页、错字标红、IME 兼容）
 * 在比赛页完全一致。样式全部使用既有的 .typing-page / .typing-line-text / .typing-line-input。
 * 后续若要彻底消除重复，可把首页也切到本模块——那是单独一批，需回归全部打字用例。
 */
(function (global) {
  'use strict';

  var MAX_LINE = 32;
  var BREAK_CHARS = /[\s，。！？、；：""''（）【】《》.,!?;:'"()\[\]{}]/;

  function splitTextIntoSegments(text) {
    var segs = [];
    var start = 0;
    while (start < text.length) {
      if (start + MAX_LINE >= text.length) { segs.push(text.slice(start)); break; }
      var end = start + MAX_LINE;
      var breakAt = end;
      var minBreakAt = start + Math.floor(MAX_LINE * 0.65);
      for (var i = end; i >= minBreakAt; i--) {
        if (BREAK_CHARS.test(text[i])) { breakAt = i + 1; break; }
      }
      segs.push(text.slice(start, breakAt));
      start = breakAt;
    }
    return segs;
  }

  function escapeChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === ' ') return '&nbsp;';
    return ch;
  }

  function create(container, options) {
    var text = options.text || '';
    var onChange = options.onChange || function () {};
    var onFinish = options.onFinish || function () {};

    var segments = splitTextIntoSegments(text);
    var charStates = new Array(text.length).fill('pending');
    var inputs = [];
    var values = [];
    var currentIndex = 0;
    var isComposing = false;
    var enabled = !!options.enabled;
    var finished = false;
    var startedAt = 0;

    container.innerHTML = '';
    container.classList.add('typing-pages');

    for (var i = 0; i < segments.length; i++) values.push('');

    function offsetOf(index) {
      var off = 0;
      for (var i = 0; i < index; i++) off += segments[i].length;
      return off;
    }

    function build() {
      container.innerHTML = '';
      inputs = [];
      segments.forEach(function (segment, index) {
        var page = document.createElement('div');
        page.className = 'typing-page' + (index === currentIndex ? ' active' : '') + (index < currentIndex ? ' completed' : '');

        var textEl = document.createElement('div');
        textEl.className = 'typing-line-text';
        textEl.id = 'race-typing-text-' + index;
        page.appendChild(textEl);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'typing-line-input' + (index < currentIndex ? ' completed' : '');
        input.value = values[index] || '';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.autocorrect = 'off';
        input.setAttribute('aria-label', '第 ' + (index + 1) + ' 段输入');
        input.disabled = index !== currentIndex || !enabled || finished;

        input.addEventListener('input', function () {
          if (isComposing) return;
          handle(index, input.value);
        });
        input.addEventListener('compositionstart', function () { isComposing = true; });
        input.addEventListener('compositionend', function () {
          isComposing = false;
          handle(index, input.value);
        });

        page.appendChild(input);
        inputs.push(input);
        container.appendChild(page);
        renderText(index);
      });
      scrollToCurrent();
    }

    function renderText(index) {
      var el = document.getElementById('race-typing-text-' + index);
      if (!el) return;
      var segment = segments[index];
      var off = offsetOf(index);
      var html = '';
      for (var i = 0; i < segment.length; i++) {
        html += '<span class="char ' + (charStates[off + i] || 'pending') + '">' + escapeChar(segment[i]) + '</span>';
      }
      el.innerHTML = html;
    }

    // 重连时把服务端进度灌回输入区，用户可以从上次的位置继续
    function restore(typedCount) {
      var remain = Math.max(0, Math.min(text.length, Number(typedCount) || 0));
      values = new Array(segments.length).fill('');
      charStates = new Array(text.length).fill('pending');
      var left = remain;
      for (var i = 0; i < segments.length; i++) {
        var take = Math.min(segments[i].length, left);
        if (take > 0) {
          values[i] = segments[i].slice(0, take);
          var off = offsetOf(i);
          for (var k = 0; k < take; k++) charStates[off + k] = 'correct';
        }
        left -= take;
        if (take < segments[i].length) {
          currentIndex = i;
          charStates[offsetOf(i) + take] = 'current';
          break;
        }
        currentIndex = i;
      }
      build();
    }

    function handle(index, value) {
      if (!enabled || finished || index !== currentIndex) return;
      var segment = segments[index];
      if (value.length > segment.length) {
        value = value.slice(0, segment.length);
        inputs[index].value = value;
      }
      var off = offsetOf(index);
      // 重算本段状态
      for (var i = 0; i < segment.length; i++) charStates[off + i] = 'pending';
      for (var k = 0; k < value.length; k++) {
        charStates[off + k] = value[k] === segment[k] ? 'correct' : 'wrong';
      }
      if (value.length < segment.length) charStates[off + value.length] = 'current';
      values[index] = value;
      renderText(index);
      emit();

      if (value.length >= segment.length) {
        var allCorrect = segment.split('').every(function (c, idx) { return value[idx] === c; });
        if (allCorrect) {
          if (index < segments.length - 1) { currentIndex = index + 1; build(); focus(); }
          else { finished = true; emit(true); onFinish(state()); }
        }
      }
    }

    function state() {
      var typed = 0, correct = 0, wrong = 0;
      values.forEach(function (v) { typed += v.length; });
      charStates.forEach(function (s) {
        if (s === 'correct') correct++;
        else if (s === 'wrong') wrong++;
      });
      var checked = correct + wrong;
      return {
        typed: typed,
        correct: correct,
        wrong: wrong,
        accuracy: checked > 0 ? Math.round(correct / checked * 1000) / 10 : 100,
        segments: segments.length,
        currentIndex: currentIndex,
        elapsedMs: startedAt ? Date.now() - startedAt : 0
      };
    }

    function emit(done) {
      onChange(state(), !!done);
    }

    function focus() {
      var input = inputs[currentIndex];
      if (input && !input.disabled) input.focus();
    }

    function scrollToCurrent() {
      var page = container.children[currentIndex];
      if (page && page.scrollIntoView) page.scrollIntoView({ block: 'nearest' });
    }

    build();

    return {
      focus: focus,
      state: state,
      restore: restore,
      enable: function (flag) {
        enabled = !!flag;
        if (enabled && !startedAt) startedAt = Date.now();
        inputs.forEach(function (input, idx) {
          input.disabled = !enabled || finished || idx !== currentIndex;
        });
        if (enabled) focus();
      },
      destroy: function () { container.innerHTML = ''; },
      segments: segments
    };
  }

  global.TypingEngine = { create: create, splitTextIntoSegments: splitTextIntoSegments };
})(window);
