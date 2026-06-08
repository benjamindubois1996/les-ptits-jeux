/**
 * GridUtils — Utilitaires de grille 2D partagés
 *
 * Usage :
 *   import { posEquals, isOutOfBounds, getNeighbors } from '../../js/utils/GridUtils.js';
 *
 *   posEquals({ x:1, y:2 }, { x:1, y:2 })   → true
 *   isOutOfBounds({ x:10, y:0 }, 8)          → true
 *   getNeighbors(3, 3, 8, 8)                 → [[2,2],[3,2],[4,2], ...]
 */

/**
 * Deux positions de grille sont-elles identiques ?
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function posEquals(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * Une position est-elle hors des limites d'une grille carrée ?
 * @param {{ x: number, y: number }} pos
 * @param {number} size — taille de la grille (carrée)
 */
export function isOutOfBounds({ x, y }, size) {
  return x < 0 || x >= size || y < 0 || y >= size;
}

/**
 * Une position est-elle hors des limites d'une grille rectangulaire ?
 * @param {{ x: number, y: number }} pos
 * @param {number} cols
 * @param {number} rows
 */
export function isOutOfBoundsRect({ x, y }, cols, rows) {
  return x < 0 || x >= cols || y < 0 || y >= rows;
}

/**
 * Retourne les voisins valides (8 directions) d'une cellule dans une grille rectangulaire.
 * @param {number} col
 * @param {number} row
 * @param {number} cols  — largeur de la grille
 * @param {number} rows  — hauteur de la grille
 * @returns {Array<[number, number]>} liste de [col, row]
 */
export function getNeighbors(col, row, cols, rows) {
  const neighbors = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nc = col + dc;
      const nr = row + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
        neighbors.push([nc, nr]);
      }
    }
  }
  return neighbors;
}

/**
 * Crée une grille 2D vide (tableau de tableaux).
 * @param {number} rows
 * @param {number} cols
 * @param {*} fill — valeur par défaut (default: null)
 */
export function createGrid(rows, cols, fill = null) {
  return Array.from({ length: rows }, () => new Array(cols).fill(fill));
}
