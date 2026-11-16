/**
 * Browser-only DOM capture for Tactic Arena screenshots (no third-party library).
 *
 * The rendered panel is cloned with every computed style inlined (only the properties that
 * differ from the user-agent default of the same tag, to keep the payload small), wrapped in
 * an SVG `foreignObject`, rasterised on a canvas and encoded as WebP (PNG when the browser
 * cannot encode WebP). Pseudo-elements with content are reproduced through a generated style
 * sheet; canvases and same-origin images are inlined as data URLs.
 */

const SKIPPED_PROPERTIES = new Set(['transition', 'animation', 'cursor', 'pointer-events', 'will-change']);
const defaultStyleCache = new Map<string, Map<string, string>>();
let sandbox: HTMLIFrameElement | null = null;

export async function captureElement(element: HTMLElement, maxScale = 2): Promise<Blob> {
  if ((document as any).fonts?.ready) await (document as any).fonts.ready;
  const width = Math.ceil(element.scrollWidth || element.getBoundingClientRect().width);
  const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height);
  if (!width || !height) throw new Error('Nothing to capture: the panel has no size.');

  const pseudoRules: string[] = [];
  const clone = cloneWithStyles(element, pseudoRules, { counter: 0 }) as HTMLElement;
  clone.style.setProperty('margin', '0');
  clone.style.setProperty('position', 'static');
  clone.style.setProperty('left', 'auto');
  clone.style.setProperty('top', 'auto');
  clone.style.setProperty('transform', 'none');
  clone.style.setProperty('width', width + 'px');
  // The clone can come out TALLER than the live panel: inside an SVG image the browser may pick
  // other fonts for generic families (e.g. `monospace`), so text wraps differently and rows grow.
  // So the clone keeps its natural height (at least the measured one), it is drawn on a generous
  // canvas, and the empty rows below the content are trimmed away afterwards.
  clone.style.setProperty('height', 'auto');
  clone.style.setProperty('min-height', height + 'px');
  clone.style.setProperty('overflow', 'visible');
  // The panel's outer wrappers carry their live pixel height; let them grow with the clone too,
  // so their background still covers rows that came out taller.
  let wrapper = clone.firstElementChild as HTMLElement | null;
  for (let depth = 0; wrapper && depth < 3; depth++) {
    const live = wrapper.style.getPropertyValue('height');
    // Boxes that clip or scroll by design (the tactics page shell) keep their fixed size.
    const clips = /hidden|auto|scroll|clip/.test(wrapper.style.getPropertyValue('overflow-y') || wrapper.style.getPropertyValue('overflow'));
    if (live && !clips) {
      wrapper.style.setProperty('min-height', live);
      wrapper.style.setProperty('height', 'auto');
    }
    wrapper = wrapper.firstElementChild as HTMLElement | null;
  }
  if (pseudoRules.length) {
    const style = document.createElement('style');
    style.textContent = pseudoRules.join('\n');
    clone.insertBefore(style, clone.firstChild);
  }
  await inlineImages(clone);

  const background = pageBackground(element);
  const drawHeight = Math.ceil(height * 1.5) + 400;
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${drawHeight}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const image = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

  // Canvas sides stay well under the browsers' limits.
  const scale = Math.min(maxScale, Math.max(1, window.devicePixelRatio || 1), 16000 / drawHeight);
  const full = document.createElement('canvas');
  full.width = Math.round(width * scale);
  full.height = Math.round(drawHeight * scale);
  const fullContext = full.getContext('2d');
  if (!fullContext) throw new Error('Canvas 2D context unavailable.');
  fullContext.fillStyle = background;
  fullContext.fillRect(0, 0, full.width, full.height);
  fullContext.scale(scale, scale);
  fullContext.drawImage(image, 0, 0, width, drawHeight);

  const contentRows = lastContentRow(fullContext, full.width, full.height) + 1;
  const finalHeight = Math.min(full.height, Math.max(Math.round(height * scale), contentRows + Math.round(8 * scale)));
  const canvas = document.createElement('canvas');
  canvas.width = full.width;
  canvas.height = finalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.drawImage(full, 0, 0);

  const webp = await toBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return webp;
  const png = await toBlob(canvas, 'image/png');
  if (!png) throw new Error('The browser could not encode the capture.');
  return png;
}

