// The only element factory. Text is always set with textContent, never parsed as HTML.
CH.dom = (function () {
  function h(tag, attrs) {
    var node = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (key) {
      var value = a[key];
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'style') node.setAttribute('style', value);
      else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(parent, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    if (typeof child === 'string' || typeof child === 'number') { parent.appendChild(document.createTextNode(String(child))); return; }
    parent.appendChild(child);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  return { h: h, append: append, clear: clear };
})();
