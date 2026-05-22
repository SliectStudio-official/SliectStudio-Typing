(function () {
  function initCustomSelects() {
    document.querySelectorAll('select.custom-select').forEach(function (selectEl) {
      if (selectEl.dataset.customSelectInit) return;
      selectEl.dataset.customSelectInit = '1';

      var wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';

      var trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('role', 'combobox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-haspopup', 'listbox');

      var triggerText = document.createElement('span');
      triggerText.className = 'custom-select-trigger-text';
      trigger.appendChild(triggerText);

      var dropdown = document.createElement('div');
      dropdown.className = 'custom-select-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('tabindex', '-1');

      selectEl.parentNode.insertBefore(wrapper, selectEl);
      wrapper.appendChild(selectEl);
      wrapper.appendChild(trigger);
      wrapper.appendChild(dropdown);
      wrapper._dropdown = dropdown;

      function getOptions() {
        return Array.from(selectEl.options);
      }

      function updateTriggerText() {
        var opt = selectEl.options[selectEl.selectedIndex];
        if (opt && opt.value) {
          triggerText.textContent = opt.textContent;
          triggerText.classList.remove('placeholder');
        } else {
          triggerText.textContent = opt ? opt.textContent : '';
          triggerText.classList.add('placeholder');
        }
      }

      function renderOptions() {
        dropdown.innerHTML = '';
        var options = getOptions();
        if (options.length === 0) {
          var noRes = document.createElement('div');
          noRes.className = 'custom-select-option no-results';
          noRes.textContent = '暂无选项';
          dropdown.appendChild(noRes);
          return;
        }

        var optgroups = selectEl.querySelectorAll('optgroup');
        if (optgroups.length > 0) {
          var globalIdx = 0;
          var directOpts = [];
          for (var i = 0; i < selectEl.children.length; i++) {
            var child = selectEl.children[i];
            if (child.tagName === 'OPTION') directOpts.push({ opt: child, idx: globalIdx++ });
          }
          directOpts.forEach(function (item) {
            dropdown.appendChild(createOptionItem(item.opt, item.idx));
          });
          optgroups.forEach(function (group) {
            var groupLabel = document.createElement('div');
            groupLabel.className = 'custom-select-group-label';
            groupLabel.textContent = group.label || '';
            dropdown.appendChild(groupLabel);

            Array.from(group.options).forEach(function (opt) {
              var item = createOptionItem(opt, globalIdx);
              dropdown.appendChild(item);
              globalIdx++;
            });
          });
        } else {
          options.forEach(function (opt, idx) {
            var item = createOptionItem(opt, idx);
            dropdown.appendChild(item);
          });
        }
      }

      function createOptionItem(opt, idx) {
        var item = document.createElement('div');
        item.className = 'custom-select-option';
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '-1');
        item.setAttribute('data-index', idx);
        item.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
        item.textContent = opt.textContent;
        if (opt.selected) item.classList.add('selected');
        if (opt.disabled) item.classList.add('is-disabled');
        return item;
      }

      function positionDropdown() {
        var rect = trigger.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        dropdown.style.maxHeight = '240px';
        dropdown.style.zIndex = '9999';
        dropdown.style.boxSizing = 'border-box';
      }

      function open() {
        if (trigger.classList.contains('is-disabled')) return;
        document.body.appendChild(dropdown);
        positionDropdown();
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        dropdown.style.visibility = 'visible';
        dropdown.style.opacity = '1';
        dropdown.style.transform = 'translateY(0)';
        scrollToSelected();
        var selected = dropdown.querySelector('.custom-select-option.selected');
        if (selected && !selected.classList.contains('is-disabled')) {
          selected.focus();
        } else {
          var first = dropdown.querySelector('.custom-select-option:not(.is-disabled):not(.no-results)');
          if (first) first.focus();
        }
      }

      function close() {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        dropdown.style.visibility = 'hidden';
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(-4px)';
        if (dropdown.parentNode !== wrapper) {
          wrapper.appendChild(dropdown);
        }
      }

      function toggle() {
        if (wrapper.classList.contains('open')) {
          close();
        } else {
          closeAll();
          open();
        }
      }

      function scrollToSelected() {
        var sel = dropdown.querySelector('.custom-select-option.selected');
        if (sel) {
          sel.scrollIntoView({ block: 'nearest' });
        }
      }

      function selectOption(idx) {
        var opt = selectEl.options[idx];
        if (!opt || opt.disabled) return;
        selectEl.selectedIndex = idx;
        updateTriggerText();
        renderOptions();
        close();
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function refresh() {
        updateTriggerText();
        renderOptions();
        if (selectEl.disabled) {
          trigger.classList.add('is-disabled');
        } else {
          trigger.classList.remove('is-disabled');
        }
      }

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle();
      });

      trigger.addEventListener('keydown', function (e) {
        var isOpen = wrapper.classList.contains('open');
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
          trigger.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!isOpen) {
            open();
          }
          var nextIdx = selectEl.selectedIndex + 1;
          while (nextIdx < selectEl.options.length && selectEl.options[nextIdx].disabled) nextIdx++;
          if (nextIdx < selectEl.options.length) {
            selectEl.selectedIndex = nextIdx;
            updateTriggerText();
            renderOptions();
            scrollToSelected();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isOpen) {
            open();
          }
          var prevIdx = selectEl.selectedIndex - 1;
          while (prevIdx >= 0 && selectEl.options[prevIdx].disabled) prevIdx--;
          if (prevIdx >= 0) {
            selectEl.selectedIndex = prevIdx;
            updateTriggerText();
            renderOptions();
            scrollToSelected();
          }
        } else if (isOpen && e.key === 'Home') {
          e.preventDefault();
          var firstIdx = 0;
          while (firstIdx < selectEl.options.length && selectEl.options[firstIdx].disabled) firstIdx++;
          if (firstIdx < selectEl.options.length) {
            selectEl.selectedIndex = firstIdx;
            updateTriggerText();
            renderOptions();
            scrollToSelected();
          }
        } else if (isOpen && e.key === 'End') {
          e.preventDefault();
          var lastIdx = selectEl.options.length - 1;
          while (lastIdx >= 0 && selectEl.options[lastIdx].disabled) lastIdx--;
          if (lastIdx >= 0) {
            selectEl.selectedIndex = lastIdx;
            updateTriggerText();
            renderOptions();
            scrollToSelected();
          }
        }
      });

      dropdown.addEventListener('click', function (e) {
        var item = e.target.closest('.custom-select-option');
        if (!item || item.classList.contains('is-disabled') || item.classList.contains('no-results')) return;
        var idx = parseInt(item.getAttribute('data-index'), 10);
        selectOption(idx);
      });

      dropdown.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
          trigger.focus();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          var items = dropdown.querySelectorAll('.custom-select-option:not(.is-disabled):not(.no-results)');
          var focused = document.activeElement;
          var idx = Array.from(items).indexOf(focused);
          if (e.shiftKey) {
            var prev = idx > 0 ? items[idx - 1] : items[items.length - 1];
            if (prev) prev.focus();
          } else {
            var next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : items[0];
            if (next) next.focus();
          }
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          var focused = document.activeElement;
          if (focused && focused.classList.contains('custom-select-option')) {
            var idx = parseInt(focused.getAttribute('data-index'), 10);
            selectOption(idx);
          }
        }
      });

      updateTriggerText();
      renderOptions();

      if (selectEl.disabled) {
        trigger.classList.add('is-disabled');
      }

      var origDisabledSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
      try {
        Object.defineProperty(selectEl, 'disabled', {
          get: function () { return origDisabledSetter.get.call(this); },
          set: function (val) {
            origDisabledSetter.set.call(this, val);
            if (val) {
              trigger.classList.add('is-disabled');
            } else {
              trigger.classList.remove('is-disabled');
            }
          }
        });
      } catch (e) {}

      var origSelectedIndexSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
      try {
        Object.defineProperty(selectEl, 'selectedIndex', {
          get: function () { return origSelectedIndexSetter.get.call(this); },
          set: function (val) {
            origSelectedIndexSetter.set.call(this, val);
            updateTriggerText();
            renderOptions();
          }
        });
      } catch (e) {}

      var origSetValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      try {
        Object.defineProperty(selectEl, 'value', {
          get: function () { return origSetValue.get.call(this); },
          set: function (val) {
            origSetValue.set.call(this, val);
            updateTriggerText();
            renderOptions();
          }
        });
      } catch (e) {}

      var refreshTimer = null;
      function debouncedRefresh() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () {
          refresh();
          refreshTimer = null;
        }, 0);
      }

      var observer = new MutationObserver(function () {
        debouncedRefresh();
      });
      observer.observe(selectEl, { childList: true, subtree: true });

      selectEl._customSelectRefresh = refresh;
    });
  }

  function closeAll() {
    document.querySelectorAll('.custom-select-wrapper.open').forEach(function (w) {
      w.classList.remove('open');
      var t = w.querySelector('.custom-select-trigger');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.custom-select-dropdown').forEach(function (d) {
      d.style.visibility = 'hidden';
      d.style.opacity = '0';
      d.style.transform = 'translateY(-4px)';
      var w = d.closest('.custom-select-wrapper');
      if (w && d.parentNode !== w) {
        w.appendChild(d);
      }
    });
  }

  var scrollTimer = null;
  function onScrollOrResize() {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      document.querySelectorAll('.custom-select-wrapper.open').forEach(function (w) {
        var triggerEl = w.querySelector('.custom-select-trigger');
        if (!triggerEl) return;
        var rect = triggerEl.getBoundingClientRect();
        var dropdownEl = w._dropdown;
        if (dropdownEl && dropdownEl.parentNode !== w) {
          dropdownEl.style.position = 'fixed';
          dropdownEl.style.top = (rect.bottom + 4) + 'px';
          dropdownEl.style.left = rect.left + 'px';
          dropdownEl.style.width = rect.width + 'px';
        }
      });
      scrollTimer = null;
    }, 16);
  }

  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.custom-select-wrapper')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomSelects);
  } else {
    initCustomSelects();
  }

  window.initCustomSelects = initCustomSelects;
})();
