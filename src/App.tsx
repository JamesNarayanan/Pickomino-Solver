import React, { useEffect, useMemo, useState } from "react";
import DiceGrid from "./components/DiceGrid";
import PlayerPool from "./components/PlayerPool";
import Tile from "./components/Tile";
import {
	buildDefaultTargets,
	computeCurrentScore,
	findEligibleTiles,
	solve,
	solveMultiMode,
	SolverMode
} from "./solver";
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
	const [tileActionMenu, setTileActionMenu] = useState<{
		tile: Target;
		location: "main" | "player";
		playerIdx?: number;
		tileIdx?: number;
	} | null>(null);
	const [removePlayerConfirm, setRemovePlayerConfirm] = useState<{ playerIdx: number; playerName: string } | null>(
		null
	);

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
	const solverOut = useMemo(() => solveMultiMode(roll, targets, usedCounts), [roll, targets, usedCounts]);

	const curScore = computeCurrentScore(usedCounts);
	const remainingDice = 8 - Object.values(usedCounts).reduce((a, b) => a + b, 0);

	// Helper function to generate tooltips for desktop
	function getChoiceTooltip(isAnyTileBest: boolean, isHighestScoreBest: boolean): string {
		if (isAnyTileBest && isHighestScoreBest) {
			return "🟣 Optimal choice for any situation";
		} else if (isAnyTileBest) {
			return "🔵 Best to avoid failing - safest play when you're ahead";
		} else if (isHighestScoreBest) {
			return "🟢 Best to catch up - aggressive play to maximize wormage";
		} else {
			return "Available choice - not optimal for either strategy";
		}
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
		// clear ALL dice and reduce the number of dice available for next roll
		const totalUsedDice = Object.values(usedCounts).reduce((a, b) => a + b, 0) + cntInRoll;
		const remainingDiceCount = 8 - totalUsedDice;
		setDice(Array(remainingDiceCount).fill(0));
	}

	function finishTurn() {
		// only reset used dice, don't automatically advance player or claim tiles
		setUsedCounts({});
		setDice(Array(8).fill(0));
	}

	function flipTile(tile: Target) {
		setTargets(prev => prev.map(t => (t.value === tile.value ? { ...t, flipped: !t.flipped } : t)));
	}

	function moveTileToPlayer(
		tile: Target,
		targetPlayerIdx: number,
		fromLocation: "main" | "player",
		fromPlayerIdx?: number,
		fromTileIdx?: number
	) {
		// Remove from source
		if (fromLocation === "main") {
			setTargets(prev => prev.filter(t => t.value !== tile.value));
		} else if (fromLocation === "player" && fromPlayerIdx !== undefined && fromTileIdx !== undefined) {
			setPlayers(prev => {
				const p = [...prev];
				p[fromPlayerIdx] = {
					...p[fromPlayerIdx],
					tiles: p[fromPlayerIdx].tiles.filter((_, i) => i !== fromTileIdx)
				};
				return p;
			});
		}

		// Add to target player (reset flipped state when moving to player)
		setPlayers(prev => {
			const p = [...prev];
			p[targetPlayerIdx] = {
				...p[targetPlayerIdx],
				tiles: [...p[targetPlayerIdx].tiles, { ...tile, flipped: false }]
			};
			return p;
		});
	}

	function moveTileToMain(tile: Target, fromPlayerIdx: number, fromTileIdx: number) {
		// Remove from player
		setPlayers(prev => {
			const p = [...prev];
			p[fromPlayerIdx] = {
				...p[fromPlayerIdx],
				tiles: p[fromPlayerIdx].tiles.filter((_, i) => i !== fromTileIdx)
			};
			return p;
		});

		// Add to main pool (preserve flipped state, defaulting to false)
		setTargets(prev => [...prev, { ...tile, flipped: tile.flipped || false }].sort((a, b) => a.value - b.value));
	}

	function handleTileClick(tile: Target, location: "main" | "player", playerIdx?: number, tileIdx?: number) {
		// If tile is face down in main pool, flip it up directly
		if (location === "main" && tile.flipped) {
			flipTile(tile);
			return;
		}

		setTileActionMenu({ tile, location, playerIdx, tileIdx });
	}

	function addPlayer() {
		setPlayers(p => [...p, { name: `Player ${p.length + 1}`, tiles: [] }]);
	}

	function confirmRemovePlayer(idx: number) {
		setRemovePlayerConfirm({ playerIdx: idx, playerName: players[idx].name });
	}

	function removePlayer(idx: number) {
		// Return any tiles from the removed player back to the main pool
		const removedPlayer = players[idx];
		if (removedPlayer.tiles.length > 0) {
			setTargets(prev => [...prev, ...removedPlayer.tiles].sort((a, b) => a.value - b.value));
		}

		setPlayers(p => p.filter((_, i) => i !== idx));
		if (currentPlayerIdx >= players.length - 1) setCurrentPlayerIdx(0);
		else if (currentPlayerIdx > idx) setCurrentPlayerIdx(currentPlayerIdx - 1);
		setRemovePlayerConfirm(null);
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

	// Calculate total worms for current player
	const currentPlayerWorms = useMemo(() => {
		if (!players[currentPlayerIdx]) return 0;
		return players[currentPlayerIdx].tiles.reduce((total, tile) => total + tile.pts, 0);
	}, [players, currentPlayerIdx]);

	return (
		<div className="app">
			<header>
				<h1>🐛 Regenwormen Solver</h1>
			</header>

			{/* Top scorebox spanning the screen */}
			<div className="top-scorebox">
				<div className="score-metrics">
					<div className="metric">
						<span className="metric-label">Current Player</span>
						<select
							value={currentPlayerIdx}
							onChange={e => setCurrentPlayerIdx(Number(e.target.value))}
							className="player-select-top"
						>
							{players.map((pl, i) => (
								<option key={i} value={i}>
									{pl.name}
								</option>
							))}
						</select>
					</div>
					<div className="metric">
						<span className="metric-label">Worm Total</span>
						<span className="metric-value">{currentPlayerWorms} 🐛</span>
					</div>
					<div className="metric-separator"></div>
					<div className="metric">
						<span className="metric-label">Turn Score</span>
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
					<button className="action-btn finish-turn" onClick={finishTurn}>
						Finish Turn
					</button>
				</div>
			</div>

			<main>
				<section className="left-col">
					<div className="card">
						<h2>Roll</h2>
						<DiceGrid faces={dice} onTypeChange={setDieValue} />
						<div className="solver-report">
							<h3>Choices</h3>
							<div className="solver-modes">
								<div className="mode-section">
									<h4>🎯 Any Tile</h4>
									<div className="best-choice-text">Best: {solverOut.anyTile.bestFace ?? "—"}</div>
								</div>
								<div className="mode-section">
									<h4>🏆 Highest Score</h4>
									<div className="best-choice-text">
										Best: {solverOut.highestScore.bestFace ?? "—"}
									</div>
								</div>
							</div>
							<div className="choices">
								{Object.entries(solverOut.anyTile.probs).map(([face, p]) => {
									const anyTileChoice = solverOut.anyTile.choices?.[Number(face)];
									const highestScoreChoice = solverOut.highestScore.choices?.[Number(face)];
									const faceNum = Number(face);

									// Determine coloring based on which modes recommend this face
									const isAnyTileBest = solverOut.bestTiles.anyTile.includes(faceNum);
									const isHighestScoreBest = solverOut.bestTiles.highestScore.includes(faceNum);

									let choiceClass = "choice";
									if (isAnyTileBest && isHighestScoreBest) {
										choiceClass += " choice-both-best";
									} else if (isAnyTileBest) {
										choiceClass += " choice-any-tile-best";
									} else if (isHighestScoreBest) {
										choiceClass += " choice-highest-score-best";
									}

									return (
										<button
											key={face}
											className={choiceClass}
											title={getChoiceTooltip(isAnyTileBest, isHighestScoreBest)}
											onClick={() => acceptPick(faceNum)}
										>
											<div className="choice-face">{face === "6" ? "🐛" : face}</div>
											{anyTileChoice && (
												<div className="choice-details">
													<div className="choice-metric">
														<span className="choice-label">🏆 %:</span>
														<span className="choice-value">
															{(anyTileChoice.successProb * 100).toFixed(0)}%
														</span>
													</div>
													{highestScoreChoice?.expectedValue !== undefined && (
														<div className="choice-metric">
															<span className="choice-label">Exp 🐛:</span>
															<span className="choice-value">
																{highestScoreChoice.expectedValue.toFixed(1)}
															</span>
														</div>
													)}
													<div className="choice-metric">
														<span className="choice-label">🎲 Rem:</span>
														<span className="choice-value">
															{anyTileChoice.remainingDice}
														</span>
													</div>
													<div className="choice-metric">
														<span className="choice-label">Score:</span>
														<span className="choice-value">
															{anyTileChoice.immediateScore}
														</span>
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
							<Tile key={t.value} tile={t} onClick={() => handleTileClick(t, "main")} />
						))}
					</div>
				</section>

				<section className="right-col">
					<div className="players-tiles card">
						<h3>Players</h3>
						<div className="players-list">
							{players.map((pl, i) => {
								const playerWorms = pl.tiles.reduce((total, tile) => total + tile.pts, 0);
								return (
									<div key={i} className={`player-card ${i > 0 ? "player-card-spaced" : ""}`}>
										<div className="player-pool">
											<div className="player-header">
												<div className="player-name-with-worms">
													<input
														value={pl.name}
														onChange={e =>
															setPlayers(prev => {
																const cp = [...prev];
																cp[i] = { ...cp[i], name: e.target.value };
																return cp;
															})
														}
														className="player-name-header-input"
													/>
													<span className="player-worms">{playerWorms} 🐛</span>
													{players.length > 1 && (
														<button
															onClick={() => confirmRemovePlayer(i)}
															className="remove-player-btn-inline"
															title={`Remove ${pl.name}`}
														>
															×
														</button>
													)}
												</div>
											</div>
											<div className="player-tiles">
												{pl.tiles.map((t, tileIdx) => (
													<Tile
														key={t.value + "-" + tileIdx}
														tile={t}
														onClick={() => handleTileClick(t, "player", i, tileIdx)}
													/>
												))}
											</div>
										</div>
									</div>
								);
							})}
						</div>
						{players.length < 8 && (
							<div className="add-player-container">
								<button onClick={addPlayer} className="add-player-btn-centered">
									+ Add Player
								</button>
							</div>
						)}
					</div>
				</section>
			</main>

			{/* Tile Action Menu */}
			{tileActionMenu && (
				<div className="tile-action-overlay" onClick={() => setTileActionMenu(null)}>
					<div className="tile-action-menu" onClick={e => e.stopPropagation()}>
						<h3>Tile {tileActionMenu.tile.value}</h3>
						<div className="tile-actions">
							{/* Move to player actions */}
							<div className="action-section">
								<h4>Move to Player</h4>
								{players.map((player, idx) => {
									const isCurrentOwner =
										tileActionMenu.location === "player" && tileActionMenu.playerIdx === idx;
									return (
										<button
											key={idx}
											className={`action-btn player-action ${isCurrentOwner ? "disabled" : ""}`}
											disabled={isCurrentOwner}
											onClick={() => {
												if (isCurrentOwner) return;
												moveTileToPlayer(
													tileActionMenu.tile,
													idx,
													tileActionMenu.location,
													tileActionMenu.playerIdx,
													tileActionMenu.tileIdx
												);
												setTileActionMenu(null);
											}}
										>
											{player.name} {isCurrentOwner ? "(Current)" : ""}
										</button>
									);
								})}
							</div>

							{/* Move to main pool (if not already there) */}
							{tileActionMenu.location === "player" && (
								<div className="action-section">
									<button
										className="action-btn main-action"
										onClick={() => {
											if (
												tileActionMenu.playerIdx !== undefined &&
												tileActionMenu.tileIdx !== undefined
											) {
												moveTileToMain(
													tileActionMenu.tile,
													tileActionMenu.playerIdx,
													tileActionMenu.tileIdx
												);
											}
											setTileActionMenu(null);
										}}
									>
										Move to Main Pool
									</button>
								</div>
							)}

							{/* Flip tile (if in main pool) */}
							{tileActionMenu.location === "main" && (
								<div className="action-section">
									<button
										className="action-btn flip-action"
										onClick={() => {
											flipTile(tileActionMenu.tile);
											setTileActionMenu(null);
										}}
									>
										Flip Face Down
									</button>
								</div>
							)}
						</div>
						<button className="action-btn cancel-action" onClick={() => setTileActionMenu(null)}>
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* Remove Player Confirmation Dialog */}
			{removePlayerConfirm && (
				<div className="tile-action-overlay" onClick={() => setRemovePlayerConfirm(null)}>
					<div className="tile-action-menu" onClick={e => e.stopPropagation()}>
						<h3>Remove Player</h3>
						<p className="confirmation-text">
							Are you sure you want to remove <strong>{removePlayerConfirm.playerName}</strong>?
							{players[removePlayerConfirm.playerIdx]?.tiles.length > 0 && (
								<span className="warning-text">
									<br />
									📤 This player has {players[removePlayerConfirm.playerIdx].tiles.length} tile(s)
									that will be returned to the main pool.
								</span>
							)}
						</p>
						<div className="confirmation-actions">
							<button
								className="action-btn remove-confirm"
								onClick={() => removePlayer(removePlayerConfirm.playerIdx)}
							>
								Yes, Remove Player
							</button>
							<button className="action-btn cancel-action" onClick={() => setRemovePlayerConfirm(null)}>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
