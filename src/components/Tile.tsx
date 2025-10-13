import React from "react";
import { Target } from "../types";

export default function Tile({
	tile,
	onClick,
	small = false
}: {
	tile: Target;
	onClick?: () => void;
	small?: boolean;
}) {
	return (
		<div className={`tile ${small ? "tile-small" : ""}`} onClick={onClick}>
			<div className="tile-value">{tile.value}</div>
			<div className="tile-pts">{tile.pts} 🐛</div>
		</div>
	);
}
