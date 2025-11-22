import * as vscode from "vscode";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";

/**
 * Handles UI-related commands for the PostgreSQL extension.
 * Manages dashboard, notifications, and other UI components.
 */
export class UICommandHandlers {
	private components: ExtensionComponents;

	constructor(components: ExtensionComponents) {
		this.components = components;
	}

	/**
	 * Shows the dashboard.
	 */
	showDashboard(): void {
		if (this.components.dashboardView) {
			this.components.dashboardView.showDashboard();
			Logger.info("Dashboard opened successfully", "UICommandHandlers");
		} else {
			Logger.warn("Dashboard view not available", "UICommandHandlers");
			vscode.window.showErrorMessage("Dashboard view not available");
		}
	}

	/**
	 * Shows the notification center.
	 */
	showNotifications(): void {
		if (this.components.notificationManager) {
			this.components.notificationManager.showNotificationCenter();
			Logger.info("Notification center opened successfully", "UICommandHandlers");
		} else {
			Logger.warn("Notification manager not available", "UICommandHandlers");
			vscode.window.showErrorMessage("Notification manager not available");
		}
	}

	/**
	 * Shows active operations.
	 */
	showActiveOperations(): void {
		if (this.components.enhancedStatusBarProvider) {
			this.components.enhancedStatusBarProvider.showOperationDetails();
			Logger.info("Active operations view opened successfully", "UICommandHandlers");
		} else {
			Logger.warn("Enhanced status bar not available", "UICommandHandlers");
			vscode.window.showErrorMessage("Enhanced status bar not available");
		}
	}

	/**
	 * Shows schema drift report.
	 * @param comparisonId The comparison ID for the report.
	 */
	async showSchemaDriftReport(comparisonId?: string): Promise<void> {
		if (this.components.driftReportView && this.components.reportingService) {
			if (!comparisonId) {
				Logger.warn("No comparisonId provided for schema drift report", "UICommandHandlers");
				vscode.window.showErrorMessage("Comparison ID is required to show schema drift report");
				return;
			}
			await this.components.driftReportView.showReport(comparisonId);
			Logger.info("Schema drift report opened successfully", "UICommandHandlers", { comparisonId });
		} else {
			Logger.warn("Schema drift report view or reporting service not available", "UICommandHandlers");
			vscode.window.showErrorMessage("Schema drift report view not available");
		}
	}

	/**
	 * Shows query analytics.
	 */
	async showQueryAnalytics(): Promise<void> {
		if (this.components.queryAnalyticsView) {
			await this.components.queryAnalyticsView.showAnalytics();
			Logger.info("Query analytics opened successfully", "UICommandHandlers");
		} else {
			Logger.warn("Query analytics view not available", "UICommandHandlers");
			vscode.window.showErrorMessage("Query analytics view not available");
		}
	}

	/**
	 * Handles quick connect functionality.
	 */
	async handleQuickConnect(): Promise<void> {
		const connectionName = await vscode.window.showInputBox({
			prompt: "Enter connection name",
			placeHolder: "My Database Connection",
		});

		if (connectionName) {
			await vscode.commands.executeCommand("postgresql.addConnection");
			Logger.info("Quick connect initiated with name", "UICommandHandlers", {
				connectionName,
			});
		} else {
			Logger.info("Quick connect cancelled - no name provided", "UICommandHandlers");
		}
	}
}
