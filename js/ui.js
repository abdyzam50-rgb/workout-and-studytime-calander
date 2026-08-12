// Small shared DOM helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Circumference of the r=108 progress ring used in both dials. */
export const RING_LENGTH = 2 * Math.PI * 108;

/** progress 0 → 1 drains the ring clockwise. */
export function setRing(circle, progress) {
  const clamped = Math.min(1, Math.max(0, progress));
  circle.style.strokeDashoffset = String(RING_LENGTH * clamped);
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** "14:05" in the user's locale, from an ISO timestamp. */
export function clockTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
