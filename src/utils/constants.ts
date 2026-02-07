export const NUM_COLORS = 5; // Number of different colors to use for the balls
export const MAX_SEEDS = 1000;   // Max number of balls to place (safety limit)


// Color palette
// TODO: Bad design, don't have duplicate values stored.
// Have it be calculated from a single source of truth
export const PALETTE = [
    { gl: [0.93, 0.32, 0.28], css: "#ed5247" },
    { gl: [0.22, 0.62, 0.89], css: "#389ee3" },
    { gl: [0.20, 0.82, 0.48], css: "#33d17a" },
    { gl: [0.97, 0.78, 0.10], css: "#f8c71a" },
    { gl: [0.62, 0.32, 0.75], css: "#9e52bf" },
];
