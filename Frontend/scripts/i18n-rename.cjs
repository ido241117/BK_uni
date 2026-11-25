/*
 * Change a piece of UI text everywhere in one step. The Vietnamese text is the translation key (src/i18n/index.ts),
 * so a wording change must touch every call site and the key in en.json; this does both.
 *
 *   npm run i18n:rename -- "old Vietnamese" "new Vietnamese"                 rename; English stays
 *   npm run i18n:rename -- "old Vietnamese" "new Vietnamese" --en "English"  rename and set the English
 *   npm run i18n:rename -- "Vietnamese" "Vietnamese" --en "New English"      change only the English
 *   add --dry to preview without writing
 *
 * What it changes: every string literal in src/**\/*.{ts,tsx} whose text is exactly the old key (t('…'), i18n.t('…'),
 * trLive(...) data, constants), in any quote style; and the key in src/i18n/en.json, kept in place. It prints each
 * file:line it changed, so a literal that is really data (compared with the backend) can be spotted and reverted.
 * Refuses when the new key already exists in en.json with a different English text. Run `npm run i18n:check` after.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const enIndex = args.indexOf('--en');
const english = enIndex >= 0 ? args[enIndex + 1] : undefined;
const positional = args.filter((a, i) => a !== '--dry' && (enIndex < 0 || (i !== enIndex && i !== enIndex + 1)));
const [oldKey, newKey] = positional;

if (!oldKey || newKey === undefined || (enIndex >= 0 && english === undefined)) {
    console.error('Usage: npm run i18n:rename -- "old text" "new text" [--en "English"] [--dry]');
    process.exit(2);
}

const root = path.resolve(__dirname, '..', 'src');
const enPath = path.join(root, 'i18n', 'en.json');

// Source text of a literal with the given quote: escape backslashes, the quote itself and newlines.
const encode = (text, quote) => text.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`).replace(/\n/g, '\\n');
const placeholders = (text) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort().join(',');

if (placeholders(oldKey) !== placeholders(newKey)) {
    console.warn(`Warning: placeholders differ: "${placeholders(oldKey)}" -> "${placeholders(newKey)}". Check the t() arguments.`);
}

// ---- source files
const files = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
});
walk(root);

// Every check runs and every edit is computed in memory first; files are written only at the end, all or nothing.
let sourceHits = 0;
const changedFiles = [];
const pendingWrites = [];
if (oldKey !== newKey) {
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        let next = text;
        const lines = new Set();
        for (const quote of ["'", '"', '`']) {
            const needle = quote + encode(oldKey, quote) + quote;
            if (quote === '`' && /\$\{/.test(oldKey)) continue; // template literal with expressions: not a plain key
            let index = next.indexOf(needle);
            while (index >= 0) {
                lines.add(next.slice(0, index).split('\n').length);
                const replacement = quote + encode(newKey, quote) + quote;
                next = next.slice(0, index) + replacement + next.slice(index + needle.length);
                sourceHits += 1;
                index = next.indexOf(needle, index + replacement.length);
            }
        }
        if (next !== text) {
            changedFiles.push(file);
            for (const line of [...lines].sort((a, b) => a - b)) console.log(`  ${path.relative(path.resolve(root, '..'), file)}:${line}`);
            pendingWrites.push([file, next]);
        }
    }
}

// ---- en.json (keep key order and 2-space format)
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hadOld = Object.prototype.hasOwnProperty.call(en, oldKey);
if (oldKey !== newKey && Object.prototype.hasOwnProperty.call(en, newKey)) {
    const target = english ?? en[oldKey];
    if (en[newKey] !== target) {
        console.error(`Refused: "${newKey}" already exists in en.json with a different English text ("${en[newKey]}").`);
        console.error('Pass --en with the text you want, or rename to a different key.');
        process.exit(1);
    }
}
const out = {};
for (const [key, value] of Object.entries(en)) {
    if (key === oldKey) out[newKey] = english ?? value;
    else if (key !== newKey) out[key] = value;
    else if (!hadOld) out[key] = english ?? value;
}
if (!hadOld && english !== undefined && !Object.prototype.hasOwnProperty.call(out, newKey)) out[newKey] = english;
const enChanged = JSON.stringify(out) !== JSON.stringify(en);
if (!sourceHits && !hadOld) {
    console.error(`Not found: "${oldKey}" is neither in src/ nor in en.json.`);
    process.exit(1);
}

if (!dry) {
    for (const [file, text] of pendingWrites) fs.writeFileSync(file, text);
    if (enChanged) fs.writeFileSync(enPath, `${JSON.stringify(out, null, 2)}\n`);
}
console.log(`${dry ? '[dry run] would change' : 'Changed'} ${sourceHits} literal(s) in ${changedFiles.length} file(s)`
    + `${enChanged ? '; en.json updated' : hadOld ? '' : '; key was not in en.json (add the English with --en)'}.`);
if (!dry) console.log('Next: npm run i18n:check');
