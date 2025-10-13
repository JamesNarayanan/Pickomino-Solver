import React, { useEffect, useRef } from "react";
export default function DiceGrid({ faces, onToggle, onTypeChange }: DiceGridProps) {
	const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

	useEffect(() => {
		// keep ref array length
		inputsRef.current = inputsRef.current.slice(0, faces.length);
	}, [faces.length]);

	function onInputKey(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
		const val = (e.target as HTMLInputElement).value;
		if (val.length >= 1) {
			// advance to next
			const next = inputsRef.current[idx + 1];
			if (next) next.focus();
		}
	}

	return (
		<div className="dice-grid">
			<div className="dice-inputs">
				{faces.map((f, i) => (
					<input
						key={i}
						ref={el => (inputsRef.current[i] = el)}
						className="die-text"
						maxLength={1}
						inputMode="numeric"
						onKeyUp={e => onInputKey(e, i)}
						onChange={e => {
							const v = parseInt(e.target.value);
							if (!isNaN(v) && v >= 1 && v <= 6) onTypeChange(i, v);
							else if (e.target.value === "") onTypeChange(i, null);
						}}
						placeholder="-"
					/>
				))}
			</div>

			<div className="dice-row">
				{faces.map((f, i) => {
					const selected = f !== 0;
					return (
						<button
							key={i}
							className={`die ${selected ? "selected" : "unselected"}`}
							onClick={() => onToggle(i)}
						>
							{selected ? f : "-"}
						</button>
					);
				})}
			</div>
		</div>
	);
}
