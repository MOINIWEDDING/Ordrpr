// CSS y HTML propios del dueño para el menú tipo carta.
//
// - El HTML se limpia en el navegador: solo etiquetas de contenido (texto, títulos, listas, imágenes,
//   enlaces) y atributos seguros. Se quitan scripts, iframes, formularios, estilos y cualquier
//   atributo de eventos (onclick…), para que el contenido no pueda ejecutar código en la página.
// - El CSS se aplica solo dentro de la carta: se envuelve en el selector de la carta (CSS anidado),
//   así no puede cambiar el resto de la página.

const ALLOWED_TAGS = new Set(['div', 'section', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'em', 'i', 'u', 'small', 'br', 'hr', 'img', 'a', 'ul', 'ol', 'li', 'figure', 'figcaption', 'blockquote', 'picture', 'source']);
const ALLOWED_ATTRS = new Set(['class', 'style', 'href', 'src', 'srcset', 'alt', 'title', 'target', 'width', 'height']);
export const MAX_CUSTOM_LENGTH = 20000;

const safeUrl = (v) => /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(String(v).trim());
const safeImg = (v) => /^(https:|\/(?!\/)|data:image\/(png|jpe?g|gif|webp);)/i.test(String(v).trim());
const unsafeStyle = (v) => /(expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(?!https:|data:image))/i.test(v);

export function sanitizeHtml(html) {
  if (typeof window === 'undefined' || !html) return '';
  const doc = new DOMParser().parseFromString(`<div>${String(html).slice(0, MAX_CUSTOM_LENGTH)}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  const clean = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 8) { child.remove(); return; } // comentarios
      if (child.nodeType !== 1) return; // texto: se queda
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // etiquetas peligrosas se borran enteras; las demás se reemplazan por su contenido
        if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'svg', 'math', 'template', 'noscript', 'video', 'audio'].includes(tag)) child.remove();
        else { clean(child); child.replaceWith(...child.childNodes); }
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        const ok = ALLOWED_ATTRS.has(name)
          && !(name === 'href' && !safeUrl(value))
          && !((name === 'src' || name === 'srcset') && !value.split(',').every((part) => safeImg(part.trim().split(/\s+/)[0])))
          && !(name === 'style' && unsafeStyle(value));
        if (!ok) child.removeAttribute(attr.name);
      });
      if (tag === 'a' && child.getAttribute('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
      clean(child);
    });
  };
  clean(root);
  return root.innerHTML;
}

// Envuelve el CSS del dueño dentro del selector de la carta. Se quita todo lo que podría cerrar la
// etiqueta <style> o cargar código, y las reglas @import (no funcionan dentro de un bloque anidado).
export function scopeCss(css, scope) {
  const clean = String(css || '')
    .slice(0, MAX_CUSTOM_LENGTH)
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<!--|-->/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '');
  if (!clean.trim()) return '';
  return `${scope}{${clean}}`;
}
