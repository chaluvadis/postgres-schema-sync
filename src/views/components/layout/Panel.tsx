import React from 'react';
import { vscodeTheme } from '../../theme/vscode-theme';

export interface PanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  headerActions?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: keyof typeof vscodeTheme.spacing;
  maxHeight?: string | number;
  scrollable?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  children,
  className,
  style,
  headerActions,
  collapsible = false,
  defaultCollapsed = false,
  onToggle,
  variant = 'default',
  padding = 'lg',
  maxHeight,
  scrollable = false
}) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const handleToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onToggle?.(newCollapsed);
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'bordered':
        return {
          border: `1px solid ${vscodeTheme.colors.border}`,
          backgroundColor: vscodeTheme.colors.background
        };
      case 'elevated':
        return {
          border: `1px solid ${vscodeTheme.colors.border}`,
          backgroundColor: vscodeTheme.colors.background,
          boxShadow: vscodeTheme.shadows.md
        };
      default:
        return {
          backgroundColor: vscodeTheme.colors.inputBackground,
          border: `1px solid ${vscodeTheme.colors.border}`
        };
    }
  };

  const panelStyle: React.CSSProperties = {
    borderRadius: vscodeTheme.borderRadius.lg,
    overflow: 'hidden',
    ...getVariantStyles(),
    ...style
  };

  const contentStyle: React.CSSProperties = {
    padding: vscodeTheme.spacing[padding],
    maxHeight: maxHeight || (scrollable ? '400px' : undefined),
    overflow: scrollable ? 'auto' : 'visible'
  };

  return (
    <div className={className} style={panelStyle}>
      {title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${vscodeTheme.spacing.md} ${vscodeTheme.spacing[padding]}`,
          borderBottom: collapsed ? 'none' : `1px solid ${vscodeTheme.colors.border}`,
          backgroundColor: vscodeTheme.colors.inputBackground
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: vscodeTheme.spacing.sm
          }}>
            {collapsible && (
              <button
                onClick={handleToggle}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: vscodeTheme.spacing.xs,
                  borderRadius: vscodeTheme.borderRadius.sm,
                  color: vscodeTheme.colors.foreground,
                  opacity: 0.7,
                  fontSize: vscodeTheme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px'
                }}
                title={collapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {collapsed ? '▶' : '▼'}
              </button>
            )}
            <h3 style={{
              margin: 0,
              fontSize: vscodeTheme.typography.fontSize.md,
              fontWeight: 600,
              color: vscodeTheme.colors.foreground
            }}>
              {title}
            </h3>
          </div>

          {headerActions && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: vscodeTheme.spacing.sm
            }}>
              {headerActions}
            </div>
          )}
        </div>
      )}

      {!collapsed && (
        <div style={contentStyle}>
          {children}
        </div>
      )}
    </div>
  );
};