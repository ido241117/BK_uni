/*
 * Checks the palette in src/styles/tokens.css against the rules in ui-docs/DESIGN-SYSTEM.md §1.3 (both themes):
 *   - every text token >= 4.5:1 on every surface (canvas, blush, elevated, tint-hover)
 *   - semantic colors >= 4.5:1 on their own wash; text on filled accents >= 4.5:1
 *   - non-text cues a user needs (ink-soft edges, focus ring) >= 3:1 on every surface
 *   - ink-muted stays a visible step above ink-soft (contrast ratio >= 1.2x)
 * Decorative tokens (sparkle, lines, illustration fill) and disabled ink are reported, not checked.
 *   npm run contrast:check   -> prints the tables, exits 1 if a rule fails
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');
const block = (selector) => {
    const start = css.indexOf(selector);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
};
const light = block(':root {');
const themes = { light, dark: { ...light, ...block("[data-theme='dark'] {") } };

const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const SURFACES = ['bg-canvas', 'bg-blush', 'bg-elevated', 'bg-tint-hover'];
const TEXT = ['ink-primary', 'ink-muted', 'ink-soft', 'accent-rose', 'accent-brand', 'sem-good', 'sem-warn', 'sem-err'];
const NON_TEXT = ['ink-soft', 'focus-ring'];
const DECORATIVE = ['accent-sparkle', 'line-chrome', 'line-hairline', 'illus-fold', 'ink-disabled'];

let failures = 0;
const check = (ok, label) => { if (!ok) { failures += 1; console.log(`  FAIL ${label}`); } };
const fmt = (v) => v.toFixed(2).padStart(6);

for (const [name, t] of Object.entries(themes)) {
    console.log(`\n${name.toUpperCase()}  text >= 4.5 on every surface`);
    console.log(`${''.padEnd(14)}${SURFACES.map(s => s.replace('bg-', '').padStart(12)).join('')}`);
    for (const token of TEXT) {
        const values = SURFACES.map(s => ratio(t[token], t[s]));
        console.log(`${token.padEnd(14)}${values.map(v => `${fmt(v)}${v >= 4.5 ? '      ' : '  FAIL'}`).join('')}`);
        values.forEach((v, i) => check(v >= 4.5, `${name}: ${token} on ${SURFACES[i]} = ${v.toFixed(2)}`));
    }
    console.log('pairs');
    for (const [fg, bg, min] of [
        ['sem-good', 'sem-good-bg', 4.5], ['sem-warn', 'sem-warn-bg', 4.5], ['sem-err', 'sem-err-bg', 4.5],
        ['ink-inverse', 'accent-rose', 4.5], ['ink-inverse', 'accent-rose-hover', 4.5],
    ]) {
        const v = ratio(t[fg], t[bg]);
        console.log(`  ${`${fg} on ${bg}`.padEnd(34)}${fmt(v)}  (>= ${min})`);
        check(v >= min, `${name}: ${fg} on ${bg} = ${v.toFixed(2)}`);
    }
    console.log('non-text >= 3 on every surface (worst surface shown)');
    for (const token of NON_TEXT) {
        const worst = Math.min(...SURFACES.map(s => ratio(t[token], t[s])));
        console.log(`  ${token.padEnd(34)}${fmt(worst)}`);
        check(worst >= 3, `${name}: ${token} worst = ${worst.toFixed(2)}`);
    }
    const step = ratio(t['ink-muted'], t['bg-canvas']) / ratio(t['ink-soft'], t['bg-canvas']);
    console.log(`  muted / soft step${''.padEnd(17)}${fmt(step)}x (>= 1.2)`);
    check(step >= 1.2, `${name}: muted/soft step = ${step.toFixed(2)}`);
    console.log('decorative (not checked; must never carry meaning alone), on canvas');
    for (const token of DECORATIVE) console.log(`  ${token.padEnd(34)}${fmt(ratio(t[token], t['bg-canvas']))}`);
}

console.log(failures ? `\n${failures} rule(s) failed` : '\nAll contrast rules pass');
process.exit(failures ? 1 : 0);
