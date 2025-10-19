// src/solver.ts
import { Target, UsedCounts } from "./types";

export enum SolverMode {
	ANY_TILE = "any_tile",
	HIGHEST_SCORE = "highest_score"
}

export interface SolverResult {
	bestFace: number | null;
	report: string;
	probs: Record<number, number>;
	choices: Record<
		number,
		{
			count: number;
			immediateScore: number;
			remainingDice: number;
			successProb: number;
			expectedValue?: number; // for highest score mode
		}
	>;
	mode: SolverMode;
}

export interface MultiModeSolverResult {
	anyTile: SolverResult;
	highestScore: SolverResult;
	bestTiles: {
		anyTile: number[];
		highestScore: number[];
		combined: number[];
	};
}

const factorialCache: number[] = [1];
function fact(n: number): number {
	for (let i = factorialCache.length; i <= n; i++) factorialCache[i] = factorialCache[i - 1] * i;
	return factorialCache[n];
}

export function buildDefaultTargets(): Target[] {
	const out: Target[] = [];
	for (let v = 21; v <= 36; v++) {
		let pts = 1;
		if (v >= 33) pts = 4;
		else if (v >= 29) pts = 3;
		else if (v >= 25) pts = 2;
		out.push({ value: v, pts, canOvershoot: true });
	}
	return out;
}

export function faceValue(face: number): number {
	return face === 6 ? 5 : face;
}

export function computeCurrentScore(usedCounts: UsedCounts): number {
	let s = 0;
	for (const kStr in usedCounts) {
		const f = Number(kStr);
		const c = usedCounts[f] || 0;
		s += faceValue(f) * c;
	}
	return s;
}

export function findEligibleTiles(score: number, targets: Target[]): Target[] {
	const elig: Target[] = [];
	for (const t of targets) {
		if (t.canOvershoot) {
			if (score >= t.value) elig.push(t);
		} else {
			if (score === t.value) elig.push(t);
		}
	}
	// sort by value desc (prefer higher tile)
	elig.sort((a, b) => b.value - a.value || b.pts - a.pts);
	return elig;
}

/**
 * Exact solver:
 * - Given the current roll (array of faces), targets, and usedCounts,
 *   compute for each legal face in the current roll the exact probability
 *   of eventually succeeding (claiming or stealing any tile) if you pick
 *   that face now and thereafter play optimally.
 *
 * - The probability computation is exact (combinatorial) for up to 8 dice.
 *
 * Returns:
 *   { bestFace, report, probs }
 */
