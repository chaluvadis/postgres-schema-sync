import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";

/**
 * Manages the registration of VS Code commands.
 * Handles command registration, disposal, and provides a clean interface for command management.
 */
export class CommandRegistry {
	private registeredCommands: Set<string> = new Set();
	private disposables: vscode.Disposable[] = [];

	/**
	 * Registers a command with VS Code.
	 * @param command The command identifier.
	 * @param handler The command handler function.
	 * @param description Optional description for the command.
	 */
	registerCommand(command: string, handler: (...args: any[]) => any, description?: string): void {
		try {
			const disposable = vscode.commands.registerCommand(command, async (...args: any[]) => {
				try {
					Logger.debug("Executing command", "CommandRegistry", {
						command,
						argCount: args.length,
					});
					await handler(...args);
					this.registeredCommands.add(command);
				} catch (error) {
					Logger.error("Command execution failed", error as Error, "CommandRegistry", {
						command,
						args: args.length,
					});
					throw error; // Re-throw to let caller handle
				}
			});

			this.disposables.push(disposable);
			this.registeredCommands.add(command);
			Logger.debug("Command registered successfully", "CommandRegistry", {
				command,
				description,
			});
		} catch (error) {
			Logger.error("Failed to register command", error as Error, "CommandRegistry", { command });
			throw error;
		}
	}

	/**
	 * Gets the number of registered commands.
	 * @returns The count of registered commands.
	 */
	getRegisteredCommandCount(): number {
		return this.registeredCommands.size;
	}
	/**
	 * Disposes all registered commands and clears the registry.
	 */
	dispose(): void {
		Logger.info("Disposing CommandRegistry", "CommandRegistry");
		this.disposables.forEach((disposable) => disposable.dispose());
		this.disposables = [];
		this.registeredCommands.clear();
		Logger.info("CommandRegistry disposed successfully", "CommandRegistry");
	}

	/**
	 * Gets the disposables array for external disposal management.
	 * @returns Array of disposables.
	 */
	getDisposables(): vscode.Disposable[] {
		return this.disposables;
	}
}
