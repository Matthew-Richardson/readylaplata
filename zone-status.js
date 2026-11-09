/* Shared public-view status styles. No feature-service schema changes. */
(function (global) {
  'use strict';
  const styles = Object.freeze({
    Set: { fill: '#fff36a', stroke: '#967800', label: 'Set', text: '#413500' },
    Go: { fill: '#41f56e', stroke: '#15803d', label: 'Go', text: '#124726' },
    Shelter: { fill: '#8dc8f8', stroke: '#1e6eb6', label: 'Shelter', text: '#124d7d' },
    Access: { fill: '#d9c5f4', stroke: '#824ab6', label: 'Access Impact Area', text: '#593278', hatch: true },
    Planning: { fill: '#b8bec7', stroke: '#667180', label: 'Planning', text: '#313c49' }
  });
  function key(value) {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'set') return 'Set';
    if (status === 'go') return 'Go';
    if (['shelter', 'shelter-in-place', 'shelter in place'].includes(status)) return 'Shelter';
    if (['access','access impact area','road closure area','road access impact','isolated'].includes(status)) return 'Access';
    return 'Planning';
  }
  function renderer(field) {
    const f = '$feature[' + JSON.stringify(field) + ']';
    return {
      type: 'unique-value',
      valueExpression: 'Decode(Lower(Trim(Text(' + f + '))), "set", "Set", "go", "Go", "shelter", "Shelter", "shelter-in-place", "Shelter", "shelter in place", "Shelter", "access", "Access", "access impact area", "Access", "road closure area", "Access", "road access impact", "Access", "isolated", "Access", "Planning")',
      uniqueValueInfos: Object.entries(styles).map(([value, style]) => ({ value, label: style.label, symbol: { type: 'simple-fill', color: style.fill + '80', style: style.hatch ? 'backward-diagonal' : 'solid', outline: { color: style.stroke, width: 1.8 } } })),
      defaultSymbol: { type: 'simple-fill', color: '#b8bec780', outline: { color: '#667180', width: 1.8 } }
    };
  }
  // Public Leaflet Path API; SVG patterns do not require WebGL or another plugin.
  let patternNumber = 0;
  function applyHatch(layer, value) {
    if (key(value) !== 'Access' || !layer.getElement) return;
    const path = layer.getElement(), svg = path && path.ownerSVGElement;
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    let defs = svg.querySelector('defs[data-access-pattern]');
    if (!defs) {
      defs = document.createElementNS(ns,'defs');
      defs.setAttribute('data-access-pattern','true');
      const pattern = document.createElementNS(ns,'pattern');
      const id = 'access-impact-hatch-' + (++patternNumber);
      pattern.setAttribute('id',id);pattern.setAttribute('width','9');pattern.setAttribute('height','9');pattern.setAttribute('patternUnits','userSpaceOnUse');
      const background = document.createElementNS(ns,'rect');
      background.setAttribute('width','9');background.setAttribute('height','9');background.setAttribute('fill','#f4eafa');
      const stripe = document.createElementNS(ns,'path');
      stripe.setAttribute('d','M-2 2L2-2 M0 9L9 0 M7 11L11 7');stripe.setAttribute('stroke','#824ab6');stripe.setAttribute('stroke-width','2');
      pattern.append(background,stripe);defs.appendChild(pattern);svg.insertBefore(defs,svg.firstChild);
    }
    path.setAttribute('fill','url(#'+defs.querySelector('pattern').id+')');
    path.setAttribute('fill-opacity','0.65');
  }
  global.ReadyLaPlataZones = Object.freeze({ styles, key, renderer, applyHatch });
})(window);
