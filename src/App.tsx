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
	const [isPlayerManagementOpen, setIsPlayerManagementOpen] = useState(false);

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
		// clear ALL dice and reduce the number of dice available for next roll
		const totalUsedDice = Object.values(usedCounts).reduce((a, b) => a + b, 0) + cntInRoll;
		const remainingDiceCount = 8 - totalUsedDice;
		setDice(Array(remainingDiceCount).fill(0));
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

	// Helper to get used dice display
	const usedDiceDisplay = useMemo(() => {
		const used = [];
		for (const [face, count] of Object.entries(usedCounts)) {
			for (let i = 0; i < count; i++) {
				used.push(Number(face));
			}
		}
		return used.sort((a, b) => a - b);
	}, [usedCounts]);

	return (
		<div className="app">
			<header>
				<h1>🐛 Pickomino Solver</h1>
			</header>

			{/* Top scorebox spanning the screen */}
			<div className="top-scorebox">
				<div className="score-metrics">
					<div className="metric">
						<span className="metric-label">Current Player</span>
						<span className="metric-value">{players[currentPlayerIdx]?.name || "—"}</span>
					</div>
					<div className="metric">
						<span className="metric-label">Score</span>
						<span className="metric-value">{curScore}</span>
					</div>
					<div className="metric">
						<span className="metric-label">Remaining Dice</span>
						<span className="metric-value">{remainingDice}</span>
					</div>
					<div className="metric used-dice-metric">
						<span className="metric-label">Used Dice</span>
						<div className="used-dice">
							{usedDiceDisplay.length > 0 ? (
								usedDiceDisplay.map((face, i) => (
									<span key={i} className="used-die">
										{face === 6 ? "🐛" : face}
									</span>
								))
							) : (
								<span className="no-dice">None</span>
							)}
						</div>
					</div>
				</div>
				<div className="main-actions">
					<button
						className="action-btn new-turn"
						onClick={() => {
							setUsedCounts({});
							setDice(Array(8).fill(0));
						}}
					>
						New Turn
					</button>
					<button className="action-btn bust" onClick={onBust}>
						Bust
					</button>
				</div>
			</div>

			<main>
				<section className="left-col">
					<div className="card">
						<h2>Dice Pool</h2>
						<DiceGrid faces={dice} onTypeChange={setDieValue} />
						<div className="solver-report">
							<h3>Choices</h3>
							<div className="best-choice-text">Best choice: {solverOut.bestFace ?? "—"}</div>
							<div className="choices">
								{Object.entries(solverOut.probs).map(([face, p]) => {
									const choice = solverOut.choices?.[Number(face)];
									return (
										<button
											key={face}
											className={`choice ${
												Number(face) === solverOut.bestFace ? "choice-best" : ""
											}`}
											onClick={() => acceptPick(Number(face))}
										>
											<div className="choice-face">{face}</div>
											{choice && (
												<div className="choice-details">
													<div className="choice-metric">
														<span className="choice-label">🏆 %:</span>
														<span className="choice-value">
															{(choice.successProb * 100).toFixed(0)}%
														</span>
													</div>
													<div className="choice-metric">
														<span className="choice-label">🎲 Rem:</span>
														<span className="choice-value">{choice.remainingDice}</span>
													</div>
													<div className="choice-metric">
														<span className="choice-label">Score:</span>
														<span className="choice-value">{choice.immediateScore}</span>
													</div>
												</div>
											)}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</section>

				<section className="center-col card">
					<h2>Available Tiles</h2>
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
					<div className="player-controls card">
						<h3>Player Management</h3>
						<div className="current-player-selector">
							<label>Current Player:</label>
							<select
								value={currentPlayerIdx}
								onChange={e => setCurrentPlayerIdx(Number(e.target.value))}
								className="player-select"
							>
								{players.map((pl, i) => (
									<option key={i} value={i}>
										{pl.name}
									</option>
								))}
							</select>
						</div>

						<div className="players-management">
							<div
								className="players-management-header"
								onClick={() => setIsPlayerManagementOpen(!isPlayerManagementOpen)}
							>
								<h4>All Players</h4>
								<span className={`chevron ${isPlayerManagementOpen ? "open" : ""}`}>▶</span>
							</div>
							{isPlayerManagementOpen && (
								<div className="players-list-control">
									{players.map((pl, i) => (
										<div
											key={i}
											className={`player-control-item ${i === currentPlayerIdx ? "active" : ""}`}
										>
											<input
												value={pl.name}
												onChange={e =>
													setPlayers(prev => {
														const cp = [...prev];
														cp[i] = { ...cp[i], name: e.target.value };
														return cp;
													})
												}
												className="player-name-input"
											/>
											<button
												onClick={() => setCurrentPlayerIdx(i)}
												className="set-current-btn"
												disabled={i === currentPlayerIdx}
											>
												{i === currentPlayerIdx ? "Current" : "Set"}
											</button>
											{players.length > 1 && (
												<button onClick={() => removePlayer(i)} className="remove-player-btn">
													×
												</button>
											)}
										</div>
									))}
									{players.length < 8 && (
										<button onClick={addPlayer} className="add-player-btn">
											+ Add Player
										</button>
									)}
								</div>
							)}
						</div>
					</div>

					<div className="players-tiles card">
						<h3>Player Tiles</h3>
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
					</div>
				</section>
			</main>

			<footer>
				<small>MVP: heuristic solver. This app persists state to localStorage.</small>
			</footer>
		</div>
	);
}
