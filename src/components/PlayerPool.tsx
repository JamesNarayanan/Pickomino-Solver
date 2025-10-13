import React from "react";
import Tile from "./Tile";
import { Target } from "../types";

export default function PlayerPool({
	name,
	tiles,
	onTileClick,
	editableName,
	onNameChange
}: {
	name: string;
	tiles: Target[];
	onTileClick?: (idx: number) => void;
	editableName?: boolean;
	onNameChange?: (s: string) => void;
}) {
	return (
		<div className="player-pool">
			<div className="player-header">
				{editableName ? (
					<input
						value={name}
						onChange={e => onNameChange && onNameChange(e.target.value)}
						className="player-name-header-input"
					/>
				) : (
					<div className="player-name">{name}</div>
				)}
			</div>
			<div className="player-tiles">
				{tiles.map((t, i) => (
					<Tile key={t.value + "-" + i} tile={t} onClick={() => onTileClick && onTileClick(i)} small />
				))}
			</div>
		</div>
	);
}
