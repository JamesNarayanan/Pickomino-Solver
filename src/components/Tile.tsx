import React from "react";
import { Target } from "../types";

export default function Tile({ tile, onClick }: { tile: Target; onClick?: () => void }) {
	return (
		<div className={`tile ${tile.flipped ? "flipped" : ""}`} onClick={onClick}>
			<div className="tile-value">{tile.value}</div>
			<div className="tile-pts">
				{Array.from({ length: tile.pts }, (_, i) => (
					<span key={i}>🐛</span>
				))}
			</div>
		</div>
	);
}
