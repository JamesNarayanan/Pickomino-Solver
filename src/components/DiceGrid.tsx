import React, { useEffect, useRef } from "react";

interface DiceGridProps {
	faces: number[];
	onTypeChange: (idx: number, v: number | null) => void;
}

export default function DiceGrid({ faces, onTypeChange }: DiceGridProps) {
	const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

	useEffect(() => {
		// keep ref array length
		inputsRef.current = inputsRef.current.slice(0, faces.length);
	}, [faces.length]);

	function onInputKey(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
		const val = (e.target as HTMLInputElement).value;

		if (e.key === "Backspace" && val === "") {
			// If backspace on empty field, go to previous field
			const prev = inputsRef.current[idx - 1];
			if (prev) {
				prev.focus();
				prev.select(); // Select all text so next keypress replaces it
			}
		} else if (val.length >= 1 && e.key !== "Backspace" && e.key !== "Delete") {
			// advance to next field when typing (but not on delete operations)
			const next = inputsRef.current[idx + 1];
			if (next) next.focus();
		}
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
		// Handle arrow key navigation
		if (e.key === "ArrowLeft") {
			const prev = inputsRef.current[idx - 1];
			if (prev) {
				e.preventDefault();
				prev.focus();
			}
		} else if (e.key === "ArrowRight") {
			const next = inputsRef.current[idx + 1];
			if (next) {
				e.preventDefault();
				next.focus();
			}
		}
	}

	return (
		<div className="dice-grid">
			<div className="dice-inputs">
				{faces.map((f, i) => (
					<input
						key={i}
						ref={el => {
							inputsRef.current[i] = el;
						}}
						className="die-input"
						maxLength={1}
						inputMode="numeric"
						value={f === 0 ? "" : f.toString()}
						onKeyUp={e => onInputKey(e, i)}
						onKeyDown={e => onKeyDown(e, i)}
						onChange={e => {
							const v = parseInt(e.target.value);
							if (!isNaN(v) && v >= 1 && v <= 6) onTypeChange(i, v);
							else if (e.target.value === "") onTypeChange(i, null);
						}}
						placeholder="?"
					/>
				))}
			</div>
		</div>
	);
}
