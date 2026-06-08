/**
 * Random — Utilitaires aléatoires partagés
 *
 * Usage :
 *   import { randInt, randChoice, shuffle } from '../../js/utils/Random.js';
 *
 *   randInt(6)          → 0..5
 *   randChoice(arr)     → élément aléatoire du tableau
 *   shuffle(arr)        → mélange in-place (Fisher-Yates), retourne arr
 */

/** Entier aléatoire entre 0 (inclus) et max (exclus) */
export function randInt(max) {
  return Math.floor(Math.random() * max);
}

/** Élément aléatoire d'un tableau */
export function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Mélange un tableau in-place (Fisher-Yates) et le retourne.
 * Ne crée pas de copie — modifier le tableau original.
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
