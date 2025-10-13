// src/solver.ts
import { Target, UsedCounts } from "./types";

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
export function solve(rolls: number[], targets: Target[], usedCounts: UsedCounts) {
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

	// memoization map for probSuccess: key => probability
	const probMemo = new Map<string, number>();

	function probSuccess(remainingDice: number, score: number, usedMask: number): number {
		const key = `${remainingDice}|${score}|${usedMask}`;
		if (probMemo.has(key)) return probMemo.get(key)!;

		// if already success, probability is 1
		if (isSuccess(score, usedMask)) {
			probMemo.set(key, 1.0);
			return 1.0;
		}

		// no dice left and not successful -> 0
		if (remainingDice === 0) {
			probMemo.set(key, 0.0);
			return 0.0;
		}

		const n = remainingDice;
		const totalOutcomes = Math.pow(6, n);
		let totalProb = 0;

		// iterate all count vectors (counts[0] = face 1 count, ... counts[5] = face 6 count)
		for (const counts of genCountVectors(n, 6)) {
			// compute multinomial coefficient * (1/6)^n
			let ways = fact(n);
			for (let f = 0; f < 6; f++) {
				ways /= fact(counts[f]);
			}
			const pRoll = ways / totalOutcomes;

			// for this roll, determine legal picks (faces present and not already used)
			let bestPickProbForThisRoll = 0;
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

				let outcomeProb = 0;
				if (isSuccess(newScore, newUsedMask)) {
					outcomeProb = 1.0;
				} else {
					if (newRemaining === 0) outcomeProb = 0.0;
					else outcomeProb = probSuccess(newRemaining, newScore, newUsedMask);
				}

				if (outcomeProb > bestPickProbForThisRoll) bestPickProbForThisRoll = outcomeProb;
			}

			// If no legal picks at all in this roll, the player busts for this roll -> contributes 0
			if (!anyLegal) {
				// contributes zero; skip
			} else {
				totalProb += pRoll * bestPickProbForThisRoll;
			}
		}

		probMemo.set(key, totalProb);
		return totalProb;
	}

	// Build per-face probabilities for the current visible roll: if we pick face f now,
	// compute the probability of eventual success (taking into account remaining dice and optimal play).
	const probs: Record<number, number> = {};
	const choices: Record<
		number,
		{ count: number; immediateScore: number; remainingDice: number; successProb: number }
	> = {};
	let bestFace: number | null = null;
	let bestProb = -1;

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

		let prob = 0;
		if (isSuccess(newScore, newUsedMask)) {
			prob = 1.0;
		} else {
			if (newRemaining === 0) prob = 0.0;
			else prob = probSuccess(newRemaining, newScore, newUsedMask);
		}

		probs[f] = prob;
		choices[f] = {
			count,
			immediateScore: newScore,
			remainingDice: newRemaining,
			successProb: prob
		};
		reportLines.push(
			`Pick ${f}: count=${count} -> immediateScore=${newScore}, remainingDice=${newRemaining}, successProb=${(
				prob * 100
			).toFixed(2)}%`
		);
		if (prob > bestProb) {
			bestProb = prob;
			bestFace = f;
		}
	}

	const report = reportLines.join("\n");
	return { bestFace, report, probs, choices };
}