/** Index of the lowest canvas row that differs from the background (the bottom-right pixel). */
function lastContentRow(context: CanvasRenderingContext2D, width: number, height: number): number {
  const corner = context.getImageData(width - 1, height - 1, 1, 1).data;
  const [r, g, b] = [corner[0], corner[1], corner[2]];
  const strip = 256;
  // Scanned bottom-up in strips, so a tall capture never needs one huge pixel buffer.
  for (let bottom = height; bottom > 0; bottom -= strip) {
    const top = Math.max(0, bottom - strip);
    const data = context.getImageData(0, top, width, bottom - top).data;
    for (let y = bottom - top - 1; y >= 0; y--) {
      const row = y * width * 4;
      for (let x = 0; x < width; x += 2) {
        const i = row + x * 4;
        if (Math.abs(data[i] - r) > 6 || Math.abs(data[i + 1] - g) > 6 || Math.abs(data[i + 2] - b) > 6) return top + y;
      }
    }
  }
  return 0;
}

function cloneWithStyles(source: Node, pseudoRules: string[], ids: { counter: number }): Node {
  if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || '');
  if (source.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
  const element = source as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'link') return document.createTextNode('');

  if (element instanceof HTMLCanvasElement) {
    const img = document.createElement('img');
    try { img.src = element.toDataURL(); } catch { /* tainted canvas: leave empty */ }
    copyStyles(element, img, 'canvas');
    return img;
  }

  const copy = element.cloneNode(false) as Element;
  copy.removeAttribute('id');
  copyStyles(element, copy, tag);

  if (element instanceof HTMLInputElement) copy.setAttribute('value', element.value);
  if (element instanceof HTMLTextAreaElement) copy.textContent = element.value;
  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions?.[0]?.textContent || '';
    const span = document.createElement('span');
    copyStyles(element, span, 'select');
    span.style.setProperty('display', 'inline-block');
    span.textContent = selected;
    return span;
  }

  for (const pseudo of ['::before', '::after']) {
    const style = getComputedStyle(element, pseudo);
    const content = style.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') continue;
    const className = `cap-${ids.counter++}`;
    copy.setAttribute('class', `${copy.getAttribute('class') || ''} ${className}`.trim());
    const declarations: string[] = [];
    for (let index = 0; index < style.length; index++) {
      const property = style[index];
      if (property.startsWith('--')) continue;
      declarations.push(`${property}:${style.getPropertyValue(property)}`);
    }
    pseudoRules.push(`.${className}${pseudo}{${declarations.join(';')}}`);
  }

  element.childNodes.forEach(child => {
    const childCopy = cloneWithStyles(child, pseudoRules, ids);
    copy.appendChild(childCopy);
  });
  return copy;
}

function copyStyles(source: Element, target: Element, tag: string): void {
  const computed = getComputedStyle(source);
  const defaults = defaultStyles(source instanceof SVGElement ? source.tagName : tag, source instanceof SVGElement);
  const declarations: string[] = [];
  for (let index = 0; index < computed.length; index++) {
    const property = computed[index];
    if (property.startsWith('--') || SKIPPED_PROPERTIES.has(property)) continue;
    const value = computed.getPropertyValue(property);
    if (defaults.get(property) === value) continue;
    if (property === 'font-family' && value.trim() === 'monospace') {
      declarations.push('font-family:Consolas, "Cascadia Mono", "Courier New", monospace');
      continue;
    }
    declarations.push(`${property}:${value}`);
  }
  target.setAttribute('style', declarations.join(';'));
}

function defaultStyles(tag: string, svg: boolean): Map<string, string> {
  const key = (svg ? 'svg:' : '') + tag;
  const cached = defaultStyleCache.get(key);
  if (cached) return cached;
  const frameDocument = sandboxDocument();
  const result = new Map<string, string>();
  if (frameDocument) {
    const element = svg
      ? frameDocument.createElementNS('http://www.w3.org/2000/svg', tag)
      : frameDocument.createElement(tag);
    const host = svg ? frameDocument.createElementNS('http://www.w3.org/2000/svg', 'svg') : null;
    if (host) { host.appendChild(element); frameDocument.body.appendChild(host); }
    else frameDocument.body.appendChild(element);
    const style = frameDocument.defaultView!.getComputedStyle(element);
    for (let index = 0; index < style.length; index++) {
      result.set(style[index], style.getPropertyValue(style[index]));
    }
    (host || element).remove();
  }
  defaultStyleCache.set(key, result);
  return result;
}

function sandboxDocument(): Document | null {
  if (!sandbox) {
    sandbox = document.createElement('iframe');
    sandbox.setAttribute('aria-hidden', 'true');
    sandbox.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden';
    document.body.appendChild(sandbox);
  }
  return sandbox.contentDocument;
}

async function inlineImages(root: Element): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async img => {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      img.setAttribute('src', await blobToDataUrl(blob));
    } catch {
      img.removeAttribute('src');
    }
  }));
}

function pageBackground(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color)) return color;
    current = current.parentElement;
  }
  return '#1a1d2e';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The captured panel could not be rasterised.'));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
