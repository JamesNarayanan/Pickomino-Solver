import React from "react";
import { Target } from "../types";

export default function Tile({ tile, onClick }: { tile: Target; onClick?: () => void }) {
	return (
		<div className="tile" onClick={onClick}>
			<div className="tile-value">{tile.value}</div>
			<div className="tile-pts">{tile.pts} 🐛</div>
		</div>
	);
}
