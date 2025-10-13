import React, { useEffect, useMemo, useState } from "react";
import DiceGrid from "./components/DiceGrid";
import PlayerPool from "./components/PlayerPool";
import Tile from "./components/Tile";
import { buildDefaultTargets, computeCurrentScore, findEligibleTiles, solve } from "./solver";
import { Target } from "./types";

const STORAGE_KEY = "pickomino_state_v1";

type Player = { name: string; tiles: Target[] };

export default function App() {
	// game state
	const [targets, setTargets] = useState<Target[]>(() => buildDefaultTargets());
	const [players, setPlayers] = useState<Player[]>(() => [
		{ name: "Player 1", tiles: [] },
		{ name: "Player 2", tiles: [] }
	]);
	const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
	const [usedCounts, setUsedCounts] = useState<Record<number, number>>({});

	// dice faces as numbers: 0 = empty/unset, otherwise 1..6; there are 8 dice in total
	const [dice, setDice] = useState<number[]>(() => Array(8).fill(0));

	// persist/load
	useEffect(() => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				setTargets(parsed.targets || buildDefaultTargets());
				setPlayers(parsed.players || [{ name: "Player 1", tiles: [] }]);
				setCurrentPlayerIdx(parsed.currentPlayerIdx || 0);
				setUsedCounts(parsed.usedCounts || {});
			} catch (e) {
				console.warn("failed parse saved state");
			}
		}
	}, []);
	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ targets, players, currentPlayerIdx, usedCounts }));
	}, [targets, players, currentPlayerIdx, usedCounts]);

	// solver outputs for the current visible roll
	const roll = useMemo(() => dice.filter(d => d !== 0), [dice]);
	const solverOut = useMemo(() => solve(roll, targets, usedCounts), [roll, targets, usedCounts]);

	const curScore = computeCurrentScore(usedCounts);
	const remainingDice = 8 - Object.values(usedCounts).reduce((a, b) => a + b, 0);

	function toggleDie(idx: number) {
		setDice(prev => {
			const next = [...prev];
			if (next[idx] === 0) next[idx] = 1;
			else next[idx] = 0;
			return next;
		});
	}

	function setDieValue(idx: number, v: number | null) {
		setDice(prev => {
			const next = [...prev];
			next[idx] = v ?? 0;
			return next;
		});
	}

	function acceptPick(face: number) {
		// validate there are that many copies in current roll
		const cntInRoll = roll.filter(r => r === face).length;
		if (cntInRoll === 0) return;
		if (usedCounts[face]) return;
		setUsedCounts(prev => ({ ...prev, [face]: (prev[face] || 0) + cntInRoll }));
		// clear dice that were used (set to 0)
		setDice(prev => prev.map(d => (d === face ? 0 : d)));
	}

	function claimTile(tile: Target) {
		// only allow claim if current score qualifies and worm present
		if (curScore === 0) return;
		if ((usedCounts[6] || 0) === 0) return;
		const elig = findEligibleTiles(curScore, targets);
		const found = elig.find(t => t.value === tile.value);
		if (!found) return;
		// remove from targets and add to current player's pool
		setTargets(prev => prev.filter(t => t.value !== tile.value));
		setPlayers(prev => {
			const p = [...prev];
			p[currentPlayerIdx] = { ...p[currentPlayerIdx], tiles: [...p[currentPlayerIdx].tiles, tile] };
			return p;
		});
		// reset usedCounts and dice
		setUsedCounts({});
		setDice(Array(8).fill(0));
	}

	function onBust() {
		// if current player has any tiles, return their most recent to main pool
		setPlayers(prev => {
			const p = [...prev];
			const cur = { ...p[currentPlayerIdx] };
			if (cur.tiles.length > 0) {
				const returned = cur.tiles[cur.tiles.length - 1];
				cur.tiles = cur.tiles.slice(0, -1);
				// return to main pool and then flip highest main pool tile (remove highest)
				setTargets(tprev => {
					const inserted = [...tprev, returned].sort((a, b) => a.value - b.value);
					// flip (remove) the highest value tile
					const highest = inserted[inserted.length - 1];
					inserted.splice(inserted.length - 1, 1);
					return inserted;
				});
			}
			p[currentPlayerIdx] = cur;
			return p;
		});
		setUsedCounts({});
		setDice(Array(8).fill(0));
	}

	function giveTileToPlayer(tileValue: number, playerIdx: number) {
		// find tile in main pool
		const t = targets.find(x => x.value === tileValue);
		if (!t) return;
		setTargets(prev => prev.filter(x => x.value !== tileValue));
		setPlayers(prev => {
			const p = [...prev];
			p[playerIdx] = { ...p[playerIdx], tiles: [...p[playerIdx].tiles, t] };
			return p;
		});
	}

	function returnTileFromPlayer(playerIdx: number, tileIdx: number) {
		setPlayers(prev => {
			const p = [...prev];
			const cur = { ...p[playerIdx] };
			const returned = cur.tiles[tileIdx];
			cur.tiles = cur.tiles.filter((_, i) => i !== tileIdx);
			p[playerIdx] = cur;
			// return to main pool
			setTargets(tprev => [...tprev, returned].sort((a, b) => a.value - b.value));
			return p;
		});
	}

	function addPlayer() {
		setPlayers(p => [...p, { name: `Player ${p.length + 1}`, tiles: [] }]);
	}

	function removePlayer(idx: number) {
		setPlayers(p => p.filter((_, i) => i !== idx));
		if (currentPlayerIdx >= players.length - 1) setCurrentPlayerIdx(0);
	}

	return (
		<div className="app">
			<header>
				<h1>Pickomino Helper (MVP)</h1>
			</header>
			<main>
				<section className="left-col">
					<div className="controls">
						<label>
							Players:
							<div className="players-row">
								{players.map((pl, i) => (
									<div key={i} className={`player-pill ${i === currentPlayerIdx ? "active" : ""}`}>
										<input
											value={pl.name}
											onChange={e =>
												setPlayers(prev => {
													const cp = [...prev];
													cp[i] = { ...cp[i], name: e.target.value };
													return cp;
												})
											}
										/>
										<button onClick={() => setCurrentPlayerIdx(i)}>Set</button>
										<button onClick={() => removePlayer(i)}>x</button>
									</div>
								))}
								{players.length < 8 && <button onClick={addPlayer}>+ Add</button>}
							</div>
						</label>

						<div className="turn-buttons">
							<button
								onClick={() => {
									setUsedCounts({});
									setDice(Array(8).fill(0));
								}}
							>
								New Turn
							</button>
							<button onClick={onBust}>Bust</button>
						</div>

						<div className="scorebox">
							<div>Current Player: {players[currentPlayerIdx].name}</div>
							<div>Score: {curScore}</div>
							<div>Remaining dice (expected): {remainingDice}</div>
						</div>
					</div>

					<div className="dice-area">
						<DiceGrid faces={dice} onToggle={toggleDie} onTypeChange={setDieValue} />
						<div className="solver-report">
							<h3>Solver</h3>
							<div className="best">Best choice: {solverOut.bestFace ?? "—"}</div>
							<div className="choices">
								{Object.entries(solverOut.probs).map(([face, p]) => (
									<button
										key={face}
										className={`choice ${Number(face) === solverOut.bestFace ? "best" : ""}`}
										onClick={() => acceptPick(Number(face))}
									>
										<div className="choice-face">{face}</div>
										<div className="choice-prob">{(p * 100).toFixed(0)}%</div>
									</button>
								))}
							</div>
							<pre className="solver-text">{solverOut.report}</pre>
						</div>
					</div>
				</section>

				<section className="center-col">
					<h2>Main Pool</h2>
					<div className="main-pool">
						{targets.map(t => (
							<Tile
								key={t.value}
								tile={t}
								onClick={() => giveTileToPlayer(t.value, (currentPlayerIdx + 1) % players.length)}
							/>
						))}
					</div>
				</section>

				<section className="right-col">
					<h2>Players</h2>
					<div className="players-list">
						{players.map((pl, i) => (
							<div key={i} className="player-card">
								<PlayerPool
									name={pl.name}
									tiles={pl.tiles}
									editableName
									onNameChange={s =>
										setPlayers(prev => {
											const cp = [...prev];
											cp[i] = { ...cp[i], name: s };
											return cp;
										})
									}
									onTileClick={tileIdx => {
										if (i === currentPlayerIdx) return; // do not allow quick remove for self here
										// move tile from player i back to main pool
										returnTileFromPlayer(i, tileIdx);
									}}
								/>
							</div>
						))}
					</div>
				</section>
			</main>

			<footer>
				<small>MVP: heuristic solver. This app persists state to localStorage.</small>
			</footer>
		</div>
	);
}
