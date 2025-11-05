// VS Code Theme Integration for React Components
export const vscodeTheme = {
	colors: {
		background: "var(--vscode-editor-background)",
		foreground: "var(--vscode-editor-foreground)",
		border: "var(--vscode-panel-border)",
		accent: "var(--vscode-button-background)",
		accentForeground: "var(--vscode-button-foreground)",
		success: "var(--vscode-gitDecoration-addedResourceForeground)",
		error: "var(--vscode-gitDecoration-deletedResourceForeground)",
		warning: "var(--vscode-gitDecoration-modifiedResourceForeground)",
		info: "var(--vscode-gitDecoration-renamedResourceForeground)",
		focusBorder: "var(--vscode-focusBorder)",
		inputBackground: "var(--vscode-input-background)",
		inputForeground: "var(--vscode-input-foreground)",
		dropdownBackground: "var(--vscode-dropdown-background)",
		dropdownForeground: "var(--vscode-dropdown-foreground)",
		listActiveSelectionBackground: "var(--vscode-list-activeSelectionBackground)",
		listActiveSelectionForeground: "var(--vscode-list-activeSelectionForeground)",
		listHoverBackground: "var(--vscode-list-hoverBackground)",
		textLinkForeground: "var(--vscode-textLink-foreground)",
		textLinkActiveForeground: "var(--vscode-textLink-activeForeground)",
	},
	spacing: {
		xs: "4px",
		sm: "8px",
		md: "12px",
		lg: "16px",
		xl: "24px",
		xxl: "32px",
	},
	typography: {
		fontFamily: "var(--vscode-font-family)",
		fontSize: {
			xs: "11px",
			sm: "12px",
			md: "13px",
			lg: "14px",
			xl: "15px",
		},
		fontWeight: {
			normal: "var(--vscode-font-weight)",
			bold: "600",
		},
		lineHeight: "1.4",
	},
	borderRadius: {
		sm: "2px",
		md: "3px",
		lg: "6px",
	},
	shadows: {
		sm: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)",
		md: "0 3px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12)",
		lg: "0 10px 20px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.10)",
	},
};

// Utility function to get theme-aware styles
export const getThemeStyles = (component: string, variant?: string) => {
	const baseStyles = {
		fontFamily: vscodeTheme.typography.fontFamily,
		fontSize: vscodeTheme.typography.fontSize.md,
		color: vscodeTheme.colors.foreground,
		backgroundColor: vscodeTheme.colors.background,
	};

	switch (component) {
		case "button":
			return {
				...baseStyles,
				backgroundColor: vscodeTheme.colors.accent,
				color: vscodeTheme.colors.accentForeground,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.md,
				padding: `${vscodeTheme.spacing.sm} ${vscodeTheme.spacing.md}`,
				cursor: "pointer",
				fontSize: vscodeTheme.typography.fontSize.sm,
				fontWeight: vscodeTheme.typography.fontWeight.normal,
				transition: "all 0.2s ease",
				":hover": {
					backgroundColor: vscodeTheme.colors.listHoverBackground,
				},
				":focus": {
					outline: `1px solid ${vscodeTheme.colors.focusBorder}`,
					outlineOffset: "1px",
				},
			};

		case "input":
			return {
				...baseStyles,
				backgroundColor: vscodeTheme.colors.inputBackground,
				color: vscodeTheme.colors.inputForeground,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.sm,
				padding: `${vscodeTheme.spacing.sm} ${vscodeTheme.spacing.md}`,
				fontSize: vscodeTheme.typography.fontSize.sm,
				":focus": {
					outline: `1px solid ${vscodeTheme.colors.focusBorder}`,
					outlineOffset: "1px",
				},
			};

		case "card":
			return {
				...baseStyles,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.lg,
				boxShadow: vscodeTheme.shadows.sm,
				padding: vscodeTheme.spacing.lg,
			};

		default:
			return baseStyles;
	}
};
