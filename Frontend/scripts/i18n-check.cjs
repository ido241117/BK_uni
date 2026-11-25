/*
 * Lists every translation key used in src/ and reports the ones missing from src/i18n/en.json.
 *   npm run i18n:check            -> report missing keys (exit 1 if any)
 *   npm run i18n:check -- --write -> also write the missing keys to scripts/i18n-missing.json (Vietnamese -> "")
 * Keys are the Vietnamese text: t('...'), i18n.t('...'), Vietnamese strings inside trLive(...) data, and module-level
 * string constants passed to i18n.t(CONST).
 */
const fs = require('fs');
const path = require('path');

const VI = /[À-ỹ]/;
const root = path.resolve(__dirname, '..', 'src');
const files = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|)$/.test(entry.name) && /\.tsx?$/.test(entry.name)) files.push(full);
});
walk(root);

const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const keys = new Set();
const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;

for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(new RegExp(String.raw`\b(?:i18n\.)?t\(\s*(?:${STRING})`, 'g'))) {
        keys.add(unescape(m[1] ?? m[2]));
    }
    // Vietnamese strings inside trLive( ... ): balanced scan from each trLive(
    let at = text.indexOf('trLive(');
    while (at !== -1) {
        let i = at + 'trLive('.length;
        let depth = 1;
        let inStr = null;
        const start = i;
        for (; i < text.length && depth; i++) {
            const c = text[i];
            if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
            if (c === "'" || c === '"' || c === '`') inStr = c;
            else if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; }
            else if ('([{'.includes(c)) depth++;
            else if (')]}'.includes(c)) depth--;
        }
        const body = text.slice(start, i).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of body.matchAll(new RegExp(STRING, 'g'))) {
            const value = unescape(m[1] ?? m[2]);
            if (VI.test(value)) keys.add(value);
        }
        at = text.indexOf('trLive(', i);
    }
    // const X = '...' used as i18n.t(X)
    for (const m of text.matchAll(/\bi18n\.t\(([A-Z_][A-Z0-9_]*)\)/g)) {
        const decl = new RegExp(String.raw`const ${m[1]}\s*=\s*(?:${STRING})`).exec(text);
        if (decl) keys.add(unescape(decl[1] ?? decl[2]));
    }
}

const enPath = path.join(root, 'i18n', 'en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const all = [...keys].filter(k => k.trim());
const missing = all.filter(k => !(k in en));
const unused = Object.keys(en).filter(k => !keys.has(k));
console.log(`keys: ${all.length}, translated: ${all.length - missing.length}, missing: ${missing.length}, unused in en.json: ${unused.length}`);
if (process.argv.includes('--write')) {
    const out = path.join(__dirname, 'i18n-missing.json');
    fs.writeFileSync(out, JSON.stringify(Object.fromEntries(missing.sort().map(k => [k, ''])), null, 2) + '\n');
    console.log(`wrote ${out}`);
} else if (missing.length) {
    console.log(missing.slice(0, 40).map(k => `  - ${k}`).join('\n'));
}
if (unused.length) console.log(`unused (safe to delete from en.json):\n${unused.map(k => `  - ${k}`).join('\n')}`);
process.exit(missing.length ? 1 : 0);
