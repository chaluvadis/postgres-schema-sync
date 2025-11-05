import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";

interface CommandDefinition {
	command: string;
	handler: (...args: any[]) => any;
	description?: string;
	category?: string;
}

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
	 * Registers multiple commands from an array of command definitions.
	 * @param commands Array of command definitions to register.
	 */
	registerCommands(commands: CommandDefinition[]): void {
		commands.forEach(({ command, handler, description }) => {
			this.registerCommand(command, handler, description);
		});
	}

	/**
	 * Gets the number of registered commands.
	 * @returns The count of registered commands.
	 */
	getRegisteredCommandCount(): number {
		return this.registeredCommands.size;
	}

	/**
	 * Checks if a command is registered.
	 * @param command The command to check.
	 * @returns True if the command is registered.
	 */
	isCommandRegistered(command: string): boolean {
		return this.registeredCommands.has(command);
	}

	/**
	 * Gets all registered command names.
	 * @returns Array of registered command names.
	 */
	getRegisteredCommands(): string[] {
		return Array.from(this.registeredCommands);
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