export function solve(
	rolls: number[],
	targets: Target[],
	usedCounts: UsedCounts,
	mode: SolverMode = SolverMode.ANY_TILE
): SolverResult {
	// build roll counter and base masks
	const rollCounter: Record<number, number> = {};
	for (let f = 1; f <= 6; f++) rollCounter[f] = 0;
	for (const r of rolls) {
		if (r >= 1 && r <= 6) rollCounter[r] = (rollCounter[r] || 0) + 1;
	}

	// convert usedCounts to used mask (bits 1..6 mapped to bits 0..5)
	let baseUsedMask = 0;
	for (let f = 1; f <= 6; f++) {
		if ((usedCounts as any)[f] && (usedCounts as any)[f] > 0) baseUsedMask |= 1 << (f - 1);
	}

	const currentScore = computeCurrentScore(usedCounts);
	const nDiceNow = 8 - Object.values(usedCounts).reduce((a, b) => a + (b || 0), 0);

	// helper to test success condition given a score and used mask
	function isSuccess(score: number, usedMask: number): boolean {
		// require at least one worm used (face 6)
		const hasWorm = (usedMask & (1 << (6 - 1))) !== 0;
		if (!hasWorm) return false;
		const elig = findEligibleTiles(score, targets);
		return elig.length > 0;
	}

	// helper to get expected value of best available tile for highest score mode
	function getBestTileValue(score: number, usedMask: number): number {
		const hasWorm = (usedMask & (1 << (6 - 1))) !== 0;
		if (!hasWorm) return 0;
		const elig = findEligibleTiles(score, targets);
		if (elig.length === 0) return 0;
		// Return the points of the highest value tile available
		return elig[0].pts;
	}

	// enumerate multinomial count vectors for n dice across 6 faces
	function* genCountVectors(n: number, faces = 6): Generator<number[]> {
		// recursive composition generator
		const out: number[] = Array(faces).fill(0);
		function helper(pos: number, remaining: number) {
			if (pos === faces - 1) {
				out[pos] = remaining;
				const copy = out.slice();
				yieldVectors.push(copy);
				return;
			}
			for (let k = 0; k <= remaining; k++) {
				out[pos] = k;
				helper(pos + 1, remaining - k);
			}
		}
		// Because TypeScript generators don't allow nested yield easily in this style,
		// implement by capturing results into an array and then iterating.
		const yieldVectors: number[][] = [];
		(function runHelper() {
			function inner(pos: number, remaining: number) {
				if (pos === faces - 1) {
					out[pos] = remaining;
					yieldVectors.push(out.slice());
					return;
				}
				for (let k = 0; k <= remaining; k++) {
					out[pos] = k;
					inner(pos + 1, remaining - k);
				}
			}
			inner(0, n);
		})();
		for (const v of yieldVectors) yield v;
	}

	// memoization map for probSuccess: key => probability or expected value
	const probMemo = new Map<string, number>();

	function probSuccess(remainingDice: number, score: number, usedMask: number): number {
		const key = `${remainingDice}|${score}|${usedMask}|${mode}`;
		if (probMemo.has(key)) return probMemo.get(key)!;

		// if already success, probability is 1 for ANY_TILE mode, expected value for HIGHEST_SCORE mode
		if (isSuccess(score, usedMask)) {
			const result = mode === SolverMode.ANY_TILE ? 1.0 : getBestTileValue(score, usedMask);
			probMemo.set(key, result);
			return result;
		}

		// no dice left and not successful -> 0
		if (remainingDice === 0) {
			probMemo.set(key, 0.0);
			return 0.0;
		}

		const n = remainingDice;
		const totalOutcomes = Math.pow(6, n);
		let totalValue = 0;

		// iterate all count vectors (counts[0] = face 1 count, ... counts[5] = face 6 count)
		for (const counts of genCountVectors(n, 6)) {
			// compute multinomial coefficient * (1/6)^n
			let ways = fact(n);
			for (let f = 0; f < 6; f++) {
				ways /= fact(counts[f]);
			}
			const pRoll = ways / totalOutcomes;

			// for this roll, determine legal picks (faces present and not already used)
			let bestPickValueForThisRoll = 0;
			let anyLegal = false;
			for (let face = 1; face <= 6; face++) {
				const cnt = counts[face - 1];
				if (cnt === 0) continue;
				const bit = 1 << (face - 1);
				if ((usedMask & bit) !== 0) continue; // already used this face earlier this turn
				anyLegal = true;

				const add = faceValue(face) * cnt;
				const newScore = score + add;
				const newUsedMask = usedMask | bit;
				const newRemaining = n - cnt;

				let outcomeValue = 0;
				if (isSuccess(newScore, newUsedMask)) {
					outcomeValue = mode === SolverMode.ANY_TILE ? 1.0 : getBestTileValue(newScore, newUsedMask);
				} else {
					if (newRemaining === 0) outcomeValue = 0.0;
					else outcomeValue = probSuccess(newRemaining, newScore, newUsedMask);
				}

				if (mode === SolverMode.ANY_TILE) {
					// For ANY_TILE mode, take the maximum probability
					if (outcomeValue > bestPickValueForThisRoll) bestPickValueForThisRoll = outcomeValue;
				} else {
					// For HIGHEST_SCORE mode, take the maximum expected value
					if (outcomeValue > bestPickValueForThisRoll) bestPickValueForThisRoll = outcomeValue;
				}
			}

			// If no legal picks at all in this roll, the player busts for this roll -> contributes 0
			if (!anyLegal) {
				// contributes zero; skip
			} else {
				totalValue += pRoll * bestPickValueForThisRoll;
			}
		}

		probMemo.set(key, totalValue);
		return totalValue;
	}

	// Build per-face probabilities for the current visible roll: if we pick face f now,
	// compute the probability of eventual success (taking into account remaining dice and optimal play).
	const probs: Record<number, number> = {};
	const choices: Record<
		number,
		{ count: number; immediateScore: number; remainingDice: number; successProb: number; expectedValue?: number }
	> = {};
	let bestFace: number | null = null;
	let bestValue = -1;

	const reportLines: string[] = [];
	for (let f = 1; f <= 6; f++) {
		const count = rollCounter[f] || 0;
		if (count === 0) continue;
		const bit = 1 << (f - 1);
		if ((baseUsedMask & bit) !== 0) {
			// illegal to pick a face already used this turn
			continue;
		}

		const add = faceValue(f) * count;
		const newScore = currentScore + add;
		const newUsedMask = baseUsedMask | bit;
		const newRemaining = nDiceNow - count;

		let value = 0;
		if (isSuccess(newScore, newUsedMask)) {
			value = mode === SolverMode.ANY_TILE ? 1.0 : getBestTileValue(newScore, newUsedMask);
		} else {
			if (newRemaining === 0) value = 0.0;
			else value = probSuccess(newRemaining, newScore, newUsedMask);
		}

		probs[f] = value;
		const choiceData = {
			count,
			immediateScore: newScore,
			remainingDice: newRemaining,
			successProb: mode === SolverMode.ANY_TILE ? value : value > 0 ? 1.0 : 0.0, // For display purposes
			...(mode === SolverMode.HIGHEST_SCORE && { expectedValue: value })
		};
		choices[f] = choiceData;

		const modeLabel = mode === SolverMode.ANY_TILE ? "successProb" : "expectedValue";
		const displayValue = mode === SolverMode.ANY_TILE ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
		reportLines.push(
			`Pick ${f}: count=${count} -> immediateScore=${newScore}, remainingDice=${newRemaining}, ${modeLabel}=${displayValue}`
		);

		if (value > bestValue) {
			bestValue = value;
			bestFace = f;
		}
	}

	const report = reportLines.join("\n");
	return { bestFace, report, probs, choices, mode };
}

