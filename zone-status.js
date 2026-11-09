/* Shared public-view status styles. No feature-service schema changes. */
(function (global) {
  'use strict';
  const styles = Object.freeze({
    Set: { fill: '#fff36a', stroke: '#967800', label: 'Set', text: '#413500' },
    Go: { fill: '#41f56e', stroke: '#15803d', label: 'Go', text: '#124726' },
    Shelter: { fill: '#b79ae8', stroke: '#7140ad', label: 'Shelter', text: '#48256e' },
    Planning: { fill: '#b8bec7', stroke: '#667180', label: 'Planning / All clear', text: '#313c49' }
  });
  function key(value) {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'set') return 'Set';
    if (status === 'go') return 'Go';
    if (['shelter', 'shelter-in-place', 'shelter in place'].includes(status)) return 'Shelter';
    return 'Planning';
  }
  function renderer(field) {
    const f = '$feature[' + JSON.stringify(field) + ']';
    return {
      type: 'unique-value',
      valueExpression: 'Decode(Lower(Trim(Text(' + f + '))), "set", "Set", "go", "Go", "shelter", "Shelter", "shelter-in-place", "Shelter", "shelter in place", "Shelter", "Planning")',
      uniqueValueInfos: Object.entries(styles).map(([value, style]) => ({ value, label: style.label, symbol: { type: 'simple-fill', color: style.fill + '80', outline: { color: style.stroke, width: 1.8 } } })),
      defaultSymbol: { type: 'simple-fill', color: '#b8bec780', outline: { color: '#667180', width: 1.8 } }
    };
  }
  global.ReadyLaPlataZones = Object.freeze({ styles, key, renderer });
})(window);
