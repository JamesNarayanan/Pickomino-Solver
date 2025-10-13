import { Target, UsedCounts } from "./types";

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

export function computeCurrentScore(usedCounts: UsedCounts) {
	let s = 0;
	for (const kStr in usedCounts) {
		const f = Number(kStr);
		const c = usedCounts[f] || 0;
		s += (f === 6 ? 5 : f) * c;
	}
	return s;
}

export function findEligibleTiles(score: number, targets: Target[]) {
	const elig: Target[] = [];
	for (const t of targets) {
		if (t.canOvershoot) {
			if (score >= t.value) elig.push(t);
		} else {
			if (score === t.value) elig.push(t);
		}
	}
	return elig.sort((a, b) => b.value - a.value);
}

// A very small heuristic "solver" for the MVP. It receives a single roll (array of faces)
// and returns a recommended face to pick, a small textual report and approximate probabilities
// for each possible face pick. The probabilities are *heuristic* estimates based on expected
// remaining contribution from dice, not an exact exhaustive probability.

export function solve(roll: number[], targets: Target[], usedCounts: UsedCounts) {
	// faces present in the roll that are legal choices (not already used)
	const remainingDice = 8 - Object.values(usedCounts).reduce((a, b) => a + b, 0);
	const present = new Set<number>(roll);
	const legalFaces: number[] = [];
	for (const f of Array.from(present)) {
		if (!usedCounts[f]) legalFaces.push(f);
	}

	// current score if we don't pick anything yet
	const cur = computeCurrentScore(usedCounts);

	// expected value per remaining die (6 counts as 5)
	const expPerDie = (1 + 2 + 3 + 4 + 5 + 5) / 6;
	const expectedAdd = expPerDie * (remainingDice - 0); // pick doesn't change remaining dice for expectation

	// helper: estimate probability to reach tile value using normal approximation (very rough)
	function estimateProbToReach(targetValue: number, baseScore: number, remainingDiceEstimate: number) {
		const need = Math.max(0, targetValue - baseScore);
		if (need === 0) return 1;
		const expected = expPerDie * remainingDiceEstimate;
		// crude: if expected >= need, give moderate-to-good chance; otherwise low
		if (expected >= need) return Math.min(0.95, 0.5 + 0.5 * (expected / (need + 1)));
		return Math.max(0.01, (expected / (need + 1)) * 0.3);
	}

	const probs: Record<number, number> = {};
	let bestFace: number | null = null;
	let bestScore = -Infinity;
	const reportLines: string[] = [];

	for (const face of legalFaces) {
		const countInRoll = roll.filter(r => r === face).length;
		const added = (face === 6 ? 5 : face) * countInRoll;
		const newScore = cur + added;
		// remaining dice estimate after picking these copies
		const remEstimate = remainingDice - countInRoll;
		// compute probability to be able to claim *something* (any eligible tile)
		let probAny = 0;
		const eligNow = findEligibleTiles(newScore, targets);
		if (eligNow.length > 0 && (usedCounts[6] || (face === 6 && countInRoll > 0))) {
			// already claimable now and we have at least one worm set aside
			probAny = 1;
		} else {
			// otherwise, estimate probability of eventually reaching each target
			let bestP = 0;
			for (const t of targets) {
				if (!t.canOvershoot) {
					// for steal-only need exact hit; crude: estimate that remaining dice will produce exact equality (low)
					const p = estimateProbToReach(t.value, newScore, remEstimate) * 0.5;
					if (p > bestP) bestP = p;
				} else {
					const p = estimateProbToReach(t.value, newScore, remEstimate);
					if (p > bestP) bestP = p;
				}
			}
			probAny = bestP;
		}

		probs[face] = probAny;

		// heuristic score: prefer high immediate newScore, and high probAny
		const heuristic = newScore + probAny * 10;
		if (heuristic > bestScore) {
			bestScore = heuristic;
			bestFace = face;
		}

		reportLines.push(`Pick ${face}: immediateScore=${newScore} estProbAny=${(probAny * 100).toFixed(1)}%`);
	}

	const report = reportLines.join("\n");
	return { bestFace, report, probs };
}