/**
 * Runs both solver modes and provides combined analysis
 */
export function solveMultiMode(rolls: number[], targets: Target[], usedCounts: UsedCounts): MultiModeSolverResult {
	const anyTile = solve(rolls, targets, usedCounts, SolverMode.ANY_TILE);
	const highestScore = solve(rolls, targets, usedCounts, SolverMode.HIGHEST_SCORE);

	// Determine best tiles for each mode
	const anyTileBest: number[] = [];
	const highestScoreBest: number[] = [];
	const combined: number[] = [];

	// Find the best face(s) for any tile mode
	if (anyTile.bestFace !== null) {
		const bestValue = anyTile.probs[anyTile.bestFace];
		for (const [face, prob] of Object.entries(anyTile.probs)) {
			if (Math.abs(prob - bestValue) < 0.001) {
				// Handle floating point precision
				anyTileBest.push(Number(face));
			}
		}
	}

	// Find the best face(s) for highest score mode
	if (highestScore.bestFace !== null) {
		const bestValue = highestScore.probs[highestScore.bestFace];
		for (const [face, value] of Object.entries(highestScore.probs)) {
			if (Math.abs(value - bestValue) < 0.001) {
				// Handle floating point precision
				highestScoreBest.push(Number(face));
			}
		}
	}

	// Find faces that are best in either mode
	const allBest = new Set([...anyTileBest, ...highestScoreBest]);
	combined.push(...allBest);

	return {
		anyTile,
		highestScore,
		bestTiles: {
			anyTile: anyTileBest,
			highestScore: highestScoreBest,
			combined: combined.sort((a, b) => a - b)
		}
	};
}
