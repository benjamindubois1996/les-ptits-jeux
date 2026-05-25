/**
 * extract-words.js
 * Convertit un dictionnaire Hunspell (.dic) en JSON groupé par longueur.
 * Conçu pour être réutilisé pour n'importe quelle langue.
 *
 * Usage :
 *   node tools/extract-words.js --lang fr --input fr.dic
 *   node tools/extract-words.js --lang en --input en_US.dic
 *   node tools/extract-words.js --lang es --input es_ES.dic
 *
 * Options :
 *   --lang   <code>   Code langue ISO (fr, en, es, de…)  [obligatoire]
 *   --input  <path>   Chemin vers le .dic                [défaut : <lang>.dic à la racine]
 *   --min    <n>      Longueur minimale des mots          [défaut : 2]
 *   --max    <n>      Longueur maximale des mots          [défaut : 15]
 *
 * Sortie :
 *   games/wordle/data/words-<lang>.json
 *   tools/stats-<lang>.txt
 */

const fs   = require('fs');
const path = require('path');

/* ============================================================
   PARSING DES ARGUMENTS
   ============================================================ */

const args = process.argv.slice(2);
const get  = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : fallback;
};

const LANG    = get('--lang',  null);
const MIN_LEN = parseInt(get('--min', '2'),  10);
const MAX_LEN = parseInt(get('--max', '15'), 10);

if (!LANG) {
  console.error('❌  Paramètre --lang manquant.');
  console.error('   Exemple : node tools/extract-words.js --lang fr --input fr.dic');
  process.exit(1);
}

const DEFAULT_INPUT = path.join(__dirname, '..', `${LANG}.dic`);
const INPUT_PATH    = path.resolve(get('--input', DEFAULT_INPUT));

const ROOT     = path.join(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'games', 'wordle', 'data');
const OUT_JSON = path.join(OUT_DIR, `words-${LANG}.json`);
const OUT_STATS= path.join(__dirname, `stats-${LANG}.txt`);

/* ============================================================
   ALPHABETS PAR LANGUE
   Chaque langue définit les lettres autorisées (regex).
   Ajoute d'autres langues ici au besoin.
   ============================================================ */

const ALPHABETS = {
  fr: /^[A-ZÀÂÄÇÉÈÊËÎÏÔÙÛÜŸŒÆ]+$/,
  en: /^[A-Z]+$/,
  es: /^[A-ZÁÉÍÓÚÜÑ]+$/,
  de: /^[A-ZÄÖÜẞ]+$/,
  it: /^[A-ZÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜ]+$/,
  pt: /^[A-ZÁÂÃÀÇÉÊÍÓÔÕÚ]+$/,
};

const ALLOWED = ALPHABETS[LANG] || /^[A-Z]+$/;
if (!ALPHABETS[LANG]) {
  console.warn(`⚠️   Alphabet non défini pour "${LANG}", utilisation de A-Z uniquement.`);
  console.warn('    Ajoute une entrée dans ALPHABETS dans extract-words.js si besoin.\n');
}

/* ============================================================
   LECTURE & TRAITEMENT
   ============================================================ */

console.log(`\n📖  Lecture de ${INPUT_PATH}…`);

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`❌  Fichier introuvable : ${INPUT_PATH}`);
  console.error('    Vérifie le chemin ou utilise --input <chemin>');
  process.exit(1);
}

const raw   = fs.readFileSync(INPUT_PATH, 'utf8');
const lines = raw.split('\n');
console.log(`    ${lines.length} lignes brutes\n`);

const byLength   = {};
let totalKept    = 0;
let totalSkipped = 0;

lines.forEach((line, idx) => {
  if (idx === 0) return; // Ligne 0 = nombre d'entrées Hunspell

  const slashIdx = line.indexOf('/');
  const word     = (slashIdx === -1 ? line : line.slice(0, slashIdx)).trim();
  const upper    = word.toUpperCase();

  if (!ALLOWED.test(upper)) { totalSkipped++; return; }

  const len = upper.length;
  if (len < MIN_LEN || len > MAX_LEN) { totalSkipped++; return; }

  if (!byLength[len]) byLength[len] = new Set();
  byLength[len].add(upper);
  totalKept++;
});

/* ============================================================
   CONVERSION Set → Array trié + export JSON
   ============================================================ */

const result  = {};
const lengths = Object.keys(byLength).map(Number).sort((a, b) => a - b);
lengths.forEach(len => {
  result[len] = [...byLength[len]].sort();
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(result), 'utf8'); // minifié (peut être lourd)
console.log(`✅  words-${LANG}.json → ${OUT_JSON}`);

/* ============================================================
   STATS
   ============================================================ */

let stats = `STATS — ${LANG.toUpperCase()} — mots par longueur\n${'='.repeat(44)}\n`;
lengths.forEach(len => {
  const count = result[len].length;
  const bar   = '█'.repeat(Math.min(30, Math.round(count / 150)));
  stats += `  ${String(len).padStart(2)} lettres : ${String(count).padStart(6)} mots  ${bar}\n`;
});
stats += `${'='.repeat(44)}\n`;
stats += `  Total gardés  : ${totalKept}\n`;
stats += `  Total ignorés : ${totalSkipped}\n`;

fs.writeFileSync(OUT_STATS, stats, 'utf8');
console.log(`📊  stats-${LANG}.txt   → ${OUT_STATS}\n`);
console.log(stats);
