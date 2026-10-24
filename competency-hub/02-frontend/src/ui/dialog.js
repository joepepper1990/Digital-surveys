// The one dialog used by every form and the action panel: modal, focus kept inside, Escape or the
// backdrop closes it, and focus returns to where it was.
CH.ui.dialog = (function () {
  var h = CH.dom.h;
  var FOCUSABLE = 'a[href], select, input, textarea, button:not([disabled])';

  // opts: { root, id, title, wide, onClose }. Returns { body, close, node, setTitle }.
  function open(opts) {
    var previousFocus = document.activeElement;
    var heading = h('h2', { id: opts.id + '-heading', text: opts.title });
    var body = h('div', { class: 'dialog-content' });
    var closeBtn = h('button', { type: 'button', class: 'dialog-x', 'aria-label': 'Close', text: '×' });
    var dialog = h('div', { class: 'dialog' + (opts.wide ? ' dialog-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': opts.id + '-heading', id: opts.id },
      h('div', { class: 'dialog-head' }, heading, closeBtn), body);
    var scrim = h('div', { class: 'scrim', onclick: function (e) { if (e.target === scrim) close(); } }, dialog);
    var closed = false;

    function close() {
      if (closed) return;
      closed = true;
      scrim.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      // only the dialog on top answers: one opened over another (an action from a meeting) closes on its own
      if (scrim.parentNode && scrim.parentNode.lastElementChild !== scrim) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.filter.call(dialog.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    opts.root.appendChild(scrim);

    return {
      node: dialog, body: body, close: close,
      isOpen: function () { return !closed; },
      setTitle: function (text) { heading.textContent = text; },
      focusFirst: function () {
        var first = body.querySelector('input, select, textarea, button');
        (first || closeBtn).focus();
      }
    };
  }

  // A labelled field with a hint and an error line (ids follow the input's id).
  function field(label, input, hint) {
    return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), hint ? h('span', { class: 'hint', text: hint }) : null, input,
      h('span', { class: 'field-error', id: input.id + '-err' }));
  }

  // Shows errors ({ key: message }) against fields whose ids are prefix + key; focuses the first.
  function showErrors(container, prefix, errors, order) {
    Array.prototype.forEach.call(container.querySelectorAll('.field-error'), function (n) { n.textContent = ''; });
    var first = null;
    order.forEach(function (k) {
      if (!errors[k]) return;
      var slot = container.querySelector('#' + prefix + k + '-err');
      if (slot) slot.textContent = errors[k];
      if (!first) first = container.querySelector('#' + prefix + k);
    });
    if (first) first.focus();
    return !!first;
  }

  return { open: open, field: field, showErrors: showErrors };
})();
