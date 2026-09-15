import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

test('utility navigation collapses into a labeled menu that opens and closes', () => {
  const classes = new Set();
  const nav = {
    classList: {
      toggle(name) { classes.has(name) ? classes.delete(name) : classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    contains() { return false; }
  };
  const actions = { children: [], append(child) { this.children.push(child); }, contains() { return false; } };
  const documentListeners = {};
  const document = {
    documentElement: { dataset: {} },
    getElementById() { return null; },
    querySelector(selector) { return selector === '.site-nav' ? nav : actions; },
    createElement() {
      return {
        attributes: {},
        listeners: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, listener) { this.listeners[name] = listener; }
      };
    },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };

  vm.runInNewContext(readFileSync('utility-theme.js', 'utf8'), { document, localStorage: { getItem() {} } });

  assert.equal(actions.children.length, 1);
  const button = actions.children[0];
  assert.equal(button.attributes['aria-label'], '打开主导航');
  assert.equal(button.attributes['aria-expanded'], 'false');

  button.listeners.click({ stopPropagation() {} });
  assert.equal(classes.has('is-mobile-open'), true);
  assert.equal(button.attributes['aria-expanded'], 'true');

  documentListeners.keydown({ key: 'Escape' });
  assert.equal(classes.has('is-mobile-open'), false);
  assert.equal(button.attributes['aria-expanded'], 'false');
});

test('navigation menu button covers the same responsive range that hides desktop navigation', () => {
  const css = readFileSync(new URL('../utility-theme.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(min-width:1281px\)\{\.utility-menu-button\{display:none!important\}\}/);
  assert.match(css, /@media\(max-width:1280px\).*\.site-nav\{display:none!important\}/s);
});
