import React, { useEffect, useState } from "react";
import { Button } from "../components/shared/Button";
import { vscodeTheme } from "../theme/vscode-theme";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

interface DatabaseObject {
	id: string;
	name: string;
	type: "table" | "view" | "function" | "index" | "constraint" | "schema";
	schema: string;
	database: string;
	owner: string;
	sizeInBytes?: number;
	definition: string;
	properties: Record<string, any>;
	createdAt: Date;
	modifiedAt?: Date;
	dependencies: string[];
}

interface SchemaNode {
	id: string;
	name: string;
	type: "database" | "schema" | "table" | "view" | "function" | "index" | "constraint";
	children?: SchemaNode[];
	object?: DatabaseObject;
	expanded?: boolean;
	loading?: boolean;
}

export const SchemaBrowser: React.FC = () => {
	const [connections, setConnections] = useState<any[]>([]);
	const [selectedConnection, setSelectedConnection] = useState<string>("");
	const [schemaTree, setSchemaTree] = useState<SchemaNode[]>([]);
	const [selectedNode, setSelectedNode] = useState<SchemaNode | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		// Load connections on mount
		vscode.postMessage({ command: "getConnections" });

		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "connectionsLoaded":
					setConnections(message.connections);
					if (message.connections.length > 0 && !selectedConnection) {
						setSelectedConnection(message.connections[0].id);
						loadSchemaTree(message.connections[0].id);
					}
					break;
				case "schemaTreeLoaded":
					setSchemaTree(message.schemaTree);
					setLoading(false);
					break;
				case "objectDetailsLoaded":
					setSelectedNode((prev) => (prev ? { ...prev, object: message.object } : null));
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const loadSchemaTree = (connectionId: string) => {
		setLoading(true);
		vscode.postMessage({
			command: "loadSchemaTree",
			connectionId,
		});
	};

	const handleConnectionChange = (connectionId: string) => {
		setSelectedConnection(connectionId);
		setSchemaTree([]);
		setSelectedNode(null);
		loadSchemaTree(connectionId);
	};

	const handleNodeClick = (node: SchemaNode) => {
		if (node.type === "database" || node.type === "schema") {
			// Toggle expansion
			setSchemaTree((prev) => updateNodeExpansion(prev, node.id));
		} else {
			// Load object details
			setSelectedNode(node);
			vscode.postMessage({
				command: "loadObjectDetails",
				connectionId: selectedConnection,
				schema: node.object?.schema,
				objectName: node.name,
				objectType: node.type,
			});
		}
	};

	const updateNodeExpansion = (nodes: SchemaNode[], nodeId: string): SchemaNode[] => {
		return nodes.map((node) => {
			if (node.id === nodeId) {
				return { ...node, expanded: !node.expanded };
			}
			if (node.children) {
				return {
					...node,
					children: updateNodeExpansion(node.children, nodeId),
				};
			}
			return node;
		});
	};

	const filteredTree = searchTerm ? filterTreeBySearch(schemaTree, searchTerm.toLowerCase()) : schemaTree;

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				fontFamily: vscodeTheme.typography.fontFamily,
				backgroundColor: vscodeTheme.colors.background,
				color: vscodeTheme.colors.foreground,
			}}
		>
			{/* Sidebar */}
			<div
				style={{
					width: "300px",
					borderRight: `1px solid ${vscodeTheme.colors.border}`,
					display: "flex",
					flexDirection: "column",
				}}
			>
				{/* Connection Selector */}
				<div
					style={{
						padding: vscodeTheme.spacing.md,
						borderBottom: `1px solid ${vscodeTheme.colors.border}`,
					}}
				>
					<select
						value={selectedConnection}
						onChange={(e) => handleConnectionChange(e.target.value)}
						style={{
							width: "100%",
							padding: vscodeTheme.spacing.sm,
							backgroundColor: vscodeTheme.colors.inputBackground,
							color: vscodeTheme.colors.inputForeground,
							border: `1px solid ${vscodeTheme.colors.border}`,
							borderRadius: vscodeTheme.borderRadius.sm,
							fontSize: vscodeTheme.typography.fontSize.sm,
						}}
					>
						{connections.map((conn) => (
							<option key={conn.id} value={conn.id}>
								{conn.name} ({conn.host}:{conn.port})
							</option>
						))}
					</select>
				</div>

				{/* Search */}
				<div
					style={{
						padding: vscodeTheme.spacing.md,
						borderBottom: `1px solid ${vscodeTheme.colors.border}`,
					}}
				>
					<input
						type="text"
						placeholder="Search schema..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						style={{
							width: "100%",
							padding: vscodeTheme.spacing.sm,
							backgroundColor: vscodeTheme.colors.inputBackground,
							color: vscodeTheme.colors.inputForeground,
							border: `1px solid ${vscodeTheme.colors.border}`,
							borderRadius: vscodeTheme.borderRadius.sm,
							fontSize: vscodeTheme.typography.fontSize.sm,
						}}
					/>
				</div>

				{/* Schema Tree */}
				<div
					style={{
						flex: 1,
						overflow: "auto",
						padding: vscodeTheme.spacing.sm,
					}}
				>
					{loading ? (
						<div style={{ textAlign: "center", padding: vscodeTheme.spacing.lg }}>Loading schema...</div>
					) : (
						<SchemaTree nodes={filteredTree} onNodeClick={handleNodeClick} selectedNodeId={selectedNode?.id} />
					)}
				</div>
			</div>

			{/* Main Content */}
			<div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
				{/* Toolbar */}
				<div
					style={{
						padding: vscodeTheme.spacing.md,
						borderBottom: `1px solid ${vscodeTheme.colors.border}`,
						display: "flex",
						gap: vscodeTheme.spacing.sm,
					}}
				>
					<Button onClick={() => vscode.postMessage({ command: "refreshSchema" })} variant="secondary" size="sm">
						🔄 Refresh
					</Button>
					<Button onClick={() => vscode.postMessage({ command: "createMigration" })} variant="primary" size="sm">
						⚡ Create Migration
					</Button>
				</div>

				{/* Object Details */}
				<div
					style={{
						flex: 1,
						padding: vscodeTheme.spacing.lg,
						overflow: "auto",
					}}
				>
					{selectedNode ? (
						<ObjectDetails node={selectedNode} />
					) : (
						<div
							style={{
								textAlign: "center",
								padding: vscodeTheme.spacing.xxl,
								color: vscodeTheme.colors.foreground,
								opacity: 0.6,
							}}
						>
							Select an object from the schema tree to view its details
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

// Schema Tree Component
interface SchemaTreeProps {
	nodes: SchemaNode[];
	onNodeClick: (node: SchemaNode) => void;
	selectedNodeId?: string;
	level?: number;
}

const SchemaTree: React.FC<SchemaTreeProps> = ({ nodes, onNodeClick, selectedNodeId, level = 0 }) => {
	const getNodeIcon = (type: string) => {
		switch (type) {
			case "database":
				return "🗄️";
			case "schema":
				return "📁";
			case "table":
				return "📋";
			case "view":
				return "👁️";
			case "function":
				return "⚙️";
			case "index":
				return "🏷️";
			case "constraint":
				return "🔒";
			default:
				return "📄";
		}
	};

	return (
		<div>
			{nodes.map((node) => (
				<div key={node.id}>
					<div
						onClick={() => onNodeClick(node)}
						style={{
							display: "flex",
							alignItems: "center",
							padding: `${vscodeTheme.spacing.xs} ${vscodeTheme.spacing.sm}`,
							marginLeft: `${level * 16}px`,
							cursor: "pointer",
							backgroundColor:
								selectedNodeId === node.id ? vscodeTheme.colors.listActiveSelectionBackground : "transparent",
							borderRadius: vscodeTheme.borderRadius.sm,
							fontSize: vscodeTheme.typography.fontSize.sm,
						}}
					>
						{(node.type === "database" || node.type === "schema") && (
							<span style={{ marginRight: vscodeTheme.spacing.sm }}>{node.expanded ? "📂" : "📁"}</span>
						)}
						<span style={{ marginRight: vscodeTheme.spacing.sm }}>{getNodeIcon(node.type)}</span>
						<span style={{ flex: 1 }}>{node.name}</span>
						{node.children && node.children.length > 0 && (
							<span
								style={{
									fontSize: vscodeTheme.typography.fontSize.xs,
									opacity: 0.6,
								}}
							>
								({node.children.length})
							</span>
						)}
					</div>
					{node.expanded && node.children && (
						<SchemaTree
							nodes={node.children}
							onNodeClick={onNodeClick}
							selectedNodeId={selectedNodeId}
							level={level + 1}
						/>
					)}
				</div>
			))}
		</div>
	);
};

// Object Details Component
interface ObjectDetailsProps {
	node: SchemaNode;
}

const ObjectDetails: React.FC<ObjectDetailsProps> = ({ node }) => {
	if (!node.object) {
		return <div style={{ textAlign: "center", padding: vscodeTheme.spacing.xl }}>Loading object details...</div>;
	}

	const obj = node.object;

	return (
		<div>
			<div
				style={{
					marginBottom: vscodeTheme.spacing.lg,
					paddingBottom: vscodeTheme.spacing.md,
					borderBottom: `1px solid ${vscodeTheme.colors.border}`,
				}}
			>
				<h2
					style={{
						margin: 0,
						fontSize: vscodeTheme.typography.fontSize.lg,
						fontWeight: 600,
						display: "flex",
						alignItems: "center",
						gap: vscodeTheme.spacing.sm,
					}}
				>
					{node.type === "table" && "📋"}
					{node.type === "view" && "👁️"}
					{node.type === "function" && "⚙️"}
					{node.type === "index" && "🏷️"}
					{node.type === "constraint" && "🔒"}
					{obj.name}
				</h2>
				<div
					style={{
						marginTop: vscodeTheme.spacing.sm,
						fontSize: vscodeTheme.typography.fontSize.sm,
						color: vscodeTheme.colors.foreground,
						opacity: 0.7,
					}}
				>
					{obj.schema}.{obj.name} • {obj.type} • Owner: {obj.owner}
				</div>
			</div>

			{/* Properties */}
			<div style={{ marginBottom: vscodeTheme.spacing.lg }}>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.md,
						fontWeight: 600,
					}}
				>
					Properties
				</h3>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
						gap: vscodeTheme.spacing.sm,
					}}
				>
					<PropertyItem label="Type" value={obj.type} />
					<PropertyItem label="Schema" value={obj.schema} />
					<PropertyItem label="Owner" value={obj.owner} />
					<PropertyItem label="Created" value={new Date(obj.createdAt).toLocaleDateString()} />
					{obj.modifiedAt && <PropertyItem label="Modified" value={new Date(obj.modifiedAt).toLocaleDateString()} />}
					{obj.sizeInBytes && <PropertyItem label="Size" value={`${(obj.sizeInBytes / 1024).toFixed(2)} KB`} />}
				</div>
			</div>

			{/* Definition */}
			<div>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.md,
						fontWeight: 600,
					}}
				>
					Definition
				</h3>
				<pre
					style={{
						backgroundColor: vscodeTheme.colors.inputBackground,
						color: vscodeTheme.colors.inputForeground,
						padding: vscodeTheme.spacing.md,
						borderRadius: vscodeTheme.borderRadius.md,
						border: `1px solid ${vscodeTheme.colors.border}`,
						fontSize: vscodeTheme.typography.fontSize.sm,
						overflow: "auto",
						maxHeight: "400px",
					}}
				>
					{obj.definition}
				</pre>
			</div>
		</div>
	);
};

