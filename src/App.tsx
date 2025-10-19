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
	const [tileActionMenu, setTileActionMenu] = useState<{
		tile: Target;
		location: "main" | "player";
		playerIdx?: number;
		tileIdx?: number;
	} | null>(null);

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
											<div className="choice-face">{face === "6" ? "🐛" : face}</div>
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
							<Tile key={t.value} tile={t} onClick={() => handleTileClick(t, "main")} />
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
											handleTileClick(pl.tiles[tileIdx], "player", i, tileIdx);
										}}
									/>
								</div>
							))}
						</div>
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
		</div>
	);
}
