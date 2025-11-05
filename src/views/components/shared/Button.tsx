import React, { useMemo } from "react";
import { vscodeTheme } from "../../theme/vscode-theme";

export interface ButtonProps {
	children: React.ReactNode;
	onClick: () => void;
	variant?: "primary" | "secondary" | "danger" | "success";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	loading?: boolean;
	fullWidth?: boolean;
	type?: "button" | "submit" | "reset";
	className?: string;
}

export const Button: React.FC<ButtonProps> = React.memo(
	({
		children,
		onClick,
		variant = "primary",
		size = "md",
		disabled = false,
		loading = false,
		fullWidth = false,
		type = "button",
		className = "",
	}) => {
		const buttonStyles = useMemo(() => {
			const sizeStyles = {
				sm: {
					padding: `${vscodeTheme.spacing.xs} ${vscodeTheme.spacing.sm}`,
					fontSize: vscodeTheme.typography.fontSize.xs,
				},
				md: {
					padding: `${vscodeTheme.spacing.sm} ${vscodeTheme.spacing.md}`,
					fontSize: vscodeTheme.typography.fontSize.sm,
				},
				lg: {
					padding: `${vscodeTheme.spacing.md} ${vscodeTheme.spacing.lg}`,
					fontSize: vscodeTheme.typography.fontSize.md,
				},
			};

			const variantStyles = {
				primary: {
					backgroundColor: vscodeTheme.colors.accent,
					color: vscodeTheme.colors.accentForeground,
					border: `1px solid ${vscodeTheme.colors.accent}`,
					":hover:not(:disabled)": {
						backgroundColor: vscodeTheme.colors.listHoverBackground,
						borderColor: vscodeTheme.colors.listHoverBackground,
					},
				},
				secondary: {
					backgroundColor: vscodeTheme.colors.background,
					color: vscodeTheme.colors.foreground,
					border: `1px solid ${vscodeTheme.colors.border}`,
					":hover:not(:disabled)": {
						backgroundColor: vscodeTheme.colors.listHoverBackground,
					},
				},
				danger: {
					backgroundColor: vscodeTheme.colors.error,
					color: vscodeTheme.colors.background,
					border: `1px solid ${vscodeTheme.colors.error}`,
					":hover:not(:disabled)": {
						opacity: 0.9,
					},
				},
				success: {
					backgroundColor: vscodeTheme.colors.success,
					color: vscodeTheme.colors.background,
					border: `1px solid ${vscodeTheme.colors.success}`,
					":hover:not(:disabled)": {
						opacity: 0.9,
					},
				},
			};

			return {
				fontFamily: vscodeTheme.typography.fontFamily,
				fontWeight: vscodeTheme.typography.fontWeight.normal,
				borderRadius: vscodeTheme.borderRadius.md,
				cursor: disabled || loading ? "not-allowed" : "pointer",
				transition: "all 0.2s ease",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: vscodeTheme.spacing.sm,
				width: fullWidth ? "100%" : "auto",
				opacity: disabled ? 0.6 : 1,
				...sizeStyles[size],
				...variantStyles[variant],
			} as React.CSSProperties;
		}, [variant, size, disabled, loading, fullWidth]);

		const handleClick = React.useCallback(() => {
			if (!disabled && !loading && onClick) {
				onClick();
			}
		}, [disabled, loading, onClick]);

		return (
			<button
				type={type}
				style={buttonStyles}
				onClick={handleClick}
				disabled={disabled || loading}
				className={className}
			>
				{loading && <Spinner size="sm" />}
				{children}
			</button>
		);
	},
);

// Simple spinner component
interface SpinnerProps {
	size?: "xs" | "sm" | "md" | "lg";
}

const Spinner: React.FC<SpinnerProps> = ({ size = "sm" }) => {
	const sizeMap = {
		xs: "8px",
		sm: "12px",
		md: "16px",
		lg: "20px",
	};

	return (
		<div
			style={{
				width: sizeMap[size],
				height: sizeMap[size],
				border: `2px solid ${vscodeTheme.colors.background}`,
				borderTop: `2px solid ${vscodeTheme.colors.accent}`,
				borderRadius: "50%",
				animation: "spin 1s linear infinite",
			}}
		/>
	);
};