// Property Item Component
interface PropertyItemProps {
	label: string;
	value: string;
}

const PropertyItem: React.FC<PropertyItemProps> = ({ label, value }) => {
	return (
		<div
			style={{
				backgroundColor: vscodeTheme.colors.background,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.sm,
				padding: vscodeTheme.spacing.sm,
			}}
		>
			<div
				style={{
					fontSize: vscodeTheme.typography.fontSize.xs,
					color: vscodeTheme.colors.foreground,
					opacity: 0.7,
					marginBottom: vscodeTheme.spacing.xs,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: vscodeTheme.typography.fontSize.sm,
					fontWeight: 600,
					color: vscodeTheme.colors.foreground,
				}}
			>
				{value}
			</div>
		</div>
	);
};

// Utility function to filter tree by search term
const filterTreeBySearch = (nodes: SchemaNode[], searchTerm: string): SchemaNode[] => {
	return nodes.reduce((filtered: SchemaNode[], node) => {
		const matchesSearch = node.name.toLowerCase().includes(searchTerm);
		const filteredChildren = node.children ? filterTreeBySearch(node.children, searchTerm) : [];

		if (matchesSearch || filteredChildren.length > 0) {
			filtered.push({
				...node,
				children: filteredChildren.length > 0 ? filteredChildren : node.children,
				expanded: filteredChildren.length > 0 || matchesSearch,
			});
		}

		return filtered;
	}, []);
};
